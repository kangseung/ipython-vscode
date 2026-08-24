#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""IPython kernel 管家：桥接 VS Code 扩展(stdio NDJSON) 与本地 ipykernel(ZMQ)。

手动 spawn ipykernel（避开 jupyter_client 8.x KernelManager 的 asyncio 坑），
用 BlockingKernelClient 走纯同步 ZMQ 通道。

协议：
  stdin  读 JSON 行命令：{"op":"execute","i":N,"code":...} {"op":"interrupt"} {"op":"restart"} {"op":"shutdown"}
  stdout 写 JSON 行事件：hello/busy/idle/exec_input/stream/result/display/error/notice/input

富显示策略：image/png 优先（matplotlib 内嵌图），无 PNG 时取 text/plain
（DataFrame 等按 IPython 原版文字表格渲染，不使用 text/html）。

调试：设置环境变量 IPYHOST_DEBUG=1 在 stderr 打印逐条 iopub。
"""
import atexit
import json
import os
import queue
import signal
import socket
import subprocess
import sys
import tempfile
import time
import threading

from jupyter_client import BlockingKernelClient
from jupyter_client.connect import write_connection_file

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DEBUG = os.environ.get("IPYHOST_DEBUG") == "1"


def dbg(*a):
    if DEBUG:
        sys.stderr.write("[dbg] " + " ".join(str(x) for x in a) + "\n")
        sys.stderr.flush()


def _rand_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def send(obj):
    line = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    dbg("SEND", line[:100])
    os.write(1, line.encode("utf-8") + b"\n")
class KernelHost:
    def __init__(self):
        self.proc = None
        self.kc = None
        self.cf = None
        self._start_cwd = os.getcwd()   # 扩展 spawn 时的目录（CWD 为空时的默认）
        self._file_reqs = {}            # req_id -> 文件路径（「运行文件」执行的 exec_input 回显用）
    # ---- 生命周期 ----
    def start(self):
        fd, self.cf = tempfile.mkstemp(prefix="ipyhost-", suffix=".json")
        os.close(fd)
        write_connection_file(
            self.cf,
            ip="127.0.0.1",
            shell_port=_rand_port(),
            iopub_port=_rand_port(),
            stdin_port=_rand_port(),
            control_port=_rand_port(),
            hb_port=_rand_port(),
        )
        send({"t": "boot", "text": "准备启动 ipykernel 子进程…"})
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "ipykernel_launcher", "-f", self.cf],
            stdout=subprocess.DEVNULL,
            stderr=None,  # kernel 日志透传到本进程 stderr（扩展可观测）
        )
        send({"t": "boot", "text": "连接内核通道（等待就绪）…"})
        self.kc = BlockingKernelClient(connection_file=self.cf)
        self.kc.load_connection_file()
        self.kc.start_channels()
        self.kc.wait_for_ready(timeout=20)  # 20 秒无响应即抛错 → launch_error 红字
        send({"t": "boot", "text": "内核就绪，启用 matplotlib inline…"})
        self._setup()
        self._announce()

    def _setup(self):
        # 自动启用 matplotlib inline（与 VS Code/Jupyter 默认一致）：图内嵌为 PNG。
        # silent 执行，不占 In 序号、不广播 execute_input。
        try:
            mid = self.kc.execute("%matplotlib inline", silent=True)
            while True:
                msg = self.kc.get_iopub_msg(timeout=10)
                if (msg.get("parent_header") or {}).get("msg_id") != mid:
                    continue
                if msg["msg_type"] == "status" \
                        and msg["content"].get("execution_state") == "idle":
                    break
        except Exception:
            pass  # 无 matplotlib 时静默跳过

    def restart(self, cwd=None):
        # cwd 为空串/None = 恢复默认（启动时目录，即跟随 VS Code 文件夹）。
        # 校验与 chdir 放在杀内核之前：目录无效时内核保持原样运行，错误由主循环上报。
        target = (cwd or "").strip()
        if target:
            if not os.path.isdir(target):
                raise FileNotFoundError("运行目录不是文件夹或不存在: %s" % target)
            os.environ["CWD"] = target
            os.chdir(target)
        else:
            os.environ["CWD"] = ""
            os.chdir(self._start_cwd)
        self._shutdown_kernel()
        self.start()

    def _shutdown_kernel(self):
        try:
            self.kc.stop_channels()
        except Exception:
            pass
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
        if self.cf and os.path.exists(self.cf):
            try:
                os.remove(self.cf)
            except Exception:
                pass
        self.proc = None
        self.kc = None

    def shutdown(self):
        self._shutdown_kernel()

    def is_alive(self):
        return bool(self.proc and self.proc.poll() is None)

    def _announce(self):
        try:
            import ipykernel
            iv = ipykernel.__version__
        except Exception:
            iv = "?"
        send({
            "t": "hello",
            "python": sys.version.split()[0],
            "python_path": sys.executable,
            "ipykernel": iv,
            "cwd": os.getcwd(),
        })

    @staticmethod
    def _spyder_wrap(code, filename):
        # 复刻 Spyder runfile 语义（namespace_manager + code_runner）：
        # 新建 __main__ 模块作为执行命名空间，exec 整个命名空间合并回 console。
        # 与 IPython %run 同源机制，但不依赖 spyder_kernels 包。
        # 效果：__file__/__name__/__package__/sys.argv 齐全，变量留 console，
        # 报错 traceback 定位真实文件与精确行号。
        # 先经 IPython 输入转换（与 cell 执行同一管道）：文件内 % 魔法、! 可用。
        try:
            from IPython.core.inputtransformer2 import TransformerManager
            code = TransformerManager().transform_cell(code)
        except Exception:
            pass
        import json as _json
        code_lit = _json.dumps(code, ensure_ascii=False)
        file_lit = _json.dumps(filename, ensure_ascii=False)
        return (
            "def __ipy_run(__ipy_code, __ipy_fn):\n"
            "    __tracebackhide__ = True\n"
            "    import types as __t\n"
            "    import sys as __s\n"
            "    ns = __t.ModuleType('__main__', doc='Module created for script run in IPython')\n"
            "    ns.__file__ = __ipy_fn\n"
            "    ns.__package__ = None\n"
            "    ns.__spec__ = None\n"
            "    ns.__nonzero__ = lambda: True\n"
            "    __saved = __s.argv\n"
            "    __s.argv = [__ipy_fn]\n"
            "    try:\n"
            "        exec(compile(__ipy_code, __ipy_fn, 'exec'), ns.__dict__)\n"
            "    finally:\n"
            "        __s.argv = __saved\n"
            "        ns.__dict__.pop('__file__', None)\n"
            "        try:\n"
            "            __user = get_ipython().user_ns\n"
            "            for __k, __v in ns.__dict__.items():\n"
            "                if not __k.startswith('__'):\n"
            "                    __user[__k] = __v\n"
            "        except Exception:\n"
            "            pass\n"
            "try:\n"
            "    __ipy_run(%s, %s)\n"
            "finally:\n"
            "    del __ipy_run\n" % (code_lit, file_lit)
        )

    def execute(self, req_id, code, file=None):
        # file 存在 = 「运行文件」：走 Spyder 等价执行（__file__ 等可用）
        if file is not None:
            code = self._spyder_wrap(code, file)
            self._file_reqs[req_id] = file
        send({"i": req_id, "t": "busy"})
        msg_id = self.kc.execute(code)
        dbg("execute", req_id, "mid", msg_id[:12])
        idle_seen = False
        last_notice = time.monotonic()
        while not idle_seen:
            try:
                msg = self.kc.get_iopub_msg(timeout=0.5)
                last_notice = time.monotonic()
            except queue.Empty:
                # input() 等请求走 stdin 通道，iopub 上不可见：轮询 stdin，
                # 收到 input_request 即回空串，防内核挂起（AGENTS.md 承诺行为）。
                try:
                    sm = self.kc.get_stdin_msg(timeout=0.05)
                except queue.Empty:
                    if not self.is_alive():
                        send({"i": req_id, "t": "error", "ename": "KernelError",
                              "evalue": "kernel process died",
                              "trace": "\x1b[91m内核进程已退出\x1b[0m"})
                        send({"i": req_id, "t": "idle"})
                        return
                    if time.monotonic() - last_notice >= 300:
                        last_notice = time.monotonic()
                        send({"i": req_id, "t": "notice", "text": "（仍在运行，已等待 300s…）"})
                    continue
                last_notice = time.monotonic()
                if sm.get("msg_type") == "input_request":
                    send({"i": req_id, "t": "input",
                          "prompt": (sm.get("content") or {}).get("prompt", "")})
                    self.kc.input("")
                continue
            mtype = msg["msg_type"]
            parent = (msg.get("parent_header") or {}).get("msg_id")
            dbg("iopub", mtype, "parent", (parent or "")[:12], "match", parent == msg_id)
            if parent != msg_id:
                continue
            content = msg.get("content", {})
            if mtype == "status":
                if content.get("execution_state") == "idle":
                    idle_seen = True
            elif mtype == "execute_input":
                # 「运行文件」时内核回显的是包装代码：替换为用户视角的 runfile 摘要
                # （与 Spyder 回显一致，避免 In[n] 倾倒整份包装+源码）
                if req_id in self._file_reqs:
                    send({"i": req_id, "t": "exec_input",
                          "count": content.get("execution_count"),
                          "code": "runfile(%s)" % json.dumps(self._file_reqs[req_id], ensure_ascii=False)})
                else:
                    send({"i": req_id, "t": "exec_input",
                          "count": content.get("execution_count"),
                          "code": content.get("code", "")})
            elif mtype == "stream":
                send({"i": req_id, "t": "stream",
                      "name": content.get("name"),
                      "text": content.get("text", "")})
            elif mtype == "display_data":
                self._emit_display(req_id, content.get("data") or {})
            elif mtype == "execute_result":
                data = content.get("data") or {}
                send({"i": req_id, "t": "result",
                      "count": content.get("execution_count"),
                      "text": data.get("text/plain", "")})
            elif mtype == "error":
                tb = "\n".join(content.get("traceback") or [])
                send({"i": req_id, "t": "error",
                      "ename": content.get("ename"),
                      "evalue": content.get("evalue"),
                      "trace": tb})
            elif mtype == "input_request":
                # 兼容：个别 ipykernel 版本可能在 iopub 上广播 input_request
                send({"i": req_id, "t": "input",
                      "prompt": content.get("prompt", "")})
                self.kc.input("")
        self._file_reqs.pop(req_id, None)
        send({"i": req_id, "t": "idle"})


    @staticmethod
    def _emit_display(req_id, data):
        png = data.get("image/png")
        if png:
            send({"i": req_id, "t": "display", "mime": "image/png", "data": png})
            return
        txt = data.get("text/plain")
        if txt is not None:
            send({"i": req_id, "t": "display", "mime": "text/plain", "data": txt})

    def interrupt(self):
        # 直接给 kernel 进程发 SIGINT：ipykernel 在消息处理期间把 SIGINT 换成
        # default_int_handler（kernelbase.py pre_handler_hook），SIGINT 转成
        # KeyboardInterrupt，iopub 返回 error（UI 显示红色 traceback）。
        # （client.interrupt_kernel() 走 control channel，只中断子进程、不打断
        #  主线程用户代码，故弃用。）
        if not self.is_alive():
            send({"t": "notice", "text": "内核未运行，无法中断"})
            return
        try:
            dbg("sending SIGINT to", self.proc.pid)
            os.kill(self.proc.pid, signal.SIGINT)
        except Exception as e:
            send({"t": "notice", "text": "interrupt failed: %s" % e})

    def complete(self, req_id, code, cursor_pos):
        try:
            # 发请求后按 msg_id 配匹收 reply（跳过滞留的 execute_reply 等，
            # 避免与 shell 通道上未消费消息错位）。
            msg_id = self.kc.complete(code, cursor_pos)
            reply = self.kc._recv_reply(msg_id, timeout=15)
            content = reply.get("content", {})
            # 剔除魔法命令候选（用户明确不需要 %/%% 开头项）
            matches = [m for m in content.get("matches", []) if not m.startswith("%")]
            send({"i": req_id, "t": "complete",
                  "matches": matches,
                  "start": content.get("cursor_start", cursor_pos),
                  "end": content.get("cursor_end", cursor_pos)})
        except Exception as e:
            send({"i": req_id, "t": "notice", "text": "complete failed: %s" % e})


def main():
    host = KernelHost()
    try:
        _cwd = os.environ.get("CWD", "")
        if _cwd:
            os.chdir(_cwd)   # 目录不存在时抛 FileNotFoundError → launch_error
        host.start()
    except Exception:
        import traceback
        send({"t": "launch_error",
              "text": "%s\n请检查 ipythonConsole.pythonPath 配置的解释器已安装 ipykernel 与 jupyter_client"
                      % traceback.format_exc()})
        sys.exit(1)
    atexit.register(host.shutdown)

    cmd_q = queue.Queue()

    def reader():
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except Exception:
                continue
            if req.get("op") == "interrupt":
                # 立即执行：主循环可能阻塞在 execute() 的 iopub 等待里，
                # 走队列会排不上队，永远打断不了长任务。
                host.interrupt()
            else:
                cmd_q.put(req)
        cmd_q.put(None)
    threading.Thread(target=reader, daemon=True).start()

    while True:
        req = cmd_q.get()
        if req is None:
            break
        op = req.get("op")
        try:
            if op == "execute":
                host.execute(req.get("i", 0), req.get("code", ""), req.get("file"))
            elif op == "interrupt":
                host.interrupt()
            elif op == "restart":
                host.restart(req.get("cwd"))
                send({"t": "notice", "text": "kernel restarted"})
            elif op == "complete":
                host.complete(req.get("i", 0), req.get("code", ""), req.get("cursor_pos", 0))
            elif op == "shutdown":
                break
        except Exception:
            import traceback
            send({"i": req.get("i", 0), "t": "error",
                  "ename": "HostError", "evalue": str(sys.exc_info()[1]),
                  "trace": traceback.format_exc()})

    host.shutdown()


if __name__ == "__main__":
    main()

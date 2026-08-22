'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let panel = undefined;
let kernelProc = undefined;   // 当前管家进程
let kernelBuf = '';
let reqCounter = 0;
let kernelReady = false;
let extContext = undefined;

function randomNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function getHtml(webview) {
  const htmlPath = path.join(__dirname, 'media', 'console.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const nonce = randomNonce();
  return html.replace(/\{\{nonce\}\}/g, nonce);
}

// 解释器解析顺序：配置 > /opt/anaconda3/bin/python > python3
function pythonPath() {
  const cfg = vscode.workspace.getConfiguration('ipythonConsoleDemo').get('pythonPath', '');
  if (cfg && fs.existsSync(cfg)) return cfg;
  const conda = '/opt/anaconda3/bin/python';
  if (fs.existsSync(conda)) return conda;
  return 'python3';
}
// 运行目录解析顺序：配置 workingDir > 当前打开的 workspace 文件夹 > 空（用管家默认）
function resolveCwd() {
  const cfg = vscode.workspace.getConfiguration('ipythonConsoleDemo').get('workingDir', '');
  if (cfg) return cfg;
  const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (ws) return ws.uri.fsPath;
  return '';
}

function notify(ev) {
  if (panel) {
    panel.webview.postMessage(Object.assign({ type: 'kernel' }, ev));
  }
}

function sendProc(payload) {
  if (!kernelProc || kernelProc.exitCode !== null) {
    notify({ t: 'status', text: '内核未连接：请等待就绪，或点击“重启内核”' });
    return;
  }
  kernelProc.stdin.write(JSON.stringify(payload) + '\n');
}

function startKernel() {
  if (kernelProc && kernelProc.exitCode === null) return;
  reqCounter = 0;
  const py = pythonPath();
  const cwd = resolveCwd();
  notify({ t: 'status', text: '正在启动 IPython kernel（' + py + '）…' });
  let proc;
  try {
    proc = spawn(py, [path.join(__dirname, 'kernel_host.py')], { stdio: ['pipe', 'pipe', 'pipe'], env: cwd ? Object.assign({}, process.env, { CWD: cwd }) : process.env });
  } catch (err) {
    notify({ t: 'launch_error', text: String(err) });
    return;
  }
  kernelProc = proc;
  kernelReady = false;
  kernelBuf = '';
  notify({ t: 'status', text: '管家进程已启动（pid ' + proc.pid + '），等待输出…' });

  let gotAnyOutput = false;   // 看门狗：3 秒无任何 stdout 输出则报错

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    if (proc !== kernelProc) return;   // 旧进程的消息一律忽略
    gotAnyOutput = true;
    kernelBuf += d;
    let idx;
    while ((idx = kernelBuf.indexOf('\n')) >= 0) {
      const line = kernelBuf.slice(0, idx).trim();
      kernelBuf = kernelBuf.slice(idx + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.t === 'hello') kernelReady = true;
      notify(ev);
    }
  });

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => {
    if (proc === kernelProc) notify({ t: 'host_stderr', text: d });
  });

  // 看门狗：管家已启动但 3 秒无输出 → 解释器或脚本有问题
  setTimeout(() => {
    if (proc === kernelProc && !gotAnyOutput) {
      notify({ t: 'launch_error', text: '管家已启动但 3 秒无任何输出。\n解释器 ' + py + ' 可能缺少 ipykernel/jupyter_client，或无法运行 kernel_host.py。\n（若上方有（内核日志）请一并查看）' });
    }
  }, 3000);

  proc.on('error', (err) => {
    if (proc !== kernelProc) return;
    kernelProc = undefined;
    kernelReady = false;
    notify({ t: 'launch_error', text: '管家进程启动失败：' + String(err) + '\n解释器：' + pythonPath() });
  });

  proc.on('exit', (code) => {
    if (proc !== kernelProc) return;   // 已被 stopKernel 替换/清理
    kernelProc = undefined;
    if (!kernelReady) {
      notify({ t: 'launch_error', text: '管家进程启动失败（exit ' + code + '）\n解释器：' + pythonPath() + '\n请确认该解释器已安装 ipykernel 与 jupyter_client' });
    } else {
      kernelReady = false;
      notify({ t: 'status', text: '内核进程已退出（exit ' + code + '）' });
    }
  });
}

// 关闭控制台 = 真正终止管家与内核进程（不再有后台残留）
function stopKernel() {
  if (!kernelProc) return;
  const proc = kernelProc;
  kernelProc = undefined;
  kernelReady = false;
  if (proc.exitCode === null) {
    try { proc.stdin.write(JSON.stringify({ op: 'shutdown' }) + '\n'); } catch (e) { /* 无关 */ }
    setTimeout(() => {
      if (proc.exitCode === null) {
        try { proc.kill(); } catch (e) { /* 无关 */ }
      }
    }, 800);
  }
}

function restartKernel() {
  notify({ t: 'status', text: '正在重启内核…' });
  if (kernelProc && kernelProc.exitCode === null) {
    sendProc({ op: 'restart', cwd: resolveCwd() || undefined });
  } else {
    startKernel();
  }
}

// 退出确认（原生模态弹窗）。tab 上的 × 无法被扩展拦截，此为受控退出路径。
function quitWithConfirm() {
  if (!panel) return;
  vscode.window.showWarningMessage(
    '关闭 IPython 控制台并终止内核进程？',
    { modal: true },
    '关闭',
    '取消'
  ).then((choice) => {
    if (choice === '关闭') {
      panel.dispose();
    }
  });
}

// 打开/复用右侧面板；preserveFocus=true 时不抢占编辑器焦点
function ensurePanel(preserveFocus) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
    pinEditorTab();
    if (!kernelReady) startKernel();
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'ipyConsoleDemo',
    'IPython Console',
    preserveFocus
      ? { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }
      : vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: []
    }
  );
  panel.webview.html = getHtml(panel.webview);
  panel.webview.onDidReceiveMessage((msg) => {
    switch (msg.type) {
      case 'connect': startKernel(); break;
      case 'execute': sendProc({ op: 'execute', i: ++reqCounter, code: msg.code }); break;
      case 'complete': sendProc({ op: 'complete', i: ++reqCounter, code: msg.code, cursor_pos: msg.cursorPos }); break;
      case 'interrupt': sendProc({ op: 'interrupt' }); break;
      case 'restart': restartKernel(); break;
      case 'quit': quitWithConfirm(); break;
      default: break;
    }
  }, null, extContext.subscriptions);
  panel.onDidDispose(() => {
    panel = undefined;
    stopKernel();
  }, null, extContext.subscriptions);
  pinEditorTab();
  startKernel();
}

function activate(context) {
  extContext = context;
  context.subscriptions.push(
    vscode.commands.registerCommand('ipyDemo.open', () => {
      ensurePanel(false);
    }),
    vscode.commands.registerCommand('ipyDemo.sendSelection', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return;
      const sel = ed.selection;
      let code;
      if (!sel.isEmpty) {
        code = ed.document.getText(sel);
      } else {
        code = ed.document.lineAt(sel.start.line).text;
      }
      if (!code.trim()) return;
      ensurePanel(true);
      if (!kernelProc) startKernel();
      sendProc({ op: 'execute', i: ++reqCounter, code: code });
    }),
    vscode.commands.registerCommand('ipyDemo.changeOpenKeybinding', () => {
      vscode.commands.executeCommand('workbench.action.openKeybindings', 'ipyDemo.open');
    }),
    vscode.commands.registerCommand('ipyDemo.changeSendKeybinding', () => {
      vscode.commands.executeCommand('workbench.action.openKeybindings', 'ipyDemo.sendSelection');
    })
  );
}

// 标签默认 Pin（锁住）防误关：pinned tab 原生隐藏 × 按钮。
function pinEditorTab() {
  setTimeout(() => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!tab || !tab.input || !(tab.input.viewType === 'ipyConsoleDemo')) {
      return;
    }
    vscode.commands.executeCommand('workbench.action.pinEditor').then(undefined, () => {});
  }, 150);
}

function deactivate() {
  stopKernel();
}

module.exports = { activate, deactivate };

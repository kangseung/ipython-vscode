# AGENTS.md — IPython Console(VS Code 扩展)

给无上下文的 AI/开发者看的项目操作手册。**改代码前先读本文件**;改完按「验证」节自检。

## 这是什么

VS Code 扩展 `ipython-vscode`(displayName **IPython Console**):Spyder 风格的 IPython 控制台,
驱动**真实 ipykernel**(严禁模拟)。右侧 Beside webview 面板:流式输出、DataFrame 文字表格、
matplotlib 内嵌图、补全、历史、中断、一键运行当前文件。

## 架构(三端各自独立,经消息衔接)

```
media/console.html(webview UI) ⇄ postMessage ⇄ extension.js(Node/VS Code 侧) ⇄ NDJSON stdio ⇄ kernel_host.py(Python 管家) ⇄ ZMQ ⇄ ipykernel(子进程)
```

- **extension.js**:面板生命周期、命令、spawn 管家、NDJSON 桥接、配置下发。`main` 入口。
- **kernel_host.py**:手动 spawn `ipykernel_launcher`(避开 jupyter_client 8.x asyncio 问题),
  `BlockingKernelClient` 同步消息循环;execute/complete/interrupt/restart/shutdown;
  富显示(image/png 优先,否则 text/plain);中断用 `os.kill(pid, SIGINT)`;
  `input()` 请求自动回空串防挂起;`CWD` 环境变量/restart.cwd 控制运行目录。
- **media/console.html**:纯原生 JS(零依赖)。两个 script 块:
  `id="pure"` 纯函数段(esc/ansiToHtml/ANSI_COLORS,可被 node 提取测试)+ 主逻辑 IIFE。

## 命名契约(改代码必守,严禁回退)

- 命令:`ipy.*`(open / runFile / sendSelection / changeOpenKeybinding / changeSendKeybinding),activationEvents 与 menus 引用同值
- 设置:`ipythonConsole.*`(pythonPath / workingDir / runMode / outputBackground / outputForeground / outputPromptIn / outputPromptOut / outputStderr / outputMuted)
- viewType:`ipythonConsole`(createWebviewPanel 与 `onWebviewPanel:ipythonConsole` 同值)
- state key:`ipythonConsoleCwd`(workspaceState)
- publisher:`jiangsheng`;`package.json` 版本号与前端 banner(console.html 里 `前端 vX.Y.Z`)必须同步
- **禁止出现 `Demo`/`demo` 字样**(历史残留,已全部清除,勿再引入)

## 消息协议

webview → extension(`postMessage` type):`connect` / `execute` / `complete` / `interrupt` / `restart` / `runMode` / `cwd` / `pickCwd` / `quit`

extension → host(stdin 每行一个 JSON):`{op: execute|complete|interrupt|restart|shutdown, i, code, cursor_pos}`;
`execute` 运行文件时附加 `file`(绝对路径,host 按 Spyder runfile 语义执行);
`restart` 必须携带 `cwd`(空串 = 恢复默认目录,host 回退到启动时目录)

host → extension(stdout 每行一个 JSON):`{t: hello|boot|busy|idle|exec_input|stream|result|display|error|notice|status|launch_error|host_stderr}`;
`hello` 带 `python`/`python_path`/`ipykernel`/`cwd`;执行循环到 `idle` 结束一轮

extension → webview(包装为 `{type:'kernel', ...}`):上述 host 事件 + 附加 `runMode`、`colors`(输出配色)、`cwd_picked`(目录选择器回填)

## 关键机制(改动时不要破坏)

1. **内核生命周期 = 面板生命周期**:关闭面板 /「退出」→ 真杀内核进程(零残留)。
   `startKernel()` 幂等(已在跑则直接返回);`stopKernel()` 发 shutdown 后 800ms 兜底 kill。
   `deactivate()` 里同样 stopKernel。
2. **pendingRun 补发**:内核未就绪时的 `execute`/从头跑请求暂存 `pendingRun`(对象 `{code, file}`),收到 `hello` 自动补发;
   `stopKernel` 清空。新增任何"发代码"路径时复用该机制(不要只 sendProc 不处理启动竞态)。
3. **配置下发**:webview 无法读 vscode 配置。`outputColors()`+`pushColors()`(colors 事件)在
   connect、建面板、`onDidChangeConfiguration` 三处下发;前端写 `--console-*` CSS 变量并实时生效。
   配色默认白底 qtconsole 风格;**ANSI 16 色按白底优化**,深底需用户自行调亮(README 已提示)。
4. **流式输入(Spyder 式)**:`#inputbar` 位于 `#output`(滚动容器)**内部末尾**,随输出流移动;
   `In[n]` 显示下一真实编号(exec_input 的 count+1,内核权威)。**所有输出追加必须
   `output.insertBefore(el, inputbar)`**;禁止 `output.appendChild`(会插到输入栏后面);
   `clearScreen()` 先 `output.appendChild(inputbar)` 再清区;trimNode 从头删,inputbar 在尾安全。
5. **运行模式**:`runMode` = `append` 接着跑(直接注入当前内核)/ `fresh` 从头跑(内核**已就绪**才
   restart,未就绪时新内核天然 fresh,统一走 pendingRun 补发)。此判定的写法见 `runCurrentFile`。
6. **UI 优先于配置**:工具栏「目录」输入框的 UI 指定值优先于 `ipythonConsole.workingDir`(设置项仅兜底);
   UI 改动(目录/运行模式)同步写机器级设置 `ConfigurationTarget.Global`。
7. **富显示策略在 host**:`display` 只发 `image/png` 或 `text/plain`;DataFrame 用 IPython 原生
   `to_string` 文字表格,勿改用 text/html。
8. **运行文件(播放键)= Spyder runfile 语义**:`runCurrentFile` 对磁盘文件给 execute 附 `file`;
   host `_spyder_wrap` 新建 `__main__` 模块命名空间(`__file__`/`__name__`/`__package__`/`__spec__`/
   `sys.argv` 齐全;代码先经 IPython 输入转换,文件内 `%` 魔法可用),执行后整 ns 合并回 console
   (变量可查)、pop `__file__`、恢复 `sys.argv`;`exec_input` 回显为 `runfile("<path>")` 摘要
   (勿改回全量,In[n] 会倾倒包装代码)。不带 `file` 的 execute(输入框/选区)保持单元格语义
   (无 `__file__`,与 Jupyter 一致)。`input()` 请求走 stdin 通道:execute 循环短轮询
   `get_stdin_msg`,收到 `input_request` 即回空串,防内核挂起(勿改回只在 iopub 上处理)。

## 构建 / 发布

- 打包:`npx @vscode/vsce package`——**扩展图标必须 PNG**(`media/icon.png`;vsce 拒绝 SVG);
  vsce 只认根 `README.md` 为市场 README(自定义 readme 路径官方不支持);`DEVELOPMENT.md` 已被
  `.vscodeignore` 排除出包;`.vscodeignore` 必须保留 `*.vsix`(防打包产物打自己)。
- 发布:`npx @vscode/vsce publish`——publisher 必须为 `jiangsheng`(已登录 PAT);
  市场不接受重复版本号,发新版先做「三处版本标记同步」再打包提交。
- **发版三处同步(缺一即未完成)**:`package.json` 版本号、`media/console.html` 前端
  banner(`前端 vX.Y.Z`)、`CHANGELOG.md` 新版本条目,三者一致;CHANGELOG 按 Keep a
  Changelog 格式记「修复/新增」条目,版本号与 package.json 同步。
- **改代码必更文档 + 必重编译**:用户可见行为改动(设置项/命令/快捷键/输出/渲染)必须
  同步 `README.md`(设置表/快速上手/说明);每次改动后重新 `npx @vscode/vsce package`
  编译产物——代码 / 文档 / 产物必须同批提交,不允许只提交代码而漏文档或产物。
- 仓库保持含打包产物 `ipython-vscode-<version>.vsix`,发新版时同步替换(rename)并 commit。

## 验证(每次改动后必做)

```bash
node --check extension.js
/opt/anaconda3/bin/python -m py_compile kernel_host.py   # 或任意含 ipykernel 的解释器
```

- 前端两个 `<script>` 块提取后分别 `node --check`(用 python 正则提取)
- host 冒烟:管道喂 `kernel_host.py`,读 `hello` → execute `6*7` 得 42 → `shutdown` 干净退出
- package.json 断言:命令/activationEvents 一一对应、menus 只剩 `editor/title`+`editor/context`、无 Demo 残留
- 文档/产物一致性:grep 版本号三处一致(`package.json` / banner / `CHANGELOG.md` 顶部);
  `ls *.vsix` 为当前版本产物;README 设置表与 package.json 配置项一致

## 已知限制(别当成 bug 修)

- `\r`(tqdm 进度条)为追加渲染,不覆盖刷新
- `input()` 自动回空字符串(不阻塞内核)
- 含调用的表达式补全(如 `df.cumsum().plot`)依赖内核求值,部分场景无候选
- 单条显示超过 ~15 万字符自动截断

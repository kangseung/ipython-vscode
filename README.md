# IPython Console（VS Code 扩展）

Spyder 风格的 VS Code 右侧 IPython 控制台：真实 ipykernel 内核、流式输出、
DataFrame 文字表格、matplotlib 内嵌图、补全、历史、中断，独立于 Jupyter
扩展与系统终端，轻量且不抢占焦点。

## 功能

- **真实内核**：直接驱动 ipykernel（非模拟），支持任意 Python 生态
- **流式输出**：`print` 逐行实时显示，长任务进度可见
- **富显示**：
  - matplotlib → 内嵌 PNG 图（自动注入 `%matplotlib inline`）
  - DataFrame / Series → 原版文字表格（`to_string`）
  - 执行结果（`_`）→ 富 repr；1/0 等零宽结果自动抑制
- **彩色 traceback**：红色 Traceback / 橙色异常名 / 蓝色模块行
- **补全**：Tab 弹出候选面板，支持 `df.属性` 风格联想，↑↓ 选择 + 回车
  替换词根，点选插入；魔发命令（`%` 开头）已过滤
- **历史**：↑↓ 按行遍历（qtconsole 语义），输入半行时 ↑ 先取草稿再进历史
- **中断**：输入框内 `Ctrl+C`（有选区=复制，无选区=中断），约 0.1 秒生效
- **发送代码**：编辑器中 `Shift+Enter` 发送选区/当前行到控制台（自动开面板）
- **生命周期**：
  - 关闭面板（×）或点工具栏「退出」→ **真正终止内核进程**，系统零残留
  - 标签默认 Pin 防误关；「重启内核」= 保留变量快速重建
- **不自动恢复**：窗口重开后控制台不自动弹出，需要时再开

## 快速开始

### 启动扩展开发窗口（二选一）

```bash
code --extensionDevelopmentPath=<本目录绝对路径> --new-window
```

或在 VS Code 中打开本目录后按 **F5**（弹出扩展开发宿主窗口）。

> **注意**：必须是扩展开发窗口（标题含 `[扩展开发宿主]`）。
> 普通窗口打开本目录不会加载该扩展。

### 打开控制台

- 命令面板 → `IPython Console: 打开 IPython 控制台`
- 快捷键 `Ctrl+Alt+O`
- 编辑器里选中代码按 `Shift+Enter`（自动开面板并发送）

### 依赖

- Python 解释器（默认自动使用 `/opt/anaconda3/bin/python`，需已装
  `ipykernel` 与 `jupyter_client`；否则在设置中指定）
- 设置项：`ipythonConsoleDemo.pythonPath`（留空=自动探测）

## 架构

```
┌─────────────────┐  postMessage   ┌──────────────────┐  NDJSON stdio  ┌─────────────────┐  ZMQ   ┌──────────┐
│  webview UI     │ ◄────────────► │  extension.js    │ ◄────────────► │  kernel_host.py │ ◄─────► │ ipykernel│
│  console.html   │                │  Node 侧（VSCode）│                │  Python 管家    │        │  (子进程) │
└─────────────────┘                └──────────────────┘                └─────────────────┘        └──────────┘
```

- **extension.js**（Node）：webview 面板管理、命令/快捷键、spawn 管家进程、
  stdin/stdout NDJSON 双向桥接、面板关闭时真杀内核
- **kernel_host.py**（Python）：内核管家——手动 spawn `ipykernel_launcher`
  （绕过 jupyter_client 8.x 同步环境 asyncio 问题）+ `BlockingKernelClient`
  消息循环；execute/complete/interrupt/restart/shutdown 操作；富显示策略
  （PNG 优先，无 PNG 走 `text/plain`，DataFrame 用 `to_string`）；
  中断用 `os.kill(pid, SIGINT)`（ipykernel 6.x 原生 interrupt 通道只杀子进程）
- **media/console.html**：UI + 前端状态机（输入/输出/补全面板/历史/按键）

### 消息协议（extension ⇄ 管家，每行一个 JSON）

请求（stdin）：`{op: execute|complete|interrupt|restart|shutdown, i, code, cursor_pos}`

事件（stdout）：`{t: hello|boot|busy|idle|exec_input|stream|result|display|
error|notice|status|launch_error|host_stderr, ...}`

## 操作一览

| 操作 | 说明 |
|---|---|
| 回车 | 执行当前输入 |
| `Shift+Enter`（编辑器） | 发送选区/当前行 |
| `Ctrl+Enter` | 输入框内执行 |
| `Ctrl+C`（输入框，无选区） | 中断当前执行 |
| `Ctrl+C`（输入框，有选区） | 复制选区 |
| `Tab` | 补全（候选面板） |
| `↑ / ↓` | 历史导航 |
| `Ctrl+L` | 清屏 |
| 工具栏 中断 | 中断当前执行 |
| 工具栏 重启内核 | 保留变量重建内核 |
| 工具栏 退出 | 原生确认 → 关面板并杀内核 |

## 已知限制

- 输入 `> 15` 万字符自动截断显示
- `input()` 调用在控制台内自动回退为空字符串（不阻塞）
- 含调用的表达式补全（如 `df.cumsum().plot`）依赖内核求值，部分场景无候选
- `\r`（tqdm 进度条）为追加渲染，不覆盖刷新

## 项目结构

```
package.json        扩展清单（命令/快捷键/配置项/图标）
extension.js        Node 侧：面板、命令、spawn 管家、消息桥接
kernel_host.py      Python 管家：spawn 内核、消息循环、富显示
media/console.html  webview UI 与前端逻辑（原生 JS，无依赖）
media/ipython.svg   活动栏图标（IPython 橙 #F37726 闪电）
.vscode/launch.json F5 调试配置
```

## 排障

| 现象 | 处理 |
|---|---|
| 命令面板搜不到 IPython Console | 当前窗口不是扩展开发窗口（标题无 `[扩展开发宿主]`）→ 用上方命令重开 |
| 「管家已启动但 3 秒无任何输出」 | 解释器缺 `ipykernel`/`jupyter_client`，或 `pythonPath` 指向不可用解释器 |
| 「内核启动失败」红字 + traceback | 红字含内核侧具体原因，直接查看 |
| 按钮无反应 + 25 秒超时 | 僵尸面板（窗口恢复导致）→ 关闭面板后用命令重新打开 |
| 中断无效 | 确认内核真的忙（灯红）；`Ctrl+C` 需在输入框内（无选区） |

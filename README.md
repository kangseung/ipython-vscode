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
- **固定白底输出**：内核结果显示区固定白底黑字（qtconsole 风格），不随 VS Code
  主题变化；ANSI 彩色 traceback 已适配白底
- **补全**：Tab 弹出候选面板，支持 `df.属性` 风格联想，↑↓ 选择 + 回车
  替换词根，点选插入；魔发命令（`%` 开头）已过滤
- **历史**：↑↓ 按行遍历（qtconsole 语义），输入半行时 ↑ 先取草稿再进历史
- **中断**：输入框内 `Ctrl+C`（有选区=复制，无选区=中断），约 0.1 秒生效
- **发送代码**：编辑器中 `Shift+Enter` 发送选区/当前行到控制台（自动开面板）
- **Spyder 式流式输入**：输入提示符 `In[n]` 紧跟最后一段输出（不固定在底部），
  编号随执行次数自动递增
- **运行当前文件**：编辑器右上角**播放键图标**一键把整个文件送进控制台运行
  （未保存也可运行，流式输出；文件内容直接进内核，等效执行该脚本）
- **生命周期**：
  - 关闭面板（×）或点工具栏「退出」→ **真正终止内核进程**，系统零残留
  - 标签默认 Pin 防误关；「重启内核」= 起全新内核
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

- 编辑器右上角（分屏按钮左侧）点**终端图标**，或命令面板
  → `IPython Console: 打开 IPython 控制台`、快捷键 `Ctrl+Alt+O`
- 编辑器右上角**播放键图标** = 直接运行当前文件（自动开面板；面板已开时直接注入）
- 编辑器里选中代码按 `Shift+Enter`（自动开面板并发送）

### 依赖

- Python 解释器（默认自动使用 `/opt/anaconda3/bin/python`，需已装
  `ipykernel` 与 `jupyter_client`；否则在设置中指定）
- 设置项：`ipythonConsole.pythonPath`（留空=自动探测）

## 自定义

### 1. Python 解释器路径

设置项 **`ipythonConsole.pythonPath`**（`Ctrl+,` → 搜 "ipython"）：

- 填绝对路径，如 `/home/user/anaconda3/envs/myenv/bin/python`
  （该环境需已装 `ipykernel` 与 `jupyter_client`：`pip install ipykernel jupyter_client`）
- 留空 = 自动探测（`/opt/anaconda3/bin/python` → `python3`）
- **改完点工具栏「重启内核」生效**
- 工具栏第二行右侧（「Python」标签后）**实时显示当前解释器路径**，悬停看完整路径
- 工具栏为两行布局：第一行状态+操作按钮，第二行运行目录 + Python 解释器路径

### 2. IPython 运行目录

默认 **= VS Code 当前打开的文件夹**（多根工作区取第一个），无需任何配置。
工具栏「目录」框实时显示内核实际运行目录，改目录在 **UI 上直接操作**：

- **目录输入框**：直接输入绝对路径，回车或点「应用」生效（自动重启内核）
- **「…」按钮**：原生文件夹选择器浏览选择，回填输入框后回车/应用
- **清空 + 应用** = 恢复默认（跟随 VS Code 当前文件夹）
- UI 指定的目录**优先于**设置项 `ipythonConsole.workingDir`（后者仅作兜底），
  并随工作区记忆（`workspaceState`），下次打开窗口自动恢复
- 切换 VS Code 打开的文件夹后记得重启一次内核（或重设目录）
- 内核横幅会显示当前运行目录；控制台里 `os.getcwd()` 可验证

> 设置项 `ipythonConsole.workingDir` 依然可用，作为无 UI 操作时的兜底，
> 优先级低于工具栏 UI 指定值。

### 3. 播放键执行模式（接着跑 / 从头跑）

设置项 **`ipythonConsole.runMode`**（默认 `append`，也可用工具栏「运行」下拉框切换）：

- **`append`（默认）接着跑**：播放键把当前文件直接注入正在运行的内核——
  变量保留，已 import 的模块走内核内缓存（`import xxx` 不会重新读盘）
- **`fresh` 从头跑**：每次点播放键先**重启内核**再运行文件——所有变量重置，
  import 全部重新加载（新进程天然重读，比 `%reset` 更彻底）
- UI 下拉框改动与 `settings.json` 双向同步（机器级设置）

### 4. 快捷键

两个命令在命令面板里搜 **"IPython Console: 更改快捷键"**：

- **更改快捷键：打开控制台**（默认 `Ctrl+Alt+O`）
- **更改快捷键：发送运行**（编辑器中发送选区/当前行，默认 `Shift+Enter`）

点命令会跳到快捷键编辑界面，点绑定列、按下想要的组合键、回车即保存。
（Linux 桌面下 `Ctrl+Alt+*` 组合可能被窗口管理器占用，建议换成
`Ctrl+Alt+I`、`Alt+Shift+I` 或 `Ctrl+K Ctrl+I` 之类不冲突的组合。）


## 架构

```
┌─────────────────┐  postMessage   ┌──────────────────┐  NDJSON stdio  ┌─────────────────┐  ZMQ   ┌──────────┐
│ 右侧 webview     │ ◄────────────► │  extension.js    │ ◄────────────► │  kernel_host.py │ ◄─────► │ ipykernel│
│ 面板（Beside）   │                │  Node 侧（VSCode）│                │  Python 管家    │        │  (子进程) │
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

请求（stdin）：`{op: execute|complete|interrupt|restart|shutdown, i, code, cursor_pos}`（restart 携带 `cwd`，空串 = 恢复默认目录）

事件（stdout）：`{t: hello|boot|busy|idle|exec_input|stream|result|display|
error|notice|status|launch_error|host_stderr, ...}`

webview → 扩展：`{type: execute|complete|interrupt|restart|quit|connect|pickCwd}`、
`{type: cwd, cwd}`（空串 = 恢复默认）；扩展 → webview 另有 `cwd_picked`（浏览选中目录回填输入框）。

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
| 目录输入框回车 / 「应用」 | 设置 IPython 运行目录（自动重启内核，空串=跟随 VS Code 文件夹） |
| 「…」浏览按钮 | 原生选择器选运行目录（回填后回车/应用生效） |
| `Ctrl+L` | 清屏 |
| 工具栏 中断 | 中断当前执行 |
| 工具栏 重启内核 | 保留变量重建内核 |
| 右上角 终端图标 | 打开/复用右侧 IPython 控制台面板（不抢焦点） |
| 右上角 播放键图标 | 运行当前文件（按「运行」下拉框模式：接着跑/从头跑） |
| 工具栏「运行」下拉框 | 切换播放键模式：接着跑（保留变量/import 缓存）/ 从头跑（播放前重置内核） |
| 工具栏 退出 | 原生确认 → 关闭面板并终止内核进程 |

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
media/play.svg      播放键图标（运行当前文件）
media/console.svg   终端图标（打开/复用控制台面板）
media/ipython.svg   闪电 logo（保留）
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

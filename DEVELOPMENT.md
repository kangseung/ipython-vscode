# IPython Console（开发文档）

面向开发者的技术说明;**使用/配置指南见根目录 README.md**。

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

请求（stdin）：`{op: execute|complete|interrupt|restart|shutdown, i, code, cursor_pos}`；`execute`
运行文件时附加 `file`（绝对路径，host 按 Spyder runfile 语义执行）；`restart` 携带 `cwd`（空串 = 恢复默认目录）

## 运行文件语义（播放键）

`runCurrentFile` 对磁盘文件给 execute 附 `file`；`kernel_host._spyder_wrap` 以 Spyder runfile
等价方式执行：新建 `__main__` 模块命名空间（`__file__`/`__name__`/`__package__`/`__spec__`/
`sys.argv` 齐全；代码先经 IPython 输入转换，文件内 `%` 魔法可用），执行后整 ns 合并回 console
（变量可查）、pop `__file__`、恢复 `sys.argv`；`exec_input` 回显为 `runfile("<path>")` 摘要。
启动竞态走 `pendingRun({code, file})` 补发。输入框/选区执行不带 `file`，保持单元格语义。

事件（stdout）：`{t: hello|boot|busy|idle|exec_input|stream|result|display|
error|notice|status|launch_error|host_stderr, ...}`

webview → 扩展：`{type: execute|complete|interrupt|restart|quit|connect|pickCwd}`、
`{type: cwd, cwd}`（空串 = 恢复默认）；扩展 → webview 另有 `cwd_picked`、`colors`、`runMode` 事件。

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
- 含调用的表达式补全（如 `df.cumsum().plot`）依赖内核求值，部分场景无候选
- `\r`（tqdm 进度条）为追加渲染，不覆盖刷新
- `input()` 调用自动回空字符串（host 短轮询 stdin 通道响应 `input_request`，不阻塞、不挂起）

## 项目结构

```
package.json        扩展清单（命令/快捷键/配置项/图标）
extension.js        Node 侧：面板、命令、spawn 管家、消息桥接
kernel_host.py      Python 管家：spawn 内核、消息循环、富显示
media/console.html  webview UI 与前端逻辑（原生 JS，无依赖）
media/play.svg      播放键图标（运行当前文件）
media/console.svg   终端图标（打开/复用控制台面板）
media/icon.png      扩展图标（市场/活动栏）
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

## 打包

```bash
npx @vscode/vsce package
```

产物 `ipython-vscode-<version>.vsix`;市场 README 取根 `README.md`,
扩展图标取 `media/icon.png`(仅 PNG,vsce 不接受 SVG)。

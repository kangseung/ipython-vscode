# IPython Console

Spyder 风格的 IPython 控制台:真实 ipykernel 内核,右侧面板,流式输出、
DataFrame 文字表格、matplotlib 内嵌图、补全、历史、一键运行当前文件。

## 快速上手

| 操作 | 说明 |
|---|---|
| 编辑器右上角 **终端图标** | 打开/复用控制台 |
| 编辑器右上角 **播放图标** | 运行当前文件(自动开控制台) |
| 编辑器里 `Shift+Enter` | 发送选区/当前行 |
| `Ctrl+Alt+O` | 打开控制台 |

## 工具栏按钮

- **目录**:IPython 运行目录。输入路径回车 / 点「应用」生效;「…」浏览选择;清空+应用 = 跟随 VS Code 当前文件夹
- **运行**:播放键模式。`接着跑`(默认,保留变量与 import 缓存)/ `从头跑`(播放前重置内核)
- **Python**:当前内核解释器路径
- **重启内核 / 清屏 / 退出**

## 配置(settings.json)

| 设置 | 默认 | 说明 |
|---|---|---|
| `ipythonConsole.pythonPath` | 自动探测 | 内核解释器(需已装 `ipykernel` 与 `jupyter_client`;留空自动探测,Windows 下排除微软商店存根,建议填 `python.exe` 绝对路径);改后重启内核 |
| `ipythonConsole.workingDir` | VS Code 当前文件夹 | IPython 运行目录;改后重启内核 |
| `ipythonConsole.runMode` | `append` | 播放键:`append` 接着跑 / `fresh` 从头跑 |
| `ipythonConsole.outputBackground` | `#ffffff` | 输出区背景色 |
| `ipythonConsole.outputForeground` | `#000000` | 输出区前景色 |
| `ipythonConsole.outputPromptIn` | `#0a7a4f` | In 提示符颜色 |
| `ipythonConsole.outputPromptOut` | `#0a47a0` | Out 提示符颜色 |
| `ipythonConsole.outputStderr` | `#a1260d` | stderr / traceback 颜色 |
| `ipythonConsole.outputMuted` | `#606060` | 次级说明文字颜色 |

颜色设置改后即时生效,无需重启内核。

`ipythonConsole.pythonPath` 与 `ipythonConsole.workingDir` 可写在**用户设置**或**工作区 `.vscode/settings.json`**(两者都生效,工作区优先);修改后点工具栏「重启内核」生效。

## 快捷键(可自行更改)

命令面板搜 **"IPython Console: 更改快捷键"** 即可重绑:

- 打开控制台:`Ctrl+Alt+O`
- 发送运行(编辑器):`Shift+Enter`
- 运行当前文件:右上角播放图标(或命令面板)

## 运行文件(Spyder runfile 语义)

右上角播放键 / 命令 **"IPython Console: 运行当前文件"** 以 Spyder runfile 等价语义运行当前文件:

- `__file__` / `__name__` / `__package__` / `sys.argv` 齐全,`os.path.dirname(os.path.abspath(__file__))` 这类写法正常工作
- 脚本定义的变量、导入的模块运行后保留在内核命名空间,可直接在控制台查询
- 未保存的文件也能运行(取编辑器缓冲区内容);不要求文件已落盘
- 文件内 `%` 魔法(如 `%matplotlib inline`、`%time`、`!shell`)可用
- 报错 traceback 精确定位到真实文件名与行号

输入框手输或 `Shift+Enter` 发送选区 = 普通单元格执行(与 Jupyter 一致,无 `__file__`)。


## 依赖

Python 环境需安装:

```bash
pip install ipykernel jupyter_client
```

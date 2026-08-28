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

## 运行中徽章

内核执行任务期间,输出区**右上角**会悬浮显示**红色脉冲圆点 +「运行中 mm:ss」实时耗时**;任务结束自动消失。长任务、大循环、卡在没输出的计算时,一眼即可确认程序仍在运行——不会再误以为执行完毕而重复运行。

## 配置(settings.json)

| 设置 | 默认 | 说明 |
|---|---|---|
| `ipythonConsole.pythonPath` | 自动探测 | 内核解释器(需已装 `ipykernel` 与 `jupyter_client`;留空自动探测,Windows 下排除微软商店存根,建议填 `python.exe` 绝对路径);改后重启内核 |
| `ipythonConsole.workingDir` | VS Code 当前文件夹 | IPython 运行目录;改后重启内核 |
| `ipythonConsole.runMode` | `append` | 播放键:`append` 接着跑 / `fresh` 从头跑 |
| `ipythonConsole.outputBackground` | 跟随主题 | 输出区背景色;留空 = 自动跟随主题(背景分级往白偏移:暗底微提亮成暗灰、中间浅色明显变淡、近白大幅白化,绝不往深走),填写颜色值则固定使用 |
| `ipythonConsole.outputForeground` | 跟随主题 | 输出区前景色(代码、stdout、结果文字);留空 = 自动按背景明暗对撞选色(暗底亮字、亮底深字),填写则固定 |
| `ipythonConsole.outputPromptIn` | 跟随主题 | In 提示符颜色(qtconsole 绿,随明暗换深浅) |
| `ipythonConsole.outputPromptOut` | 跟随主题 | Out 提示符颜色(qtconsole 蓝,随明暗换深浅) |
| `ipythonConsole.outputStderr` | 跟随主题 | stderr / traceback 颜色 |
| `ipythonConsole.outputMuted` | 跟随主题 | 次级说明文字颜色 |

颜色设置留空时自动跟随当前主题：背景**分级往白偏移**——暗底微提亮 5% 成暗灰、中间浅色明显变淡 15%、近白大幅白化（与编辑器底色拉开差异），方向只有往白、**绝不往深/黑走**；文字与 ANSI 输出按背景明暗自适应（暗底亮字、亮底深字，附对比度兜底保证可读），切换主题实时跟随。显式填写颜色值后固定使用该色。颜色改动即时生效，无需重启内核。

`ipythonConsole.pythonPath` 与 `ipythonConsole.workingDir` 可写在**用户设置**或**工作区 `.vscode/settings.json`**(两者都生效,工作区优先);修改后点工具栏「重启内核」生效。

### 常用配色方案(可选,复制即用)

颜色默认自适应当前主题;想固定风格,把下面任一套复制进 `settings.json` 即可。
只填 `outputBackground` / `outputForeground` 两项也能生效(前景、ANSI 16 色、提示符色会按背景明暗自动配套),其余项可选填。

**白色(qtconsole 经典白底)**

```json
{
  "ipythonConsole.outputBackground": "#ffffff",
  "ipythonConsole.outputForeground": "#000000",
  "ipythonConsole.outputPromptIn": "#0a7a4f",
  "ipythonConsole.outputPromptOut": "#0a47a0",
  "ipythonConsole.outputStderr": "#a1260d",
  "ipythonConsole.outputMuted": "#606060"
}
```

**深色 Dracula**

```json
{
  "ipythonConsole.outputBackground": "#282a36",
  "ipythonConsole.outputForeground": "#f8f8f2",
  "ipythonConsole.outputPromptIn": "#50fa7b",
  "ipythonConsole.outputPromptOut": "#8be9fd",
  "ipythonConsole.outputStderr": "#ff5555",
  "ipythonConsole.outputMuted": "#6272a4"
}
```

**深色 One Dark**

```json
{
  "ipythonConsole.outputBackground": "#282c34",
  "ipythonConsole.outputForeground": "#abb2bf",
  "ipythonConsole.outputPromptIn": "#98c379",
  "ipythonConsole.outputPromptOut": "#61afef",
  "ipythonConsole.outputStderr": "#e06c75",
  "ipythonConsole.outputMuted": "#5c6370"
}
```

**深色 Solarized**

```json
{
  "ipythonConsole.outputBackground": "#002b36",
  "ipythonConsole.outputForeground": "#839496",
  "ipythonConsole.outputPromptIn": "#859900",
  "ipythonConsole.outputPromptOut": "#268bd2",
  "ipythonConsole.outputStderr": "#dc322f",
  "ipythonConsole.outputMuted": "#586e75"
}
```

**浅色 Solarized**

```json
{
  "ipythonConsole.outputBackground": "#fdf6e3",
  "ipythonConsole.outputForeground": "#073642",
  "ipythonConsole.outputPromptIn": "#859900",
  "ipythonConsole.outputPromptOut": "#268bd2",
  "ipythonConsole.outputStderr": "#dc322f",
  "ipythonConsole.outputMuted": "#586e75"
}
```


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

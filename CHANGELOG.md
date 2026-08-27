# 更新日志

格式参照 Keep a Changelog。版本号与 `package.json` 同步。

## [1.3.2] - 2026-08-27

### 修复

- **大输出时滚动条不跟随**：近底判定在 DOM 插入**后**执行，一次插入大段输出（DataFrame 表格、长 print）时 `scrollHeight` 已暴涨而 `scrollTop` 未跟上，判定失真导致该滚不滚。改为在插入前快照"近底"状态，按快照决定是否滚到底；上翻读旧输出不打扰的行为保持不变。

## [1.3.1] - 2026-08-24

### 修复

- **Windows 冷启动误报内核死亡**：`start_channels(hb=False)` 关闭心跳通道。Windows 上内核冷启动完成前首个心跳周期未确认，`wait_for_ready` 误报 "Kernel died before replying to kernel_info"（进程实际存活）。改为由 shell 通道 `kernel_info` reply 判定就绪，真实进程存活由宿主进程 `proc.poll()` 把关。
- **Windows pyzmq Proactor 告警**：切换 `WindowsSelectorEventLoopPolicy` 消除 pyzmq 在 Proactor 下不支持 `add_reader` 的 RuntimeWarning；对 3.12+ 的 `set_event_loop_policy` 弃用/3.16 计划移除做了向前兼容守卫，任何 Python 版本均不会崩溃，最坏回退 Proactor（仅告警）。
- **内核启动警告刷屏**：`PYTHONWARNINGS` 追加过滤器，压掉 setuptools 81+ 的 `pkg_resources is deprecated as an API` 弃用 UserWarning（透传到控制台刷屏）；特判置首，用户显式开启全警告（`default`/`always`）时也能压掉该启动噪声，其余用户警告配置保持优先。
- **内核启动失败清理**：20 秒未就绪时区分「进程已退出」与「进程存活但慢启动」并给出准确报错，同时清理残留进程，避免内核稍后起来成为孤儿占用端口。
- **DataFrame 输出排版**：多行输出（DataFrame 文字表格）在 `Out[n]:` 冒号后换行，列名从下一行与数据对齐，与 IPython 原版一致。

## [1.3.0] - 2026-08-24

### 新增

- **智能解释器探测**：`ipythonConsole.pythonPath` 留空时自动探测可用解释器；Windows 下排除微软商店 Python 存根（建议仍填 `python.exe` 绝对路径）。

### 修复

- **Windows 兼容修复**（首轮）：消除 Windows 环境下内核启动与消息通道的兼容性问题。

## [1.2.0] - 2026-08-24

### 新增

- **运行文件改用 Spyder runfile 语义**：播放键运行当前文件时 `__file__`/`__name__`/`__package__`/`__spec__`/`sys.argv` 齐全，`%` 魔法可用，变量运行后保留在命名空间可直接查询；`exec_input` 回显为 `runfile("<path>")` 摘要。
- **输出自动滚动**：输出跟随内容滚动。
- **`input()` 防挂死**：输入请求自动回空字符串，不再阻塞内核。

## [1.1.3] - 2026-08-24

### 修复

- 代码审查发现的 3 处问题（详见 commit `e2b5ea4`）。

## [1.1.0] - 2026-08-24

### 新增

- 输出区配色可配置：新增 `ipythonConsole.outputBackground` / `outputForeground` / `outputPromptIn` / `outputPromptOut` / `outputStderr` / `outputMuted` 六项设置，改动即时生效。
- 打包精简：新增 `.vscodeignore`，排除 `__pycache__`、`.vscode`、历史 vsix 产物。

### 修复

- 输出与代码回显分层：输出前加细分隔线，不再紧贴代码末行。
- `In[n]` 显示下一真实编号：`exec_input` 后跟随更新，不再退回 `In[*]`。

## [1.0.0] - 2026-08-24

### 变更

- 更名 `ipython-vscode`（发布名 **IPython Console**），去除 Demo 命名残留。
- publisher 迁移至 `jiangsheng`。

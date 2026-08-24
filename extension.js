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
let uiCwd = '';               // UI 指定运行目录（空串 = 跟随 VS Code 文件夹/设置项）
let pendingRun = undefined;   // 内核就绪前的待执行请求 {code, file}（启动竞态不丢请求）

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
  const cfg = vscode.workspace.getConfiguration('ipythonConsole').get('pythonPath', '');
  if (cfg && fs.existsSync(cfg)) return cfg;
  const conda = '/opt/anaconda3/bin/python';
  if (fs.existsSync(conda)) return conda;
  return 'python3';
}
// 运行目录解析顺序：UI 指定 > 设置项 workingDir > 当前打开的 workspace 文件夹 > 空（用管家默认）
function resolveCwd() {
  const ui = uiCwd && uiCwd.trim();
  if (ui) return ui;
  const cfg = vscode.workspace.getConfiguration('ipythonConsole').get('workingDir', '');
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
      if (ev.t === 'hello') {
        kernelReady = true;
        if (pendingRun) {
          const run = pendingRun;
          pendingRun = undefined;
          sendProc({ op: 'execute', i: ++reqCounter, code: run.code, file: run.file });
        }
      }
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
    pendingRun = undefined;            // 与 stopKernel 对齐：启动失败/意外退出不留陈请求
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
  pendingRun = undefined;   // 丢弃未就绪时暂存的代码
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
    // 始终携带 resolveCwd()：空串 = 让管家恢复启动时目录（默认跟随 VS Code 文件夹）
    sendProc({ op: 'restart', cwd: resolveCwd() });
  } else {
    startKernel();
  }
}

// UI 设置运行目录（工具栏输入框/浏览选择 →「应用」）。空串 = 恢复默认。
function applyCwd(value) {
  const v = (value || '').trim();
  if (v && !path.isAbsolute(v)) {
    notify({ t: 'notice', text: '运行目录需为绝对路径：' + v + '（未应用，仍使用原目录 ' + resolveCwd() + '）' });
    return;
  }
  if (v && (!fs.existsSync(v) || !fs.statSync(v).isDirectory())) {
    notify({ t: 'notice', text: '运行目录不存在或不是文件夹：' + v + '（未应用，仍使用原目录 ' + resolveCwd() + '）' });
    return;
  }
  uiCwd = v;
  extContext.workspaceState.update('ipythonConsoleCwd', v);
  restartKernel();
  notify({ t: 'notice', text: v
    ? '运行目录已设为：' + v + '（正在重启内核生效）'
    : '运行目录已恢复默认：跟随 VS Code 当前文件夹（正在重启内核生效）' });
}

// 原生文件夹选择器：选中后回填输入框（不自动应用，避免误触重启丢变量）
function pickCwd() {
  vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: '选择 IPython 运行目录'
  }).then((uris) => {
    if (uris && uris.length) notify({ t: 'cwd_picked', cwd: uris[0].fsPath });
  }, () => { /* 取消 */ });
}

// 播放键执行模式：append=接着跑（默认，直接注入当前内核）；fresh=从头跑（先重启内核）
function runMode() {
  return vscode.workspace.getConfiguration('ipythonConsole').get('runMode', 'append') === 'fresh' ? 'fresh' : 'append';
}

// 输出区配色（白底 qtconsole 风格，可在设置中改色）
function outputColors() {
  const cfg = vscode.workspace.getConfiguration('ipythonConsole');
  return {
    background: cfg.get('outputBackground', '#ffffff'),
    foreground: cfg.get('outputForeground', '#000000'),
    promptIn: cfg.get('outputPromptIn', '#0a7a4f'),
    promptOut: cfg.get('outputPromptOut', '#0a47a0'),
    stderr: cfg.get('outputStderr', '#a1260d'),
    muted: cfg.get('outputMuted', '#606060')
  };
}
function pushColors() {
  const c = outputColors();
  notify({ t: 'colors', ...c });
}

// UI 下拉切换执行模式（写入机器级设置，settings.json 可见）
function applyRunMode(mode) {
  const m = mode === 'fresh' ? 'fresh' : 'append';
  vscode.workspace.getConfiguration('ipythonConsole').update('runMode', m, vscode.ConfigurationTarget.Global);
  notify({ t: 'runMode', mode: m });
  notify({ t: 'notice', text: '运行模式：' + (m === 'fresh' ? '从头跑（播放前重置内核）' : '接着跑（保留变量/import 缓存）') });
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
    'ipythonConsole',
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
      case 'connect':
        startKernel();
        notify({ t: 'runMode', mode: runMode() });
        pushColors();
        break;
      case 'execute': sendProc({ op: 'execute', i: ++reqCounter, code: msg.code }); break;
      case 'complete': sendProc({ op: 'complete', i: ++reqCounter, code: msg.code, cursor_pos: msg.cursorPos }); break;
      case 'interrupt': sendProc({ op: 'interrupt' }); break;
      case 'restart': restartKernel(); break;
      case 'runMode': applyRunMode(msg.mode); break;
      case 'cwd': applyCwd(msg.cwd); break;
      case 'pickCwd': pickCwd(); break;
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
  pushColors();
}

// 运行当前文件：整个文件内容送进内核（未保存也可运行，流式输出到控制台）
function runCurrentFile() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  const code = ed.document.getText();
  if (!code.trim()) return;
  // 磁盘文件 → 携带 file：host 按 Spyder runfile 语义执行（__file__ 等可用）。
  // 未保存/untitled 文档无磁盘路径，退回普通执行（与单元格一致）。
  const file = ed.document.uri.scheme === 'file' ? ed.document.uri.fsPath : undefined;
  ensurePanel(false);            // 面板带到前台：已打开时也切过去，运行结果立即可见
  if (runMode() === 'fresh' && kernelProc && kernelReady) {
    // 从头跑：内核已就绪 → 先重启（重置变量/重新加载 import），hello 后自动补发文件
    pendingRun = { code: code, file: file };
    restartKernel();
    return;
  }
  if (!kernelProc) startKernel();
  if (!kernelReady) {
    pendingRun = { code: code, file: file };   // 内核启动中/未启动（新内核天然 fresh）：hello 后自动补发
    return;
  }
  sendProc({ op: 'execute', i: ++reqCounter, code: code, file: file });
}
function activate(context) {
  extContext = context;
  uiCwd = extContext.workspaceState.get('ipythonConsoleCwd', '') || '';   // 恢复上次 UI 指定目录（空=默认）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ipythonConsole')) pushColors();
    }),
    vscode.commands.registerCommand('ipy.open', () => {
      ensurePanel(false);
    }),
    vscode.commands.registerCommand('ipy.runFile', () => {
      runCurrentFile();
    }),
    vscode.commands.registerCommand('ipy.sendSelection', () => {
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
    vscode.commands.registerCommand('ipy.changeOpenKeybinding', () => {
      vscode.commands.executeCommand('workbench.action.openKeybindings', 'ipy.open');
    }),
    vscode.commands.registerCommand('ipy.changeSendKeybinding', () => {
      vscode.commands.executeCommand('workbench.action.openKeybindings', 'ipy.sendSelection');
    })
  );
}

// 标签默认 Pin（锁住）防误关：pinned tab 原生隐藏 × 按钮。
function pinEditorTab() {
  setTimeout(() => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!tab || !tab.input || !(tab.input.viewType === 'ipythonConsole')) {
      return;
    }
    vscode.commands.executeCommand('workbench.action.pinEditor').then(undefined, () => {});
  }, 150);
}

function deactivate() {
  stopKernel();
}

module.exports = { activate, deactivate };

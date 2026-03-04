const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let serverProcess = null;
let mainWindow = null;

// 生产模式下用子进程启动后端（避免原生模块兼容问题）
if (!isDev) {
  const appPath = path.dirname(app.getPath('exe'));
  const serverPath = path.join(__dirname, '../server/index.js');
  serverProcess = spawn('node', [serverPath], {
    stdio: 'inherit',
    cwd: appPath,  // 设置工作目录为应用安装目录
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
}

// 等待服务器就绪
async function waitForServer(url, maxRetries = 30) {
  const http = require('http');
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          if (res.statusCode === 200) resolve();
          else reject();
        }).on('error', reject);
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PaperBridge',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    // 开发模式：加载 Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 生产模式：等待后端就绪后加载
    const config = require('../server/config');
    const serverUrl = `http://localhost:${config.port}`;
    const ready = await waitForServer(serverUrl);
    if (ready) {
      mainWindow.loadURL(serverUrl);
    } else {
      mainWindow.loadURL(`data:text/html,<h1>服务器启动失败，请重启应用</h1>`);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

app.whenReady().then(async () => {
  await createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC: 选择目录
ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

// IPC: 选择文件
ipcMain.handle('select-file', async (_, filters) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: filters || [{ name: 'All', extensions: ['*'] }]
  });
  return canceled ? [] : filePaths;
});

// IPC: 在文件管理器中显示
ipcMain.handle('show-in-folder', (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// IPC: 复制文件
ipcMain.handle('copy-file', (_, src, dest) => {
  fs.copyFileSync(src, dest);
  return true;
});

// 复制路径到剪贴板
ipcMain.handle('copy-to-clipboard', (_, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return true;
});

// === 保留的配置相关 IPC ===

// 获取应用路径信息
ipcMain.handle('get-app-paths', () => {
  const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
  return {
    appPath,
    certsDir: path.join(appPath, 'certs'),
    toolsDir: path.join(appPath, 'tools'),
    addinDir: path.join(appPath, 'word-addin'),
    mkcertPath: path.join(appPath, 'tools', 'mkcert.exe')
  };
});

// 检查证书状态
ipcMain.handle('check-cert-status', () => {
  const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
  const certsDir = path.join(appPath, 'certs');
  const certFile = path.join(certsDir, 'localhost.pem');
  const keyFile = path.join(certsDir, 'localhost-key.pem');
  return {
    exists: fs.existsSync(certFile) && fs.existsSync(keyFile),
    certPath: certFile,
    keyPath: keyFile
  };
});

// 生成证书
ipcMain.handle('generate-cert', async () => {
  const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
  const mkcertPath = path.join(appPath, 'tools', 'mkcert.exe');
  const certsDir = path.join(appPath, 'certs');
  if (!fs.existsSync(mkcertPath)) {
    return { success: false, error: 'mkcert.exe 不存在，请重新安装应用' };
  }
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }
  try {
    const { execSync } = require('child_process');
    execSync(`"${mkcertPath}" -install`, { stdio: 'pipe' });
    execSync(`"${mkcertPath}" -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1`, {
      cwd: certsDir, stdio: 'pipe'
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// === 浮动笔记窗口 ===
let noteWindows = new Map(); // 追踪打开的笔记窗口
let noteWindowPinned = new Map(); // 追踪每个窗口的置顶状态

ipcMain.handle('open-note-window', (_, { refId, refTitle }) => {
  // 如果该题录的笔记窗口已打开，聚焦它
  if (noteWindows.has(refId)) {
    const existing = noteWindows.get(refId);
    if (!existing.isDestroyed()) { existing.focus(); return true; }
    noteWindows.delete(refId);
    noteWindowPinned.delete(refId);
  }

  // 计算笔记窗口位置：主窗口右侧
  let x, y;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [mainX, mainY] = mainWindow.getPosition();
    const [mainWidth] = mainWindow.getSize();
    x = mainX + mainWidth + 10;
    y = mainY;
  }

  const baseUrl = isDev ? 'http://localhost:5173' : `http://localhost:${require('../server/config').port}`;
  const noteWin = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 360,
    minHeight: 300,
    x: x,
    y: y,
    title: '笔记 - ' + (refTitle || ''),
    frame: true,
    skipTaskbar: false,
    show: false, // 等 ready-to-show 再显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  noteWindowPinned.set(refId, true); // 默认置顶

  // 窗口准备好后再设置置顶并显示
  noteWin.once('ready-to-show', () => {
    noteWin.setAlwaysOnTop(true, 'screen-saver', 1);
    noteWin.show();
    noteWin.focus();
  });

  // 关键：窗口每次失去焦点时重新强制置顶（Windows 上 alwaysOnTop 有时会被系统重置）
  noteWin.on('blur', () => {
    if (!noteWin.isDestroyed() && noteWindowPinned.get(refId)) {
      noteWin.setAlwaysOnTop(true, 'screen-saver', 1);
    }
  });

  noteWin.loadURL(`${baseUrl}/note-editor?refId=${refId}`);
  noteWin.setMenuBarVisibility(false);
  noteWindows.set(refId, noteWin);
  noteWin.on('closed', () => {
    noteWindows.delete(refId);
    noteWindowPinned.delete(refId);
  });
  return true;
});

// 切换笔记窗口置顶状态
ipcMain.handle('set-always-on-top', (event, pinned) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (pinned) {
      win.setAlwaysOnTop(true, 'screen-saver', 1);
    } else {
      win.setAlwaysOnTop(false);
    }
    // 同步 pinned 状态到 Map，控制 blur 时是否重新置顶
    for (const [refId, noteWin] of noteWindows) {
      if (noteWin === win) {
        noteWindowPinned.set(refId, pinned);
        break;
      }
    }
  }
  return true;
});

// 用系统默认程序打开 PDF
ipcMain.handle('open-pdf-external', async (_, pdfPath) => {
  try {
    await shell.openPath(pdfPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 获取首次启动标记
ipcMain.handle('get-first-launch', () => {
  const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
  const flagFile = path.join(appPath, 'data', '.first-launch-done');
  return !fs.existsSync(flagFile);
});

// 设置首次启动完成
ipcMain.handle('set-first-launch-done', () => {
  const appPath = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
  const dataDir = path.join(appPath, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, '.first-launch-done'), '');
  return true;
});

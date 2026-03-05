const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  copyFile: (src, dest) => ipcRenderer.invoke('copy-file', src, dest),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // 浮动笔记窗口 & PDF 打开
  openNoteWindow: (data) => ipcRenderer.invoke('open-note-window', data),
  openPdfExternal: (pdfPath) => ipcRenderer.invoke('open-pdf-external', pdfPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setAlwaysOnTop: (pinned) => ipcRenderer.invoke('set-always-on-top', pinned),

  // 配置相关
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  checkCertStatus: () => ipcRenderer.invoke('check-cert-status'),
  generateCert: () => ipcRenderer.invoke('generate-cert'),
  getFirstLaunch: () => ipcRenderer.invoke('get-first-launch'),
  setFirstLaunchDone: () => ipcRenderer.invoke('set-first-launch-done'),
});

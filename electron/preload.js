const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  copyFile: (src, dest) => ipcRenderer.invoke('copy-file', src, dest),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Listen for update events
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_, message) => callback(message));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_, version) => callback(version));
  },
});

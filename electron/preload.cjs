const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auto updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // File system - backup and export
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFilesToFolder: (folder, files) => ipcRenderer.invoke('save-files-to-folder', folder, files),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  openWebVersion: () => ipcRenderer.invoke('open-web-version'),

  // Persistência segura em disco
  diskSaveState: (state) => ipcRenderer.invoke('disk-save-state', state),
  diskLoadState: () => ipcRenderer.invoke('disk-load-state'),
  diskListBackups: () => ipcRenderer.invoke('disk-list-backups'),
  diskRestoreBackup: (backupPath) => ipcRenderer.invoke('disk-restore-backup', backupPath),

  // Listen for update events
  onUpdateStatus: (callback) => {
    const listener = (_, message) => callback(message);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_, version) => callback(version);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
});

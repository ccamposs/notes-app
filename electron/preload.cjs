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
  getPendingUpdate: () => ipcRenderer.invoke('get-pending-update'),
  onFlushBeforeQuit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('flush-before-quit', listener);
    return () => ipcRenderer.removeListener('flush-before-quit', listener);
  },
  confirmFlushBeforeQuit: () => ipcRenderer.send('flush-before-quit-complete'),

  // Autostart
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),

  // Google Calendar — tokens permanecem exclusivamente no processo principal
  googleCalendarStatus: () => ipcRenderer.invoke('google-calendar-status'),
  googleCalendarConnect: (clientId) => ipcRenderer.invoke('google-calendar-connect', clientId),
  googleCalendarDisconnect: () => ipcRenderer.invoke('google-calendar-disconnect'),
  googleCalendarListCalendars: () => ipcRenderer.invoke('google-calendar-list-calendars'),
  googleCalendarSync: (tasks, calendarId, syncAllActiveTasks) => ipcRenderer.invoke('google-calendar-sync', tasks, calendarId, syncAllActiveTasks),
  googleCalendarDeleteEvent: (calendarId, eventId, etag) => ipcRenderer.invoke('google-calendar-delete-event', calendarId, eventId, etag),

  // Pesquisa com IA (Ollama local)
  ollamaStatus: () => ipcRenderer.invoke('ollama-status'),
  ollamaAsk: (question, notes, model) => ipcRenderer.invoke('ollama-ask', question, notes, model),

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

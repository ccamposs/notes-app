const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Disable hardware acceleration issues on some systems
app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // In production, load the built files
  // In dev, load from Vite dev server
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates after window is ready (production only)
  if (!isDev) {
    mainWindow.webContents.on('did-finish-load', () => {
      checkForUpdates();
    });
  }
}

// ===== Auto Updater =====
function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify();
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Verificando atualizações...');
});

autoUpdater.on('update-available', (info) => {
  sendStatusToWindow(`Atualização disponível: v${info.version}`);

  // Show native notification
  if (Notification.isSupported()) {
    new Notification({
      title: 'Atualização disponível',
      body: `Uma nova versão (v${info.version}) está sendo baixada...`,
      icon: path.join(__dirname, '../public/icon.ico'),
    }).show();
  }
});

autoUpdater.on('update-not-available', () => {
  sendStatusToWindow('Você está na versão mais recente.');
});

autoUpdater.on('download-progress', (progress) => {
  sendStatusToWindow(`Baixando atualização: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow(`Atualização v${info.version} pronta! Reinicie para aplicar.`);

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Atualização pronta!',
      body: `A versão v${info.version} foi baixada. Clique para reiniciar e atualizar.`,
      icon: path.join(__dirname, '../public/icon.ico'),
    });
    notification.on('click', () => {
      autoUpdater.quitAndInstall();
    });
    notification.show();
  }

  // Send to renderer to show a restart button
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info.version);
  }
});

autoUpdater.on('error', (err) => {
  sendStatusToWindow(`Erro na atualização: ${err.message}`);
});

function sendStatusToWindow(message) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', message);
  }
}

// ===== IPC Handlers =====
ipcMain.handle('check-for-updates', () => {
  if (!app.isPackaged) return 'Modo de desenvolvimento - sem atualizações';
  autoUpdater.checkForUpdatesAndNotify();
  return 'Verificando...';
});

ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ===== App lifecycle =====
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

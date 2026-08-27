const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { startLocalSyncServer } = require('./sync-server.cjs');

// Disable hardware acceleration issues on some systems
app.disableHardwareAcceleration();

let mainWindow = null;
let localSyncServer = null;
let updateCheckInterval = null;

// Baixa atualizações automaticamente; a instalação só ocorre quando o usuário
// reinicia pelo aviso ou ao encerrar o aplicativo.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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

  // A atualização automática só existe no pacote instalado. Em desenvolvimento,
  // a janela usa o Vite local e não deve consultar releases públicas.
  if (!isDev) {
    mainWindow.webContents.once('did-finish-load', () => {
      checkForUpdates();
      if (!updateCheckInterval) {
        updateCheckInterval = setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
      }
    });
  }
}

// ===== Auto Updater =====
function checkForUpdates() {
  if (!app.isPackaged) return Promise.resolve(null);
  return autoUpdater.checkForUpdates().catch((error) => {
    console.error('Não foi possível verificar atualizações:', error.message);
    sendStatusToWindow('Não foi possível verificar atualizações agora.');
    return null;
  });
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
  console.error('Auto-updater error:', err.message);
  sendStatusToWindow('Não foi possível verificar atualizações agora.');
});

function sendStatusToWindow(message) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', message);
  }
}

// ===== IPC Handlers =====
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return 'Modo de desenvolvimento - sem atualizações';
  await checkForUpdates();
  return 'Verificando atualizações...';
});

ipcMain.handle('restart-and-update', () => {
  if (app.isPackaged) autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ===== File System Handlers (Backup & Export) =====

ipcMain.handle('save-file', async (_, options) => {
  const { content, defaultName, filters } = options;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters || [{ name: 'Todos os arquivos', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { success: false };
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { success: true, filePath: result.filePath };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Escolha a pasta para exportar',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('save-files-to-folder', async (_, folder, files) => {
  try {
    for (const file of files) {
      const fullPath = path.join(folder, file.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf-8');
    }
    return { success: true, count: files.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-backup-path', () => {
  return path.join(app.getPath('userData'), 'backups');
});

// ===== App lifecycle =====
app.whenReady().then(async () => {
  try {
    localSyncServer = await startLocalSyncServer(app.getPath('userData'));
    console.log(`Serviço local de sincronização ativo em http://${localSyncServer.host}:${localSyncServer.port}`);
  } catch (error) {
    // O app continua utilizável com o IndexedDB offline caso a porta esteja ocupada
    // ou o banco local não possa ser iniciado.
    console.error('Não foi possível iniciar o serviço local de sincronização:', error.message);
  }
  createWindow();
});

app.on('before-quit', () => {
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  if (localSyncServer) localSyncServer.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

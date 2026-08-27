const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { startLocalSyncServer } = require('./sync-server.cjs');
const { startWebServer } = require('./web-server.cjs');
const dataPersistence = require('./data-persistence.cjs');

// Disable hardware acceleration issues on some systems
app.disableHardwareAcceleration();

let mainWindow = null;
let localSyncServer = null;
let localWebServer = null;
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
    return null;
  });
}

autoUpdater.on('checking-for-update', () => {
  // Silencioso — só exibe algo quando há atualização disponível.
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
  // Silencioso — nada a informar quando já está atualizado.
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
  // Não envia erros brutos ao renderer; apenas uma mensagem curta caso necessário.
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

ipcMain.handle('open-web-version', () => {
  const port = localWebServer ? localWebServer.port : 5173;
  shell.openExternal(`http://localhost:${port}`);
  return { success: true, url: `http://localhost:${port}` };
});

// ===== Persistência segura em disco =====

ipcMain.handle('disk-save-state', (_, state) => {
  return dataPersistence.saveState(state);
});

ipcMain.handle('disk-load-state', () => {
  return dataPersistence.loadState();
});

ipcMain.handle('disk-list-backups', () => {
  return dataPersistence.listBackups();
});

ipcMain.handle('disk-restore-backup', (_, backupPath) => {
  try {
    const data = fs.readFileSync(backupPath, 'utf-8');
    if (!dataPersistence.isValidState(data)) {
      return { success: false, error: 'Backup inválido ou corrompido.' };
    }
    return { success: true, state: JSON.parse(data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== App lifecycle =====
app.whenReady().then(async () => {
  // Inicializa persistência segura em disco
  dataPersistence.init(app.getPath('userData'));
  dataPersistence.startBackupTimer();

  try {
    localSyncServer = await startLocalSyncServer(app.getPath('userData'));
    console.log(`Serviço local de sincronização ativo em http://${localSyncServer.host}:${localSyncServer.port}`);
  } catch (error) {
    console.error('Não foi possível iniciar o serviço local de sincronização:', error.message);
  }

  // Servidor web embutido: serve os arquivos compilados (dist/) para que
  // o navegador possa acessar a versão web sem Vite ou dependências externas.
  if (app.isPackaged) {
    try {
      localWebServer = await startWebServer(path.join(__dirname, '../dist'));
      console.log(`Versão web disponível em http://localhost:${localWebServer.port}`);
    } catch (error) {
      console.error('Não foi possível iniciar o servidor web local:', error.message);
    }
  }

  createWindow();
});

app.on('before-quit', () => {
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  dataPersistence.stopAndFinalBackup();
  if (localSyncServer) localSyncServer.stop();
  if (localWebServer) localWebServer.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

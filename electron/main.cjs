const { app, BrowserWindow, ipcMain, Notification, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { startLocalSyncServer } = require('./sync-server.cjs');
const { startWebServer } = require('./web-server.cjs');
const dataPersistence = require('./data-persistence.cjs');
const { createGoogleCalendarService } = require('./google-calendar.cjs');
const { isOllamaAvailable, askOllama } = require('./ollama.cjs');

// Disable hardware acceleration issues on some systems
app.disableHardwareAcceleration();

// ===== Instância única =====
// Impede que duas cópias do app rodem ao mesmo tempo, o que causava conflito
// na atualização (o instalador não conseguia encerrar a segunda instância).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Uma segunda instância tentou abrir: foca a janela existente.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let tray = null;
let localSyncServer = null;
let localWebServer = null;
let updateCheckInterval = null;
let googleCalendarService = null;
let isQuitting = false;
let shutdownInProgress = false;
let readyToExit = false;
let rendererFlushComplete = null;
let updateInstallPending = false;
let downloadedUpdateVersion = null;

const SHUTDOWN_TIMEOUT_MS = 10000;
const INSTALLER_HANDOFF_TIMEOUT_MS = 4000;

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

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

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
  downloadedUpdateVersion = info.version;
  sendStatusToWindow(`Atualização v${info.version} pronta! Reinicie para aplicar.`);

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Atualização pronta!',
      body: `A versão v${info.version} foi baixada. Clique para reiniciar e atualizar.`,
      icon: path.join(__dirname, '../public/icon.ico'),
    });
    notification.on('click', () => {
      // Traz a janela e mostra o aviso dentro do app, onde o usuário confirma.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      requestUpdateInstall();
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

// Marca a instalação e inicia o encerramento. O instalador só é acionado
// depois que os dados forem gravados, no fim do fluxo de before-quit.
function requestUpdateInstall() {
  if (!app.isPackaged) return { success: false, error: 'Atualização disponível apenas no aplicativo instalado.' };
  if (!downloadedUpdateVersion) return { success: false, error: 'Nenhuma atualização foi baixada ainda.' };
  if (updateInstallPending) return { success: true, version: downloadedUpdateVersion };

  updateInstallPending = true;
  app.quit();
  return { success: true, version: downloadedUpdateVersion };
}

ipcMain.handle('restart-and-update', () => requestUpdateInstall());

ipcMain.handle('get-pending-update', () => ({ version: downloadedUpdateVersion }));

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

// ===== Google Calendar =====

function calendarService() {
  if (!googleCalendarService) {
    googleCalendarService = createGoogleCalendarService(app.getPath('userData'));
  }
  return googleCalendarService;
}

ipcMain.handle('google-calendar-status', () => calendarService().getStatus());
ipcMain.handle('google-calendar-connect', (_, clientId) => calendarService().connect(clientId));
ipcMain.handle('google-calendar-disconnect', () => calendarService().disconnect());
ipcMain.handle('google-calendar-list-calendars', () => calendarService().listCalendars());
ipcMain.handle('google-calendar-sync', (_, tasks, calendarId, syncAllActiveTasks) => calendarService().sync(tasks, calendarId, syncAllActiveTasks === true));
ipcMain.handle('google-calendar-delete-event', (_, calendarId, eventId, etag) => calendarService().deleteEvent(calendarId, eventId, etag));

// ===== Pesquisa com IA (Ollama) =====
ipcMain.handle('ollama-status', () => isOllamaAvailable());
ipcMain.handle('ollama-ask', (_, question, notes, model) => askOllama(question, notes, model));

// ===== Autostart (iniciar com Windows) =====

ipcMain.handle('get-autostart', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-autostart', (_, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
  });
  return enabled;
});

// ===== System Tray =====

function createTray() {
  const iconPath = path.join(__dirname, '../public/icon.ico');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Notes App');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Notes App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Abrir versão Web',
      click: () => {
        const port = localWebServer ? localWebServer.port : 5173;
        shell.openExternal(`http://localhost:${port}`);
      },
    },
    { type: 'separator' },
    {
      label: 'Sair completamente',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function requestRendererFlush() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      rendererFlushComplete = null;
      resolve(false);
    }, 5000);
    rendererFlushComplete = () => {
      clearTimeout(timeout);
      rendererFlushComplete = null;
      resolve(true);
    };
    mainWindow.webContents.send('flush-before-quit');
  });
}

ipcMain.on('flush-before-quit-complete', () => rendererFlushComplete?.());

// ===== App lifecycle =====
app.whenReady().then(async () => {
  // Inicializa persistência segura em disco
  dataPersistence.init(app.getPath('userData'));
  dataPersistence.startBackupTimer();
  googleCalendarService = createGoogleCalendarService(app.getPath('userData'));

  try {
    localSyncServer = await startLocalSyncServer(app.getPath('userData'));
    console.log(`Serviço local de sincronização ativo em http://${localSyncServer.host}:${localSyncServer.port}`);
  } catch (error) {
    console.error('Não foi possível iniciar o serviço local de sincronização:', error.message);
  }

  // Servidor web embutido
  if (app.isPackaged) {
    try {
      localWebServer = await startWebServer(path.join(__dirname, '../dist'));
      console.log(`Versão web disponível em http://localhost:${localWebServer.port}`);
    } catch (error) {
      console.error('Não foi possível iniciar o servidor web local:', error.message);
    }
  }

  createTray();
  createWindow();
});

// Grava tudo o que está pendente antes de encerrar. Nunca lança: o app precisa
// terminar de sair, senão o instalador da atualização ficaria esperando para sempre.
async function drainBeforeQuit() {
  const flushed = await requestRendererFlush();
  if (!flushed) {
    console.warn('A janela não confirmou a gravação final no tempo esperado; seguindo com o que já foi salvo.');
  }

  const results = await Promise.allSettled([
    dataPersistence.stopAndFinalBackup(),
    localSyncServer?.stop(),
    localWebServer?.stop(),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') console.error('Falha ao finalizar a persistência:', result.reason);
  }
}

// Segue adiante se uma etapa demorar demais: é melhor encerrar com o que já foi
// gravado do que deixar o app (e o instalador) esperando indefinidamente.
function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => {
      console.warn(`${label} passou de ${milliseconds}ms; seguindo com o encerramento.`);
      resolve();
    }, milliseconds)),
  ]);
}

app.on('before-quit', (event) => {
  // Liberação final: a drenagem terminou e o encerramento já foi decidido.
  if (readyToExit) return;

  // Qualquer pedido de saída espera a gravação terminar, venha do botão de
  // atualizar, da bandeja ou do próprio instalador.
  event.preventDefault();
  if (shutdownInProgress) return;

  isQuitting = true;
  shutdownInProgress = true;
  if (updateCheckInterval) clearInterval(updateCheckInterval);

  void withTimeout(drainBeforeQuit(), SHUTDOWN_TIMEOUT_MS, 'A gravação final').finally(() => {
    readyToExit = true;

    if (!updateInstallPending) {
      app.quit();
      return;
    }

    // Dados salvos: agora o instalador pode substituir os arquivos e reabrir o app.
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      console.error('Não foi possível iniciar o instalador:', error.message);
    }

    // Se o instalador não assumir o encerramento, sai de qualquer forma: a
    // atualização ainda é aplicada na saída e o app não fica travado.
    setTimeout(() => app.quit(), INSTALLER_HANDOFF_TIMEOUT_MS);
  });
});

app.on('window-all-closed', () => {
  // Não fecha o app — mantém o tray ativo
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

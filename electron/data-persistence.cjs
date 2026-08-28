/**
 * Módulo de persistência segura em disco.
 *
 * Garante que os dados nunca sejam perdidos:
 * - Dupla gravação: arquivo principal + cópia de segurança
 * - Verificação após salvar: relê e compara hash
 * - Proteção contra gravação vazia: nunca sobrescreve dados bons com estado vazio
 * - Backup rotativo: mantém as últimas 10 cópias com timestamp
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const DATA_FILENAME = 'notes-data.json';
const DATA_COPY_FILENAME = 'notes-data.backup.json';
const BACKUPS_DIR = 'backups';

let userDataPath = '';
let backupTimer = null;
let lastSavedHash = '';
// Um único escritor protege os arquivos .tmp contra gravações IPC concorrentes.
let saveQueue = Promise.resolve();

function init(dataPath) {
  userDataPath = dataPath;
  const backupsDir = path.join(userDataPath, BACKUPS_DIR);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

function getDataPath() {
  return path.join(userDataPath, DATA_FILENAME);
}

function getCopyPath() {
  return path.join(userDataPath, DATA_COPY_FILENAME);
}

function getBackupsDir() {
  return path.join(userDataPath, BACKUPS_DIR);
}

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function isValidState(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parsed
      && Array.isArray(parsed.notes)
      && Array.isArray(parsed.notebooks)
      && Array.isArray(parsed.tags)
      && Array.isArray(parsed.tasks)
      && parsed.settings && typeof parsed.settings === 'object'
      && parsed.dashboard && typeof parsed.dashboard === 'object';
  } catch {
    return false;
  }
}

function hasContent(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parsed && Array.isArray(parsed.notes) && parsed.notes.length > 0;
  } catch {
    return false;
  }
}

/**
 * Salva o estado no disco com verificação de integridade.
 * Retorna { success, error? }
 */
function saveState(state) {
  // Serializa a operação inteira (principal + cópia) para que duas chamadas
  // nunca disputem o mesmo arquivo temporário nem invertam a ordem dos dados.
  const operation = saveQueue.then(() => saveStateSafely(state));
  saveQueue = operation.catch(() => undefined);
  return operation;
}

async function saveStateSafely(state) {
  if (!userDataPath) return { success: false, error: 'Persistência não inicializada.' };

  const json = JSON.stringify(state, null, 2);
  const hash = computeHash(json);

  // Proteção contra gravação vazia: se o novo estado não tem notas
  // mas o arquivo atual tem, NÃO sobrescrever.
  if (!hasContent(json)) {
    const existingData = readFile(getDataPath());
    if (hasContent(existingData)) {
      console.warn('[Persistência] Bloqueada gravação de estado vazio sobre dados existentes.');
      return { success: false, error: 'Estado vazio não pode sobrescrever dados existentes.' };
    }
  }

  // Se o conteúdo não mudou, não grava novamente
  if (hash === lastSavedHash) return { success: true };

  // Grava no arquivo principal
  const mainResult = await writeAndVerify(getDataPath(), json, hash);
  if (!mainResult.success) {
    return { success: false, error: `Falha no arquivo principal: ${mainResult.error}` };
  }

  // Grava a cópia de segurança
  const copyResult = await writeAndVerify(getCopyPath(), json, hash);
  if (!copyResult.success) {
    console.error('[Persistência] Cópia de segurança falhou:', copyResult.error);
    // Não falha a operação — o principal foi salvo com sucesso
  }

  lastSavedHash = hash;
  return { success: true };
}

/**
 * Grava e relê para verificar integridade.
 */
async function writeAndVerify(filePath, content, expectedHash) {
  try {
    // Grava com .tmp primeiro para não corromper o arquivo original em caso de falha.
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, content, 'utf-8');

    // A verificação é feita fora do caminho síncrono do processo principal.
    const verification = await fs.promises.readFile(tmpPath, 'utf-8');
    const verifyHash = computeHash(verification);

    if (verifyHash !== expectedHash) {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
      return { success: false, error: 'Hash não confere após gravação.' };
    }

    // Renomeia atomicamente (substitui o original).
    await fs.promises.rename(tmpPath, filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Lê um arquivo de forma segura. Retorna null se não existir ou for inválido.
 */
function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Carrega o estado mais recente e confiável.
 * Tenta: arquivo principal → cópia de segurança → backup mais recente.
 */
function loadState() {
  // 1. Arquivo principal
  const mainData = readFile(getDataPath());
  if (mainData && isValidState(mainData)) {
    lastSavedHash = computeHash(mainData);
    return { state: JSON.parse(mainData), source: 'main' };
  }

  // 2. Cópia de segurança
  const copyData = readFile(getCopyPath());
  if (copyData && isValidState(copyData)) {
    console.warn('[Persistência] Arquivo principal corrompido. Usando cópia de segurança.');
    lastSavedHash = computeHash(copyData);
    // Restaura o principal a partir da cópia
    try { fs.writeFileSync(getDataPath(), copyData, 'utf-8'); } catch { /* melhor esforço */ }
    return { state: JSON.parse(copyData), source: 'backup-copy' };
  }

  // 3. Backup rotativo mais recente
  const latestBackup = getLatestBackup();
  if (latestBackup) {
    const backupData = readFile(latestBackup);
    if (backupData && isValidState(backupData)) {
      console.warn('[Persistência] Usando backup rotativo:', path.basename(latestBackup));
      lastSavedHash = computeHash(backupData);
      try { fs.writeFileSync(getDataPath(), backupData, 'utf-8'); } catch { /* melhor esforço */ }
      return { state: JSON.parse(backupData), source: 'rotative-backup' };
    }
  }

  return { state: null, source: 'none' };
}

/**
 * Cria um backup rotativo (chamado periodicamente e ao fechar).
 */
function createRotativeBackup() {
  const mainData = readFile(getDataPath());
  if (!mainData || !isValidState(mainData)) return;

  const backupsDir = getBackupsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `backup-${timestamp}.json`);

  try {
    fs.writeFileSync(backupPath, mainData, 'utf-8');
  } catch (error) {
    console.error('[Persistência] Falha ao criar backup rotativo:', error.message);
    return;
  }

  // Remove backups antigos (mantém os últimos MAX_BACKUPS)
  cleanOldBackups();
}

function cleanOldBackups() {
  const backupsDir = getBackupsDir();
  try {
    const files = fs.readdirSync(backupsDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse();

    const toDelete = files.slice(MAX_BACKUPS);
    for (const file of toDelete) {
      try { fs.unlinkSync(path.join(backupsDir, file)); } catch { /* melhor esforço */ }
    }
  } catch { /* pasta pode não existir ainda */ }
}

function getLatestBackup() {
  const backupsDir = getBackupsDir();
  try {
    const files = fs.readdirSync(backupsDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse();
    return files.length > 0 ? path.join(backupsDir, files[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Lista os backups disponíveis (para a UI de recuperação).
 */
function listBackups() {
  const backupsDir = getBackupsDir();
  try {
    return fs.readdirSync(backupsDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map((file) => {
        const stats = fs.statSync(path.join(backupsDir, file));
        return { file, path: path.join(backupsDir, file), size: stats.size, date: stats.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

/**
 * Inicia o timer de backup periódico.
 */
function startBackupTimer() {
  if (backupTimer) return;
  // Cria o primeiro backup imediatamente
  createRotativeBackup();
  backupTimer = setInterval(createRotativeBackup, BACKUP_INTERVAL_MS);
}

/**
 * Para o timer, espera as gravações enfileiradas e cria um backup final ao fechar.
 */
async function stopAndFinalBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }

  // Uma nova chamada pode entrar enquanto aguardamos; só prossiga quando a
  // cadeia estabilizar, para que o backup reflita a última gravação em disco.
  let observedQueue;
  do {
    observedQueue = saveQueue;
    await observedQueue;
  } while (observedQueue !== saveQueue);

  createRotativeBackup();
}

module.exports = {
  init,
  saveState,
  loadState,
  createRotativeBackup,
  startBackupTimer,
  stopAndFinalBackup,
  listBackups,
  isValidState,
  hasContent,
};

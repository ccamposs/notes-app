/**
 * Camada de armazenamento baseada em IndexedDB.
 *
 * O localStorage tem limite de ~5 MB, insuficiente para notas com imagens.
 * O IndexedDB permite centenas de MB (ou mais, conforme o espaço em disco),
 * viabilizando importações do Evernote com imagens embutidas.
 */

const DB_NAME = 'notes-app-db';
const DB_VERSION = 1;
const STORE_NAME = 'app-state';
const STATE_KEY = 'main';

const LEGACY_STORAGE_KEY = 'notes-app-data';
const MIGRATION_MARKER = 'notes-app-indexeddb-migrated';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function readState<T>(): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Falha ao ler do IndexedDB:', e);
    return null;
  }
}

export async function writeState<T>(value: T): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, STATE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Lê os dados antigos do localStorage, se ainda não migrados.
 * Retorna null quando não há nada a migrar.
 */
export function readLegacyState(): unknown | null {
  try {
    if (localStorage.getItem(MIGRATION_MARKER)) return null;
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Falha ao ler dados antigos do localStorage:', e);
    return null;
  }
}

export function markLegacyMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_MARKER, '1');
    // Libera o espaço ocupado pelos dados duplicados
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem('notes-app-backup');
  } catch (e) {
    console.error('Falha ao concluir a migração:', e);
  }
}

export interface StorageEstimate {
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
  supported: boolean;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage ?? 0;
      const quotaBytes = estimate.quota ?? 0;
      return {
        usedBytes,
        quotaBytes,
        percentUsed: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
        supported: true,
      };
    }
  } catch (e) {
    console.error('Falha ao estimar armazenamento:', e);
  }
  return { usedBytes: 0, quotaBytes: 0, percentUsed: 0, supported: false };
}

/**
 * Solicita armazenamento persistente para que o navegador não descarte
 * os dados automaticamente quando o disco estiver cheio.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {
    console.error('Falha ao solicitar armazenamento persistente:', e);
  }
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

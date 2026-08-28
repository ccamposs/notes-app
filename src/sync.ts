import { AppState } from './types';

export type SyncPhase = 'offline' | 'connecting' | 'syncing' | 'synced' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pendingChanges: number;
  lastSyncedAt: number;
  message?: string;
}

interface SyncMessage {
  type: 'snapshot' | 'ack' | 'error';
  state?: AppState;
  updatedAt?: number;
  sourceClientId?: string;
  message?: string;
}

const ENDPOINT = 'ws://127.0.0.1:32147/sync/ws';
const CLIENT_ID_KEY = 'notes-app-sync-client-id';
const LAST_CHANGE_KEY = 'notes-app-sync-last-change';
const LAST_SYNC_KEY = 'notes-app-sync-last-synced';

function getOrCreateClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

function getTimestamp(key: string): number {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Mantém o IndexedDB como cache offline e sincroniza snapshots confirmados pelo
 * serviço SQLite local. Quando o Desktop está fechado, mudanças continuam
 * guardadas no navegador e são enviadas na próxima conexão.
 */
export class LocalSyncClient {
  private readonly clientId = getOrCreateClientId();
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private currentState: AppState | null = null;
  private changedAt = getTimestamp(LAST_CHANGE_KEY);
  private lastSyncedAt: number = getTimestamp(LAST_SYNC_KEY);
  private statusListener: (status: SyncStatus) => void = () => undefined;
  private remoteStateListener: (state: AppState) => void = () => undefined;
  private syncWaiters: { updatedAt: number; resolve: () => void }[] = [];

  start(initialState: AppState, onRemoteState: (state: AppState) => void, onStatus: (status: SyncStatus) => void): void {
    this.currentState = initialState;
    this.remoteStateListener = onRemoteState;
    this.statusListener = onStatus;
    this.stopped = false;
    this.connect();
  }

  saveLocalChange(state: AppState): void {
    this.currentState = state;
    this.changedAt = Date.now();
    localStorage.setItem(LAST_CHANGE_KEY, String(this.changedAt));
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'save', state, updatedAt: this.changedAt });
      this.publishStatus('syncing', 1);
    } else {
      this.publishStatus('offline', 1, 'Aguardando o aplicativo Desktop para sincronizar.');
    }
  }
  retry(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.connect();
  }

  waitForPendingSync(): Promise<void> {
    if (this.changedAt <= this.lastSyncedAt || this.socket?.readyState !== WebSocket.OPEN) return Promise.resolve();
    const updatedAt = this.changedAt;
    return new Promise((resolve) => this.syncWaiters.push({ updatedAt, resolve }));
  }

  private resolveSyncedWaiters(): void {
    const remaining: typeof this.syncWaiters = [];
    for (const waiter of this.syncWaiters) {
      if (waiter.updatedAt <= this.lastSyncedAt) waiter.resolve();
      else remaining.push(waiter);
    }
    this.syncWaiters = remaining;
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'Cliente encerrado');
    this.socket = null;
    for (const waiter of this.syncWaiters) waiter.resolve();
    this.syncWaiters = [];
  }

  private connect(): void {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    if (!this.currentState) return;

    this.publishStatus('connecting', this.changedAt > this.lastSyncedAt ? 1 : 0);
    const socket = new WebSocket(ENDPOINT);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      // O estado pode ter mudado enquanto o WebSocket estava conectando.
      // Monte o hello agora para nunca combinar conteúdo antigo e timestamp novo.
      if (this.currentState) this.send({ type: 'hello', state: this.currentState, updatedAt: this.changedAt });
      this.publishStatus('syncing', this.changedAt > this.lastSyncedAt ? 1 : 0);
    };

    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      // O close agenda nova tentativa; não sobrescrevemos a mensagem útil aqui.
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private handleMessage(rawMessage: unknown): void {
    let message: SyncMessage;
    try {
      message = JSON.parse(String(rawMessage)) as SyncMessage;
    } catch {
      this.publishStatus('error', 0, 'Resposta inválida do serviço de sincronização.');
      return;
    }

    if (message.type === 'error') {
      this.publishStatus('error', 0, message.message || 'Não foi possível sincronizar os dados.');
      return;
    }

    if (message.type === 'ack' && Number.isFinite(message.updatedAt)) {
      this.lastSyncedAt = Math.max(this.lastSyncedAt, message.updatedAt!);
      localStorage.setItem(LAST_SYNC_KEY, String(this.lastSyncedAt));
      const hasNewerChange = this.changedAt > this.lastSyncedAt;
      this.resolveSyncedWaiters();
      this.publishStatus(hasNewerChange ? 'syncing' : 'synced', hasNewerChange ? 1 : 0);
      return;
    }

    if (message.type !== 'snapshot' || !message.state || !Number.isFinite(message.updatedAt)) {
      this.publishStatus('error', 0, 'Snapshot de sincronização inválido.');
      return;
    }

    const timestamp = message.updatedAt!;
    if (message.sourceClientId !== this.clientId && timestamp >= this.changedAt) {
      this.currentState = message.state;
      this.changedAt = timestamp;
      localStorage.setItem(LAST_CHANGE_KEY, String(timestamp));
      this.remoteStateListener(message.state);
    }

    this.lastSyncedAt = timestamp;
    localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
    this.resolveSyncedWaiters();
    this.publishStatus('synced', 0);
  }

  private send(payload: { type: 'hello' | 'save'; state: AppState; updatedAt: number }): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ ...payload, clientId: this.clientId }));
  }

  private scheduleReconnect(): void {
    const delay = Math.min(15000, 750 * 2 ** this.reconnectAttempt) + Math.floor(Math.random() * 300);
    this.reconnectAttempt += 1;
    this.publishStatus('offline', this.changedAt > this.lastSyncedAt ? 1 : 0, 'Serviço local indisponível.');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private publishStatus(phase: SyncPhase, pendingChanges: number, message?: string): void {
    this.statusListener({ phase, pendingChanges, lastSyncedAt: this.lastSyncedAt, message });
  }
}

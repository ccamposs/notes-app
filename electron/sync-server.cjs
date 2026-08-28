const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

const SYNC_HOST = '127.0.0.1';
const SYNC_PORT = 32147;
const MAX_MESSAGE_BYTES = 100 * 1024 * 1024;

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
  if (origin === 'file://' || origin.startsWith('file://')) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isAppState(value) {
  return value && typeof value === 'object'
    && Array.isArray(value.notes)
    && Array.isArray(value.notebooks)
    && Array.isArray(value.tags)
    && Array.isArray(value.tasks)
    && value.settings && typeof value.settings === 'object'
    && value.dashboard && typeof value.dashboard === 'object';
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

/**
 * Armazena o snapshot compartilhado em arquivo JSON local.
 * Sem dependência de módulos nativos — funciona em qualquer plataforma.
 */
function startLocalSyncServer(userDataPath) {
  return new Promise((resolve, reject) => {
    const snapshotPath = path.join(userDataPath, 'notes-sync.json');

    // Ler snapshot existente do disco
    let currentSnapshot = null;
    let snapshotWriteInProgress = false;
    let snapshotWritePromise = null;
    let pendingSnapshotWrite = null;
    let snapshotRetryTimer = null;
    let snapshotRetryDelay = 1000;
    let shuttingDown = false;
    try {
      if (fs.existsSync(snapshotPath)) {
        const raw = fs.readFileSync(snapshotPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && isAppState(parsed.state)) {
          currentSnapshot = parsed;
        }
      }
    } catch (error) {
      console.error('Erro ao ler snapshot de sincronização:', error.message);
    }

    async function writeSnapshot(snapshot) {
      // Devolve o controle ao loop do Electron antes de serializar snapshots
      // grandes, para que o ACK não dispute o mesmo instante da interface.
      await new Promise((resolve) => setImmediate(resolve));
      const tmpPath = `${snapshotPath}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(snapshot), 'utf-8');
      await fs.promises.rename(tmpPath, snapshotPath);
    }

    function scheduleSnapshotRetry() {
      if (shuttingDown || snapshotRetryTimer !== null) return;
      const delay = snapshotRetryDelay;
      snapshotRetryDelay = Math.min(snapshotRetryDelay * 2, 30000);
      snapshotRetryTimer = setTimeout(() => {
        snapshotRetryTimer = null;
        queueSnapshotWrite();
      }, delay);
    }

    function queueSnapshotWrite(data) {
      let persisted = Promise.resolve();
      if (data) {
        persisted = new Promise((resolve, reject) => {
          if (pendingSnapshotWrite) {
            // Enquanto há escrita em curso ou retry, só a versão mais nova
            // precisa chegar ao disco; todos os remetentes aguardam esse flush.
            pendingSnapshotWrite.snapshot = data;
            pendingSnapshotWrite.waiters.push({ resolve, reject });
          } else {
            pendingSnapshotWrite = { snapshot: data, waiters: [{ resolve, reject }] };
          }
        });
      }
      if (shuttingDown || snapshotWriteInProgress || snapshotRetryTimer !== null || !pendingSnapshotWrite) return persisted;

      const flush = async () => {
        snapshotWriteInProgress = true;
        try {
          while (pendingSnapshotWrite) {
            const pending = pendingSnapshotWrite;
            pendingSnapshotWrite = null;
            try {
              await writeSnapshot(pending.snapshot);
              snapshotRetryDelay = 1000;
              // Se uma versão mais nova chegou durante a escrita, não envie a
              // anterior: seus remetentes aguardam o próximo snapshot final.
              if (pendingSnapshotWrite) {
                pendingSnapshotWrite.waiters.unshift(...pending.waiters);
                continue;
              }
              for (const waiter of pending.waiters) waiter.resolve(pending.snapshot);
            } catch (error) {
              console.error('Erro ao gravar snapshot de sincronização:', error.message);
              // Uma versão mais nova recebida durante a falha tem prioridade,
              // mas os remetentes antigos continuam aguardando a gravação dela.
              if (pendingSnapshotWrite) {
                pendingSnapshotWrite.waiters.unshift(...pending.waiters);
              } else {
                pendingSnapshotWrite = pending;
              }
              scheduleSnapshotRetry();
              break;
            }
          }
        } finally {
          snapshotWriteInProgress = false;
          snapshotWritePromise = null;
          if (pendingSnapshotWrite && !shuttingDown && snapshotRetryTimer === null) queueSnapshotWrite();
        }
      };

      snapshotWritePromise = flush();
      void snapshotWritePromise;
      return persisted;
    }

    async function flushPendingSnapshotOnStop() {
      shuttingDown = true;
      if (snapshotRetryTimer !== null) {
        clearTimeout(snapshotRetryTimer);
        snapshotRetryTimer = null;
      }
      if (snapshotWritePromise) await snapshotWritePromise;
      if (!pendingSnapshotWrite) return;

      const pending = pendingSnapshotWrite;
      pendingSnapshotWrite = null;
      try {
        await writeSnapshot(pending.snapshot);
        for (const waiter of pending.waiters) waiter.resolve(pending.snapshot);
      } catch (error) {
        console.error('Erro ao finalizar snapshot de sincronização:', error.message);
        for (const waiter of pending.waiters) waiter.reject(error);
      }
    }

    function saveSnapshotToDisk(state, updatedAt, sourceClientId) {
      const data = { state, updatedAt, sourceClientId };
      currentSnapshot = data;
      return { data, persisted: queueSnapshotWrite(data) };
    }

    const server = http.createServer((request, response) => {
      // CORS para requisições do navegador
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        response.end();
        return;
      }

      if (request.url === '/sync/health') {
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        response.end(JSON.stringify({ status: 'ok', port: SYNC_PORT }));
        return;
      }

      // Endpoint HTTP para o renderer Electron ler o estado ao abrir
      // (caso o WebSocket ainda não tenha conectado)
      if (request.url === '/sync/state') {
        response.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        if (currentSnapshot) {
          response.end(JSON.stringify(currentSnapshot));
        } else {
          response.end(JSON.stringify({ state: null }));
        }
        return;
      }

      response.writeHead(404);
      response.end();
    });

    const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    const clients = new Set();
    let lastBroadcastedSnapshot = null;

    const broadcastSnapshot = (snapshot, excludeSocket) => {
      const message = JSON.stringify({ type: 'snapshot', ...snapshot });
      for (const client of clients) {
        if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    };

    const confirmPersistedSnapshot = (socket, savedSnapshot) => {
      void savedSnapshot.persisted
        .then((persistedSnapshot) => {
          const wasPersistedAsSent = persistedSnapshot.sourceClientId === savedSnapshot.data.sourceClientId
            && persistedSnapshot.updatedAt === savedSnapshot.data.updatedAt;
          if (wasPersistedAsSent) {
            // O ACK leve continua evitando o retorno de Base64 ao remetente,
            // mas agora só confirma a sincronização depois da gravação atômica.
            send(socket, { type: 'ack', updatedAt: persistedSnapshot.updatedAt });
          } else {
            // A fila coalesceu uma atualização mais nova de outro cliente;
            // devolva-a ao remetente em vez de confirmar um estado substituído.
            send(socket, { type: 'snapshot', ...persistedSnapshot });
          }
          if (lastBroadcastedSnapshot !== persistedSnapshot) {
            lastBroadcastedSnapshot = persistedSnapshot;
            broadcastSnapshot(persistedSnapshot, socket);
          }
        })
        .catch(() => send(socket, { type: 'error', message: 'Não foi possível persistir a sincronização.' }));
    };

    webSocketServer.on('connection', (socket) => {
      clients.add(socket);
      socket.once('close', () => clients.delete(socket));

      socket.on('message', (raw, isBinary) => {
        if (isBinary || raw.length > MAX_MESSAGE_BYTES) {
          socket.close(1009, 'Mensagem inválida');
          return;
        }

        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          send(socket, { type: 'error', message: 'JSON inválido.' });
          return;
        }

        if (!message || typeof message.clientId !== 'string') {
          send(socket, { type: 'error', message: 'clientId ausente.' });
          return;
        }

        const updatedAt = Number.isFinite(message.updatedAt) ? Math.max(0, Math.floor(message.updatedAt)) : 0;
        const isHello = message.type === 'hello';
        const isSave = message.type === 'save';

        if (!isHello && !isSave) {
          send(socket, { type: 'error', message: 'Tipo inválido.' });
          return;
        }

        // Hello: cliente se conectou. Envia o estado mais recente ou aceita o dele.
        if (isHello) {
          if (currentSnapshot && currentSnapshot.updatedAt >= updatedAt) {
            // Servidor tem dados mais recentes — envia para o cliente
            send(socket, {
              type: 'snapshot',
              state: currentSnapshot.state,
              updatedAt: currentSnapshot.updatedAt,
              sourceClientId: currentSnapshot.sourceClientId,
            });
          } else if (message.state && isAppState(message.state)) {
            // Cliente tem dados mais recentes — salva e distribui
            const snapshot = saveSnapshotToDisk(message.state, updatedAt, message.clientId);
            confirmPersistedSnapshot(socket, snapshot);
          } else if (currentSnapshot) {
            send(socket, {
              type: 'snapshot',
              state: currentSnapshot.state,
              updatedAt: currentSnapshot.updatedAt,
              sourceClientId: currentSnapshot.sourceClientId,
            });
          }
          // Se não há snapshot em lugar nenhum, não envia nada.
          return;
        }

        // Save: cliente alterou dados.
        if (!message.state || !isAppState(message.state)) {
          send(socket, { type: 'error', message: 'Estado inválido.' });
          return;
        }

        if (currentSnapshot && currentSnapshot.updatedAt > updatedAt) {
          // Servidor tem dados mais recentes — rejeita e envia o atual
          send(socket, {
            type: 'snapshot',
            state: currentSnapshot.state,
            updatedAt: currentSnapshot.updatedAt,
            sourceClientId: currentSnapshot.sourceClientId,
          });
          return;
        }

        const snapshot = saveSnapshotToDisk(message.state, updatedAt, message.clientId);
        confirmPersistedSnapshot(socket, snapshot);
      });
    });

    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/sync/ws') {
        socket.destroy();
        return;
      }
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });

    server.once('error', (error) => {
      reject(error);
    });

    server.listen(SYNC_PORT, SYNC_HOST, () => {
      resolve({
        host: SYNC_HOST,
        port: SYNC_PORT,
        snapshotPath,
        stop: async () => {
          for (const client of clients) client.close(1001, 'Servidor encerrado');
          webSocketServer.close();
          await new Promise((stopResolve) => server.close(stopResolve));
          await flushPendingSnapshotOnStop();
        },
      });
    });
  });
}

module.exports = { SYNC_HOST, SYNC_PORT, startLocalSyncServer };

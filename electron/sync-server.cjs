const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { WebSocketServer, WebSocket } = require('ws');

const SYNC_HOST = '127.0.0.1';
const SYNC_PORT = 32147;
const MAX_MESSAGE_BYTES = 100 * 1024 * 1024;

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true; // Electron carregado de file://
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
 * Armazena o snapshot compartilhado no loopback. O servidor só escuta em
 * 127.0.0.1 e nunca expõe o banco para a rede local.
 */
function startLocalSyncServer(userDataPath) {
  return new Promise((resolve, reject) => {
    const databasePath = path.join(userDataPath, 'notes-sync.sqlite');
    const database = new Database(databasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');
    database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        source_client_id TEXT NOT NULL
      );
    `);

    const readSnapshot = database.prepare('SELECT payload, updated_at AS updatedAt, source_client_id AS sourceClientId FROM workspace_snapshot WHERE id = 1');
    const writeSnapshot = database.prepare(`
      INSERT INTO workspace_snapshot (id, payload, updated_at, source_client_id)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at,
        source_client_id = excluded.source_client_id
    `);

    const server = http.createServer((request, response) => {
      if (request.url !== '/sync/health') {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      response.end(JSON.stringify({ status: 'ok', port: SYNC_PORT }));
    });

    const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    const clients = new Set();

    const broadcastSnapshot = (snapshot) => {
      const message = JSON.stringify({ type: 'snapshot', ...snapshot });
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      }
    };

    const persistSnapshot = (state, updatedAt, sourceClientId) => {
      const current = readSnapshot.get();
      if (current && current.updatedAt > updatedAt) return { accepted: false, snapshot: current };
      writeSnapshot.run(JSON.stringify(state), updatedAt, sourceClientId);
      return {
        accepted: true,
        snapshot: { payload: JSON.stringify(state), updatedAt, sourceClientId },
      };
    };

    webSocketServer.on('connection', (socket) => {
      clients.add(socket);
      socket.once('close', () => clients.delete(socket));

      socket.on('message', (raw, isBinary) => {
        if (isBinary || raw.length > MAX_MESSAGE_BYTES) {
          socket.close(1009, 'Mensagem de sincronização inválida');
          return;
        }

        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          send(socket, { type: 'error', message: 'Mensagem de sincronização inválida.' });
          return;
        }

        if (!message || typeof message.clientId !== 'string' || !isAppState(message.state)) {
          send(socket, { type: 'error', message: 'Estado de sincronização inválido.' });
          return;
        }

        const updatedAt = Number.isFinite(message.updatedAt) ? Math.max(0, Math.floor(message.updatedAt)) : 0;
        const isHello = message.type === 'hello';
        const isSave = message.type === 'save';
        if (!isHello && !isSave) {
          send(socket, { type: 'error', message: 'Tipo de sincronização inválido.' });
          return;
        }

        const current = readSnapshot.get();
        if (isHello && current) {
          if (updatedAt > current.updatedAt) {
            const result = persistSnapshot(message.state, updatedAt, message.clientId);
            const snapshot = {
              state: JSON.parse(result.snapshot.payload),
              updatedAt: result.snapshot.updatedAt,
              sourceClientId: result.snapshot.sourceClientId,
            };
            broadcastSnapshot(snapshot);
          } else {
            send(socket, {
              type: 'snapshot',
              state: JSON.parse(current.payload),
              updatedAt: current.updatedAt,
              sourceClientId: current.sourceClientId,
            });
          }
          return;
        }

        const result = persistSnapshot(message.state, updatedAt, message.clientId);
        const snapshot = {
          state: JSON.parse(result.snapshot.payload),
          updatedAt: result.snapshot.updatedAt,
          sourceClientId: result.snapshot.sourceClientId,
        };
        if (result.accepted) broadcastSnapshot(snapshot);
        else send(socket, { type: 'snapshot', ...snapshot });
      });
    });

    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/sync/ws' || !isAllowedOrigin(request.headers.origin)) {
        socket.destroy();
        return;
      }
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request);
      });
    });

    server.once('error', (error) => {
      try { database.close(); } catch { /* banco ainda não foi aberto */ }
      reject(error);
    });

    server.listen(SYNC_PORT, SYNC_HOST, () => {
      resolve({
        host: SYNC_HOST,
        port: SYNC_PORT,
        databasePath,
        stop: () => new Promise((stopResolve) => {
          for (const client of clients) client.close(1001, 'Servidor encerrado');
          webSocketServer.close();
          server.close(() => {
            database.close();
            stopResolve();
          });
        }),
      });
    });
  });
}

module.exports = { SYNC_HOST, SYNC_PORT, startLocalSyncServer };

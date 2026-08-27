const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

const SYNC_HOST = '127.0.0.1';
const SYNC_PORT = 32147;
const MAX_MESSAGE_BYTES = 100 * 1024 * 1024;

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
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

    function saveSnapshotToDisk(state, updatedAt, sourceClientId) {
      const data = { state, updatedAt, sourceClientId };
      try {
        fs.writeFileSync(snapshotPath, JSON.stringify(data), 'utf-8');
      } catch (error) {
        console.error('Erro ao gravar snapshot de sincronização:', error.message);
      }
      currentSnapshot = data;
      return data;
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

    const broadcastSnapshot = (snapshot, excludeSocket) => {
      const message = JSON.stringify({ type: 'snapshot', ...snapshot });
      for (const client of clients) {
        if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
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
            send(socket, { type: 'snapshot', state: snapshot.state, updatedAt: snapshot.updatedAt, sourceClientId: snapshot.sourceClientId });
            broadcastSnapshot({ state: snapshot.state, updatedAt: snapshot.updatedAt, sourceClientId: snapshot.sourceClientId }, socket);
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
        // Confirma ao remetente
        send(socket, { type: 'snapshot', state: snapshot.state, updatedAt: snapshot.updatedAt, sourceClientId: snapshot.sourceClientId });
        // Distribui para os demais
        broadcastSnapshot({ state: snapshot.state, updatedAt: snapshot.updatedAt, sourceClientId: snapshot.sourceClientId }, socket);
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
      reject(error);
    });

    server.listen(SYNC_PORT, SYNC_HOST, () => {
      resolve({
        host: SYNC_HOST,
        port: SYNC_PORT,
        snapshotPath,
        stop: () => new Promise((stopResolve) => {
          for (const client of clients) client.close(1001, 'Servidor encerrado');
          webSocketServer.close();
          server.close(() => stopResolve());
        }),
      });
    });
  });
}

module.exports = { SYNC_HOST, SYNC_PORT, startLocalSyncServer };

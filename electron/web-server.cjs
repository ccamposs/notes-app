const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_PORT = 5173;
const WEB_HOST = '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
};

/**
 * Serve os arquivos estáticos da pasta dist/ na porta 5173.
 * Toda rota que não corresponde a um arquivo real retorna index.html (SPA fallback).
 */
function startWebServer(distPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      // Normaliza a URL (remove query strings)
      let urlPath = decodeURIComponent(request.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.join(distPath, urlPath);
      const ext = path.extname(filePath).toLowerCase();

      // Verifica se o arquivo existe
      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          serveFile(filePath, ext, response);
        } else {
          // SPA fallback: qualquer rota que não seja arquivo vai para index.html
          const indexPath = path.join(distPath, 'index.html');
          serveFile(indexPath, '.html', response);
        }
      });
    });

    function serveFile(filePath, ext, response) {
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          response.writeHead(500);
          response.end('Erro interno');
          return;
        }
        response.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
          'Access-Control-Allow-Origin': '*',
        });
        response.end(data);
      });
    }

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        // Porta já em uso (provavelmente Vite dev), tudo bem
        resolve({ port: WEB_PORT, stop: () => Promise.resolve() });
      } else {
        reject(error);
      }
    });

    server.listen(WEB_PORT, WEB_HOST, () => {
      resolve({
        port: WEB_PORT,
        stop: () => new Promise((stopResolve) => {
          server.close(() => stopResolve());
        }),
      });
    });
  });
}

module.exports = { startWebServer };

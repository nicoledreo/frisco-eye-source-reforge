#!/usr/bin/env node
// serve.mjs <rootDir> <port> — minimal static server for previewing a site folder.
// A server is more faithful than file:// — fonts and relative requests resolve the same way.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2]);
const PORT = Number(process.argv[3] || 8101);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const missing = new Set();

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e, buf) => {
      if (e) {
        missing.add(url);
        res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + url);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(buf);
    });
  });
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write('serving ' + ROOT + ' on http://127.0.0.1:' + PORT + '/\n');
});

process.on('SIGINT', () => {
  if (missing.size) {
    process.stdout.write('missing files requested:\n');
    for (const m of missing) process.stdout.write('  ' + m + '\n');
  }
  process.exit(0);
});

// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A static file server on Node.js built-ins, for browser tests and local use (Pages serves docs/ the same way).
//   node tools/serve.mjs [--root .] [--port 0]     prints the address it listens on
// As a library: const s = await serve({ root, port }); s.url; await s.close();

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.yaml': 'text/yaml; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.vec': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.stl': 'model/stl', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

export function serve({ root, port = 0, log = false } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.normalize(path.join(base, decodeURIComponent(u.pathname)));
    if (!p.startsWith(base)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('not found'); if (log) console.log(`404 ${u.pathname}`); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const a = server.address();
    resolve({ url: `http://127.0.0.1:${a.port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = process.argv.slice(2);
  const root = v.includes('--root') ? v[v.indexOf('--root') + 1] : '.';
  const port = v.includes('--port') ? Number(v[v.indexOf('--port') + 1]) : 8000;
  serve({ root, port, log: true }).then((s) => console.log(`[serve] ${path.resolve(root)} at ${s.url}`));
}

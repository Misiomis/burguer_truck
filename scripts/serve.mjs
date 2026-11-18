// Servidor estático local que reproduce la subruta de GitHub Pages:
//   http://localhost:4173/burguer_truck/
// Uso: npm run dev   (o PORT=5000 npm run dev)
// No requiere credenciales ni dependencias externas.
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/burguer_truck/';
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

// Carpetas que nunca se sirven (herramientas internas de Node).
const BLOCKED = ['node_modules', '.git', '.git.broken-backup'];

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);

      if (pathname === '/' || pathname === '/burguer_truck') {
        res.writeHead(302, { Location: BASE });
        return res.end();
      }
      if (!pathname.startsWith(BASE)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Fuera de /burguer_truck/ (igual que en GitHub Pages).');
      }
      let rel = pathname.slice(BASE.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep)) throw Object.assign(new Error('fuera'), { code: 'ENOENT' });
      const top = path.relative(ROOT, file).split(path.sep)[0];
      if (BLOCKED.includes(top) || top.startsWith('.')) throw Object.assign(new Error('bloqueado'), { code: 'ENOENT' });

      const info = await stat(file);
      if (info.isDirectory()) {
        res.writeHead(301, { Location: pathname + '/' });
        return res.end();
      }
      let body = await readFile(file);
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
      // Compresión gzip para texto, como hace GitHub Pages.
      if (/text|json|xml|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body);
        headers['Content-Encoding'] = 'gzip';
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        try {
          const page = await readFile(path.join(ROOT, '404.html'));
          res.writeHead(404, { 'Content-Type': TYPES['.html'] });
          return res.end(page);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('No encontrado');
        }
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error del servidor local');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`El Buen Sabor en http://localhost:${PORT}${BASE}`);
  });
}

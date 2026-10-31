/* ============================================================
   DENI ISLAM — игровой сервер (Node.js + ws)
   1 сервер = 1 комната = 2 игрока.
   Логика комнаты: ../public/server/room.js — ОДИН файл на сервер и на
   офлайн-режим браузера (и на GitHub Pages он тоже доступен статически).
   Запуск:  npm start   →  http://0.0.0.0:8080
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const DI = require('../public/shared/protocol.js');
const { Room } = require('../public/server/room.js');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- сохранения на диске ---------------- */
function savePath(token) { return path.join(DATA_DIR, 'save_' + token + '.json'); }
const store = {
  load(token) {
    if (!token) return null;
    try { return JSON.parse(fs.readFileSync(savePath(token), 'utf8')); } catch (e) { return null; }
  },
  save(token, data) {
    if (!token) return;
    try {
      const tmp = savePath(token) + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, savePath(token));
    } catch (e) { console.error('[save]', e.message); }
  }
};

const room = new Room({
  store,
  seed: (Date.now() & 0x7fffffff) || 424242,
  log: (...a) => console.log('[room]', ...a)
});

// периодический автосейв
setInterval(() => { room.players.forEach(p => p && room.persist(p)); }, 15000);

/* ---------------- HTTP + статика ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive'
};
function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (p === '/api/health' || p === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, game: 'Deni Islam', version: '1.0.0',
      players: room.count(), max: DI.MAX_PLAYERS,
      uptime: Math.round(room.t), seed: room.seed
    }));
    return;
  }
  if (p === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const token = String(d.token || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (!token) { res.writeHead(400); res.end('{"ok":false}'); return; }
        store.save(token, d.data);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }
  if (p === '/api/wipe' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body || '{}');
        const t = String(d.token || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (t) { try { fs.unlinkSync(savePath(t)); } catch (e) {} }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"ok":false}'); }
    });
    return;
  }
  if (p === '/api/save' && req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const s = store.load(token);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !!s, save: s }));
    return;
  }
  // общая логика комнаты нужна и браузеру (офлайн-режим с ботом)
  if (p === '/server/room.js') { // отдельный маршрут: room.js лежит в public/server/
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(path.join(__dirname, '..', 'public', 'server', 'room.js')).pipe(res);
    return;
  }
  let file = path.normalize(path.join(PUBLIC_DIR, p === '/' ? 'index.html' : p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  sendFile(res, file);
});

/* ---------------- WebSocket ---------------- */
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

wss.on('connection', function (ws) {
  let player = null;
  const sendFn = function (obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  ws.on('message', function (raw) {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') {
      if (player) { room.handle(player, m); return; }
      const res = room.join({
        token: m.token, name: m.name, model: m.model, save: m.save,
        send: sendFn
      });
      if (res.full) {
        sendFn({ t: 'full', players: res.players, max: DI.MAX_PLAYERS });
        room.waiting.push(sendFn);
        ws.on('close', () => { room.waiting = room.waiting.filter(f => f !== sendFn); });
        return;
      }
      player = res.player;
      return;
    }
    if (player) room.handle(player, m);
  });

  ws.on('close', function () {
    room.waiting = room.waiting.filter(f => f !== sendFn);
    if (player) { room.leave(player, 60000); player = null; }
  });
  ws.on('error', () => {});
});

setInterval(() => { wss.clients.forEach(c => { try { c.ping(); } catch (e) {} }); }, 25000);

server.listen(PORT, HOST, function () {
  console.log('======================================================');
  console.log('  DENI ISLAM — игровой сервер запущен');
  console.log('  URL:      http://' + HOST + ':' + PORT);
  console.log('  Комната:  1 сервер = 2 игрока');
  console.log('  Seed мира:' + room.seed);
  console.log('  Сохранения: ' + DATA_DIR);
  console.log('======================================================');
});

process.on('SIGTERM', () => { room.players.forEach(p => p && room.persist(p)); process.exit(0); });
process.on('SIGINT', () => { room.players.forEach(p => p && room.persist(p)); process.exit(0); });

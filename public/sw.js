/* DENI ISLAM — service worker: установка на главный экран (iPhone/Android),
   офлайн-запуск и быстрый повторный вход. API и WebSocket всегда идут в сеть. */
const VERSION = 'deni-islam-v1.1.0';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/world.js',
  './js/chars.js',
  './js/models.js',
  './js/audio.js',
  './js/net.js',
  './js/util.js',
  './js/localroom.js',
  './shared/protocol.js',
  './server/room.js',
  './vendor/three/three.module.js',
  './vendor/three/three.core.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/apple-touch-icon.png'
];
const HEAVY = [
  './assets/tex/asphalt.png', './assets/tex/paving.png', './assets/tex/brick.png',
  './assets/tex/concrete.png', './assets/tex/facade.png', './assets/tex/wood.png',
  './assets/tex/marble.png', './assets/tex/metal.png', './assets/tex/parquet.png',
  './assets/tex/roof.png', './assets/tex/carpet.png',
  './assets/audio/ambience.wav', './assets/audio/menu.wav',
  './assets/audio/alarm_loop.wav', './assets/audio/wind.wav',
  './assets/audio/radio1.wav', './assets/audio/radio2.wav', './assets/audio/radio3.wav'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
    // тяжёлые ассеты докачиваем в фоне
    const cache = await caches.open(VERSION);
    HEAVY.forEach(async url => {
      try {
        const has = await cache.match(url);
        if (!has) {
          const res = await fetch(url, { cache: 'force-cache' });
          if (res && res.ok) cache.put(url, res.clone());
        }
      } catch (err) {}
    });
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.startsWith('/ws')) return;

  // network-first для HTML (чтобы обновления прилетали сразу), cache-first для остального
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});

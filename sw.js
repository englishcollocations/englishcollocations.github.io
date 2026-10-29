/* English Collocations — service worker
   - App shell: network-first (fresh after deploys), cache fallback offline
   - Lesson texts: stale-while-revalidate
   - Audio: served from the download cache (with HTTP Range support) or network */
const VERSION = 'v2.2.0';
const SHELL_CACHE = `ec-shell-${VERSION}`;
const DATA_CACHE = 'ec-data-v1';
const AUDIO_CACHE = 'ec-audio-v1';
const KEEP = [SHELL_CACHE, DATA_CACHE, AUDIO_CACHE];

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'assets/css/app.css',
  'assets/js/main.js',
  'assets/js/core.js',
  'assets/js/player.js',
  'assets/js/views.js',
  'assets/js/icons.js',
  'data/lessons.json',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  ...Array.from({ length: 50 }, (_, i) => `assets/emoji/${String(i + 1).padStart(2, '0')}.png`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Carry audio downloaded by the previous version of the app over to the new cache.
    const audio = await caches.open(AUDIO_CACHE);
    for (const name of names.filter((n) => n.startsWith('english-collocations') && n.endsWith('-audio'))) {
      try {
        const old = await caches.open(name);
        for (const req of await old.keys()) {
          if (await audio.match(req.url)) continue;
          const res = await old.match(req);
          if (res && res.status === 200) await audio.put(req.url, res);
        }
      } catch { /* best effort */ }
    }
    await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.endsWith('.mp3')) { event.respondWith(audioResponse(req)); return; }
  if (path.endsWith('.pdf')) return; // large; let the browser handle it
  if (path.includes('/assets/emoji/')) { event.respondWith(cacheFirst(req, SHELL_CACHE)); return; }
  if (req.mode === 'navigate') { event.respondWith(navigation(event)); return; }
  if (path.includes('/texts/') || path.includes('/collocations/')) { event.respondWith(staleWhileRevalidate(req, DATA_CACHE)); return; }
  event.respondWith(networkFirst(req, SHELL_CACHE));
});

async function navigation(event) {
  try {
    const preload = await event.preloadResponse;
    const res = preload || await fetchWithTimeout(event.request, 4000);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('index.html', res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('index.html')) || (await cache.match('./')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => { if (res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    // no-cache: always revalidate with the server (cheap 304s) so a deploy never mixes old and new modules
    fetch(req, { cache: 'no-cache' }).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Downloaded audio, with Range support (Safari requires 206 responses for media).
let lastAudio = { url: '', buf: null };
async function audioResponse(req) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(req.url, { ignoreSearch: true, ignoreVary: true });
  if (!cached) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return cached;
  let buf = lastAudio.url === req.url ? lastAudio.buf : null;
  if (!buf) { buf = await cached.arrayBuffer(); lastAudio = { url: req.url, buf }; }
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

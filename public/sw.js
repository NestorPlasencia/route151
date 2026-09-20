// Service worker de Route 151: permite instalar la app y usarla sin conexion.
// Sube VERSION cuando cambie la estrategia de cache para descartar la anterior.
const VERSION = 'v1';
const SHELL = `route151-shell-${VERSION}`;
const ASSETS = `route151-assets-${VERSION}`;
const DATA = `route151-data-${VERSION}`;
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/pwa-192.png',
];
const SPRITES = 'https://raw.githubusercontent.com';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL, ASSETS, DATA];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('route151-') && !keep.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Red primero; si no hay conexion, lo ultimo guardado.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ??
      (request.mode === 'navigate' ? await cache.match('/') : undefined);
    if (cached) return cached;
    throw error;
  }
}

// Cache primero: para archivos que no cambian (bundles con hash, sprites).
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque')
    cache.put(request, response.clone()).catch(() => {});
  return response;
}

// Responde con la copia guardada y la actualiza en segundo plano.
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const update = fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(() => {}));
    return cached;
  }
  return update;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === SPRITES) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL));
  } else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/vendor/')) {
    // /vendor/ es el lector de fichas (worker, WASM e idioma): no cambia, y
    // guardado permite escanear sin conexion.
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (/^\/(data|areas|icons|frlg)\//.test(url.pathname)) {
    // Mismo nombre de archivo aunque se regeneren: se refrescan solos.
    event.respondWith(staleWhileRevalidate(event, DATA));
  }
});

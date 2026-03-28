// Minha Vez — Service Worker v6 (network-first, lightweight)
const CACHE_NAME = 'minhavez-v8';
const STATIC_ASSETS = [
  '/css/styles.css',
  '/assets/logo-minhavez-web.png',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for everything, cache fallback only for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip external requests
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('cdn') || url.hostname.includes('cdnjs')) return;
  if (url.hostname.includes('fonts')) return;

  // HTML/JS: always network, no cache
  const isPage = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/';
  if (isPage) return; // Let browser handle directly — no SW interception

  // Static assets: network-first with cache fallback
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

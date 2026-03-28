// Minha Vez — Service Worker v5 (network-first, controlled updates)
const CACHE_NAME = 'minhavez-v7';
const STATIC_ASSETS = [
  '/css/styles.css',
  '/assets/logo-minhavez-web.png',
  '/manifest.json'
];

// Install: cache only truly static assets (do NOT skipWaiting — let page control update)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Skip waiting only when page requests it (user clicked "update" banner)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Activate: clean ALL old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, never cache HTML or JS (only CSS/images)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip external requests entirely
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('cdn') || url.hostname.includes('cdnjs')) return;
  if (url.hostname.includes('fonts')) return;

  // Never cache HTML or JS — always fetch from network
  const isPage = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/';
  if (isPage) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

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

// Lista da Vez — Service Worker v2 (network-first)
const CACHE_NAME = 'listavez-v2';
const STATIC_ASSETS = [
  '/css/styles.css',
  '/assets/logo-tc.png',
  '/manifest.json'
];

// Install: cache only truly static assets (CSS, images)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
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

// Fetch: network-first (always try network, fallback to cache)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip Supabase API calls entirely
  if (url.hostname.includes('supabase')) return;
  // Skip CDN calls
  if (url.hostname.includes('cdn') || url.hostname.includes('cdnjs')) return;

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

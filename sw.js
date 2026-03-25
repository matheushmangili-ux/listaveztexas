// Lista da Vez — Service Worker v1.0
const CACHE_NAME = 'listavez-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/tablet.html',
  '/dashboard.html',
  '/css/styles.css',
  '/js/supabase-config.js',
  '/js/auth.js',
  '/js/utils.js',
  '/assets/logo-tc.png',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for Supabase API calls
  if (url.hostname.includes('supabase')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

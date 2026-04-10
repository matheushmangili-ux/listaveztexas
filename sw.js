// Minha Vez — Service Worker (network-first, offline-capable)
// Bump CACHE_VERSION on each deploy to bust stale caches
const CACHE_VERSION = '12';
const CACHE_NAME = 'minhavez-v' + CACHE_VERSION;
const STATIC_ASSETS = [
  '/tablet.html',
  '/index.html',
  '/dashboard.html',
  '/settings.html',
  '/css/styles.css',
  '/css/dashboard.css',
  '/css/tablet.css',
  '/js/constants.js',
  '/js/utils.js',
  '/js/supabase-config.js',
  '/js/tenant.js',
  '/js/ui.js',
  '/js/sound.js',
  '/js/update-checker.js',
  '/js/tablet-atendimento.js',
  '/js/tablet-celebrations.js',
  '/js/tablet-footer.js',
  '/js/tablet-queue.js',
  '/js/tablet-turno.js',
  '/js/auth.js',
  '/js/dashboard-api.js',
  '/js/dashboard-charts.js',
  '/js/dashboard-config.js',
  '/js/changelog.js',
  '/assets/logo-minhavez-new.png',
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

// Fetch: network-first for everything, cache fallback for offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip Supabase API/realtime/auth — never intercept these
  if (url.hostname.includes('supabase')) return;

  // Skip external CDN resources (fonts, font-awesome, supabase-js CDN)
  if (url.hostname.includes('cdn') || url.hostname.includes('cdnjs')) return;
  if (url.hostname.includes('fonts')) return;

  // Network-first with cache fallback for all same-origin requests
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

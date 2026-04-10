// Minha Vez — Service Worker
// Cache-first para estáticos (CSS, JS, imagens) — economiza banda
// Network-first para HTML e APIs — sempre pega a versão mais fresca
// Bump CACHE_VERSION a cada deploy
const CACHE_VERSION = '17';
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
  '/js/tablet-init.js',
  '/js/tablet-queue.js',
  '/js/tablet-turno.js',
  '/js/auth.js',
  '/js/dashboard-api.js',
  '/js/dashboard-charts.js',
  '/js/dashboard-config.js',
  '/js/dashboard-init.js',
  '/js/changelog.js',
  '/assets/logo-minhavez-new.png',
  '/manifest.json'
];

const STATIC_EXTENSIONS = /\.(css|js|png|jpg|jpeg|svg|woff2?|ttf|eot|ico)(\?.*)?$/i;

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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca interceptar Supabase / CDNs externos
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('cdn') || url.hostname.includes('cdnjs')) return;
  if (url.hostname.includes('fonts')) return;

  // Só same-origin
  if (url.origin !== self.location.origin) return;

  const isStatic = STATIC_EXTENSIONS.test(url.pathname);

  if (isStatic) {
    // Cache-first: responde do cache imediatamente, revalida em background
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchAndUpdate = fetch(e.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchAndUpdate;
      })
    );
    return;
  }

  // HTML / outros: network-first, cache fallback
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

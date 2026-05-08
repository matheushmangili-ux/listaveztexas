// Minha Vez — Service Worker
// Cache-first para estáticos (CSS, JS, imagens) — economiza banda
// Network-first para HTML e APIs — sempre pega a versão mais fresca
// Web Push listener pro minhavez Vendedor
// Bump CACHE_VERSION a cada deploy
const CACHE_VERSION = '133';
const CACHE_NAME = 'minhavez-v' + CACHE_VERSION;
const STATIC_ASSETS = [
  '/tablet.html',
  '/index.html',
  '/dashboard.html',
  '/dashboard-vendedor.html',
  '/dashboard-operacional.html',
  '/settings.html',
  '/vendor.html',
  '/css/tokens.v54.css',
  '/css/components.v54.css',
  '/css/tablet.v54.css',
  '/css/dashboard.v54.css',
  '/css/vendor.v54.css',
  '/js/components/mv-logo.js',
  '/js/components/mv-loader.js',
  '/assets/logo/mv-chevron-primary.svg',
  '/js/constants.js',
  '/js/utils.js',
  '/js/supabase-config.js',
  '/js/tenant.js',
  '/js/ui.js',
  '/js/sound.js',
  '/js/update-checker.js',
  '/js/analytics.js',
  '/js/sentry.js',
  '/js/tour.js',
  '/js/tablet-atendimento.js',
  '/js/tablet-celebrations.js',
  '/js/tablet-footer.js',
  '/js/tablet-init.js',
  '/js/tablet-queue.js',
  '/js/tablet-ruptura.js',
  '/js/tablet-turno.js',
  '/js/vendor-init.js',
  '/js/vendor-home.js',
  '/js/vendor-announcements.js',
  '/js/vendor-xp.js',
  '/js/vendor-missions.js',
  '/js/vendor-achievements.js',
  '/js/vendor-avatar.js',
  '/js/vendor-vm.js',
  '/js/ai-assist.js',
  '/js/dashboard-vm.js',
  '/js/dashboard-missions.js',
  '/js/dashboard-ai.js',
  '/js/auth.js',
  '/js/dashboard-api.js',
  '/js/dashboard-charts.js',
  '/js/dashboard-config.js',
  '/js/dashboard-init.js',
  '/js/dashboard-announcements.js',
  '/js/dashboard-xp-config.js',
  '/js/changelog.js',
  '/assets/logo-minhavez-transparent.png',
  '/assets/icon-notification-256.png',
  '/manifest.json',
  '/vendor-manifest.json',
  '/tablet-manifest.json'
];

const STATIC_EXTENSIONS = /\.(css|js|png|jpg|jpeg|svg|woff2?|ttf|eot|ico)(\?.*)?$/i;

// Precache resiliente: 1 asset 404 não derruba o batch inteiro.
// Histórico: na migração v52→v54, refs mortas no STATIC_ASSETS faziam
// cache.addAll() rejeitar — SW novo nunca instalava, clientes ficavam
// presos ao SW antigo servindo CSS deletado. allSettled isola.
async function precache(cache) {
  const results = await Promise.allSettled(
    STATIC_ASSETS.map(url => cache.add(url))
  );
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? STATIC_ASSETS[i] : null))
    .filter(Boolean);
  if (failed.length) {
    console.warn('[sw] precache skipped (404 ou erro):', failed);
  }
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(precache));
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

// ─── Web Push listener (minhavez Vendedor) ───
// Recebe push do Supabase Edge Function send-vendor-push quando
// o vendedor vira #1 na fila. Payload esperado:
//   { title, body, tag, url, vendedor_id }
self.addEventListener('push', event => {
  let data = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad payload');
    data = {
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : null,
      body: typeof parsed.body === 'string' ? parsed.body.slice(0, 250) : null,
      tag: typeof parsed.tag === 'string' ? parsed.tag.slice(0, 50) : null,
      url: (typeof parsed.url === 'string' && parsed.url.startsWith('/')) ? parsed.url : null,
      vendedor_id: parsed.vendedor_id || null
    };
  } catch (err) {
    data = { title: 'Sua vez! 🎯', body: 'Cliente esperando por você' };
  }

  const title = data.title || 'minhavez Vendedor';
  const options = {
    body: data.body || 'Você é o próximo da fila',
    icon: '/assets/icon-notification-256.png',
    badge: '/assets/icon-notification-256.png',
    tag: data.tag || 'minhavez-push',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200, 100, 400],
    data: {
      url: data.url || '/vendor.html',
      vendedor_id: data.vendedor_id || null,
      ts: Date.now()
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click → foca ou abre vendor.html ───
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/vendor.html';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Foca aba existente do vendor se tiver
    for (const client of allClients) {
      const u = new URL(client.url);
      if (u.pathname === targetUrl && 'focus' in client) {
        return client.focus();
      }
    }
    // Ou abre nova
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});

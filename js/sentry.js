// minhavez — Sentry error tracking (loader script pattern)
//
// Setup:
//   <script>
//     window.PUBLIC_SENTRY_DSN = 'https://xxx@oXXX.ingest.sentry.io/YYY';
//     window.PUBLIC_SENTRY_ENV = 'production'; // ou 'preview' / 'dev'
//   </script>
//   <script type="module" src="/js/sentry.js"></script>
//
// Sem DSN configurado, vira no-op. Free tier 5k events/mo já cobre
// projeto de tamanho minhavez folgadamente.

const DSN = (typeof window !== 'undefined' && window.PUBLIC_SENTRY_DSN) || '';
const ENV = (typeof window !== 'undefined' && window.PUBLIC_SENTRY_ENV) || 'production';

// Stub seguro pra inline scripts
const noop = () => {};
window.minhavezSentry = {
  captureException: noop,
  captureMessage: noop,
  setUser: noop,
  setTag: noop,
  setContext: noop,
  addBreadcrumb: noop,
  ready: false
};

if (DSN && !location.hostname.includes('localhost')) {
  // Carrega Sentry browser SDK lazy via CDN
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.45.1/bundle.min.js';
  script.crossOrigin = 'anonymous';
  script.async = true;
  script.onload = () => {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn: DSN,
      environment: ENV,
      release: window.MINHAVEZ_VERSION || 'unknown',
      sampleRate: 1.0, // 100% das exceções (são raras)
      tracesSampleRate: 0, // sem performance tracing por ora
      // PII: minhavez já foge de coletar dados sensíveis no client
      sendDefaultPii: false,
      // Não captura erros de extensões / scripts third-party
      ignoreErrors: [
        'top.GLOBALS',
        /^Extension\s/,
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        // Network failures (offline, abort) — são esperados num PWA
        'NetworkError',
        'Failed to fetch',
        'AbortError'
      ],
      denyUrls: [
        /chrome-extension:\/\//,
        /moz-extension:\/\//,
        /^https:\/\/cdn\.jsdelivr\.net/, // CDN scripts (intro.js etc)
        /^https:\/\/cdnjs\.cloudflare\.com/
      ],
      beforeSend(event) {
        // Filtro extra: descarta eventos sem stack útil
        if (event.exception?.values?.[0]?.stacktrace?.frames?.length === 0) return null;
        return event;
      }
    });
    // Substitui stub pelo real
    window.minhavezSentry = {
      captureException: (err, ctx) => window.Sentry.captureException(err, ctx),
      captureMessage: (msg, level) => window.Sentry.captureMessage(msg, level),
      setUser: (u) => window.Sentry.setUser(u),
      setTag: (k, v) => window.Sentry.setTag(k, v),
      setContext: (k, v) => window.Sentry.setContext(k, v),
      addBreadcrumb: (b) => window.Sentry.addBreadcrumb(b),
      ready: true
    };
    // Auto-identify via Supabase
    setTimeout(async () => {
      try {
        if (window._supabase) {
          const {
            data: { user }
          } = await window._supabase.auth.getUser();
          if (user) window.minhavezSentry.setUser({ id: user.id, email: user.email });
        }
        // Tag tenant (do path /:slug/...)
        const slug = location.pathname.split('/')[1];
        if (slug && !['landing', 'index.html', 'termos', 'privacidade'].includes(slug)) {
          window.minhavezSentry.setTag('tenant', slug);
        }
      } catch {}
    }, 1500);
  };
  document.head.appendChild(script);

  // Buffer de exceções pré-load (caso explodam antes do SDK carregar)
  const earlyErrors = [];
  const earlyHandler = (e) => earlyErrors.push(e);
  window.addEventListener('error', earlyHandler);
  window.addEventListener('unhandledrejection', earlyHandler);
  // Drena buffer quando SDK carrega
  const drain = setInterval(() => {
    if (window.minhavezSentry.ready) {
      earlyErrors.forEach((e) => {
        const err = e.error || e.reason || new Error(String(e.message || e));
        window.minhavezSentry.captureException(err);
      });
      earlyErrors.length = 0;
      window.removeEventListener('error', earlyHandler);
      window.removeEventListener('unhandledrejection', earlyHandler);
      clearInterval(drain);
    }
  }, 500);
  setTimeout(() => clearInterval(drain), 10000); // desiste após 10s
}

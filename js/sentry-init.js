// ============================================
// minhavez — Sentry init compartilhado
// ============================================
// Carregado via <script src="/js/sentry-init.js"> logo depois do loader
// do Sentry (js.sentry-cdn.com). O loader cria `window.Sentry.onLoad` que
// usamos pra configurar quando o SDK real chegar.
//
// Environment é auto-detectado via path (vendor / tablet / dashboard /
// landing / auth) pra filtrar erros por contexto no dashboard do Sentry.
// ============================================

(function () {
  if (typeof window.Sentry === 'undefined' || typeof window.Sentry.onLoad !== 'function') {
    // Loader não carregou (bloqueado por adblock, rede off, etc.). Segue o
    // baile — app funciona sem observabilidade, só não teremos telemetria.
    return;
  }

  function detectEnv() {
    const p = (location.pathname || '').toLowerCase();
    if (p.endsWith('vendor.html')) return 'vendor';
    if (p.endsWith('tablet.html')) return 'tablet';
    if (p.includes('dashboard')) return 'dashboard';
    if (p.endsWith('settings.html')) return 'settings';
    if (p.endsWith('setup.html')) return 'setup';
    if (p.endsWith('forgot-password.html') || p.endsWith('reset-password.html')) return 'auth';
    if (p.endsWith('landing.html')) return 'landing';
    if (p.endsWith('index.html') || p === '/' || p === '') return 'login';
    return 'other';
  }

  window.Sentry.onLoad(function () {
    window.Sentry.init({
      dsn: 'https://2281ed2b3027429746fd575a47c75046@o4511269047500800.ingest.us.sentry.io/4511269057003520',
      environment: detectEnv(),
      release: 'minhavez@v52',

      // Error-only por enquanto. Tracing/Replay desligados pra não estourar
      // quota grátis e evitar PII em gravação de sessão.
      sampleRate: 1.0,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,

      // Ruído comum do browser que não é bug nosso.
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        // Safari iOS faz isso ao trocar de aba rápido
        'AbortError',
        'The operation was aborted',
        // Storage quota em modo privado
        'QuotaExceededError'
      ],

      // Fontes que não controlamos — erros delas não vão pro nosso Sentry.
      denyUrls: [/extensions?\//i, /^chrome(-extension)?:\/\//i, /^moz-extension:\/\//i, /googletagmanager/i]
    });

    // Sanitiza PII antes de enviar. Dois vetores:
    //   1. Campos com "password" em breadcrumbs de ui.input
    //   2. Query strings que podem ter email/senha em chamadas RPC
    window.Sentry.addEventProcessor(function (event) {
      try {
        if (Array.isArray(event.breadcrumbs)) {
          event.breadcrumbs = event.breadcrumbs.map(function (b) {
            if (!b) return b;
            const msg = (b.message || '').toLowerCase();
            if (b.category === 'ui.input' || msg.includes('password') || msg.includes('senha')) {
              return Object.assign({}, b, { message: '[input]', data: undefined });
            }
            return b;
          });
        }
        if (event.request && typeof event.request.data === 'string') {
          if (/password|senha|token/i.test(event.request.data)) {
            event.request.data = '[REDACTED]';
          }
        }
      } catch (_e) {
        // sanitizer não pode quebrar o envio — engole
      }
      return event;
    });

    // Tag de tenant (slug) quando disponível. Útil pra filtrar erros por
    // cliente quando tivermos múltiplos tenants em produção.
    try {
      const slug = localStorage.getItem('lv-last-slug');
      if (slug) window.Sentry.setTag('tenant_slug', slug);
    } catch (_e) {
      // localStorage bloqueado em modo privado — ignora
    }
  });
})();

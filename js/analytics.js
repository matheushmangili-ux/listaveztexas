// minhavez — Analytics wrapper (PostHog)
//
// Setup:
//   <script>window.PUBLIC_POSTHOG_KEY = 'phc_xxx'; window.PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';</script>
//   <script type="module" src="/js/analytics.js"></script>
//
// Sem a key configurada, vira no-op (não quebra em dev/preview).

const KEY  = (typeof window !== 'undefined' && window.PUBLIC_POSTHOG_KEY)  || '';
const HOST = (typeof window !== 'undefined' && window.PUBLIC_POSTHOG_HOST) || 'https://us.i.posthog.com';

// Stub seguro pra quando PostHog não está carregado / configurado
const noop = () => {};
const stub = {
  capture: noop,
  identify: noop,
  reset: noop,
  register: noop,
  setPersonProperties: noop,
  isFeatureEnabled: () => false,
  ready: false,
};

// Exporta global pra inline scripts conseguirem chamar
window.minhavezAnalytics = stub;

if (KEY) {
  // Snippet oficial PostHog (loader assíncrono)
  /* eslint-disable */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing alias debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* eslint-enable */
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // explicit events only
    disable_session_recording: true,
  });
  // Substitui stub pelo real
  window.minhavezAnalytics = {
    capture: (event, props) => posthog.capture(event, props),
    identify: (id, props) => posthog.identify(id, props),
    reset: () => posthog.reset(),
    register: (props) => posthog.register(props),
    setPersonProperties: (props) => posthog.setPersonProperties(props),
    isFeatureEnabled: (key) => posthog.isFeatureEnabled(key),
    ready: true,
  };
}

// Auto-identify se houver supabase user na sessão (carrega lazy)
(async () => {
  if (!window.minhavezAnalytics.ready) return;
  try {
    if (window._supabase) {
      const { data: { user } } = await window._supabase.auth.getUser();
      if (user) {
        window.minhavezAnalytics.identify(user.id, { email: user.email });
      }
    }
  } catch {}
})();

// Helper conveniente pra capturar evento + UTM da URL na hora
export function track(event, props = {}) {
  const url = new URL(window.location.href);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = url.searchParams.get(k);
    if (v) utm[k] = v;
  });
  window.minhavezAnalytics.capture(event, { ...utm, ...props });
}

// Auto-track UTMs na primeira pageview (persiste em sessionStorage pra eventos posteriores)
(() => {
  const url = new URL(window.location.href);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = url.searchParams.get(k);
    if (v) utm[k] = v;
  });
  if (Object.keys(utm).length) {
    sessionStorage.setItem('mv-utm', JSON.stringify(utm));
    if (window.minhavezAnalytics.ready) {
      window.minhavezAnalytics.register(utm);
    }
  } else {
    const stored = sessionStorage.getItem('mv-utm');
    if (stored && window.minhavezAnalytics.ready) {
      window.minhavezAnalytics.register(JSON.parse(stored));
    }
  }
})();

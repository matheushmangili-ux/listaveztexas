// ============================================
// minhavez — PostHog init compartilhado
// ============================================
// Product analytics pra entender o funil (vendor/tablet/dashboard).
// Instalado via snippet oficial (loader async). Autocapture DESLIGADO —
// events sao disparados manualmente nos fluxos criticos pra controle
// de PII (evita gravar nomes de clientes, valores de venda, etc.).
//
// Environment detectado via URL path (mesma logica do sentry-init).
// Release tag bate com v52 pra cruzar com Sentry quando precisar
// correlacionar erro + comportamento de user.
// ============================================

(function () {
  // prettier-ignore
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  function detectAppContext() {
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

  try {
    window.posthog.init('phc_mxauxpwWdL9gGNcpQTEyrwjJsnV6kytaYvZgQNQMxrBS', {
      api_host: 'https://us.i.posthog.com',

      // Autocapture OFF — events manuais nos fluxos criticos. Evita
      // capturar texto de elementos com PII (nomes de clientes, valores
      // de venda, motivos de perda com texto livre, etc.).
      autocapture: false,

      // Perfil so depois de identify() explicito. Reduz quota e nao cria
      // ghost profiles de visitantes anonimos da landing.
      person_profiles: 'identified_only',

      // Pageviews automaticos (basico pra funil de onboarding).
      capture_pageview: true,
      capture_pageleave: true,

      // Belt-and-suspenders: mesmo com Session Replay off na UI, trava aqui
      // tb. Replay seria LGPD-pesado (grava tela inteira com dados).
      disable_session_recording: true,

      // Bloqueia properties que podem virar PII se entrarem por acidente
      // via evento customizado descuidado.
      property_blacklist: ['$password', '$token', 'password', 'senha', 'token']
    });

    // Super properties + tenant tag apos init. Colocar no `loaded` callback
    // seria mais correto, mas o stub enfileira chamadas ate o SDK carregar —
    // entao aqui funciona igual.
    window.posthog.register({
      app_context: detectAppContext(),
      release: 'v52'
    });
    try {
      const slug = localStorage.getItem('lv-last-slug');
      if (slug) window.posthog.register({ tenant_slug: slug });
    } catch (_e) {
      // localStorage bloqueado em modo privado — ignora
    }
  } catch (_e) {
    // PostHog pode falhar se adblock ou rede off — app segue sem analytics.
  }
})();

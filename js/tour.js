// minhavez — Onboarding tour (intro.js wrapper)
//
// Uso: importar e chamar startTour('dashboard') ou startTour('tablet').
// Trigger automático na primeira visita (flag localStorage `mv-tour-${kind}-done`).

const INTROJS_CSS = 'https://cdn.jsdelivr.net/npm/intro.js@7.2.0/minified/introjs.min.css';
const INTROJS_JS  = 'https://cdn.jsdelivr.net/npm/intro.js@7.2.0/minified/intro.min.js';

const TOURS = {
  dashboard: {
    steps: [
      {
        intro: '<strong>Bem-vindo ao minhavez Dashboard.</strong><br>Em 30s vou te mostrar onde está cada coisa. Pode pular a qualquer momento.',
      },
      {
        element: '.sidebar',
        intro: '📊 <strong>Sidebar</strong> — navegação entre os módulos: vendas, vendedores, compras (carrinho), settings.',
        position: 'right',
      },
      {
        element: '#kpiCards, .kpi-grid, [data-tour="kpis"]',
        intro: '⚡ <strong>KPIs</strong> ao vivo: vendas, ticket médio, conversão. Atualizam em tempo real conforme o tablet registra atendimento.',
        position: 'bottom',
      },
      {
        element: '#btnAi, [data-tour="ai-assist"], .ai-assist-btn',
        intro: '🤖 <strong>IA Assist</strong> — gera resumo do turno, sugere missões, prevê pico, dá dicas pros vendedores. Tudo com base nos seus dados reais.',
        position: 'left',
      },
      {
        element: '#periodTabs, [data-tour="period"]',
        intro: '📆 <strong>Filtro de período</strong> — hoje, ontem, 7d, 30d, mês, customizado. Tudo que você vê na tela respeita esse filtro.',
        position: 'bottom',
      },
    ],
  },
  tablet: {
    steps: [
      {
        intro: '<strong>Tablet do balcão.</strong><br>Tour rápido pra você operar a fila em segundos.',
      },
      {
        element: '.t-header, [data-tour="header"]',
        intro: '🏷️ <strong>Header</strong> com KPIs do turno: atendidos, em pausa, na fila. Sempre visível.',
        position: 'bottom',
      },
      {
        element: '.setor-tabs, [data-tour="setores"]',
        intro: '🎯 <strong>Setores</strong> — Masculino, Feminino, Calçados, Caixa. Toca pra filtrar a fila.',
        position: 'bottom',
      },
      {
        element: '.queue-list, [data-tour="queue"]',
        intro: '👥 <strong>Fila</strong> — vendedor da vez no topo. Toca pra começar atendimento, registrar venda, ou pausar.',
        position: 'top',
      },
    ],
  },
};

function loadDeps() {
  return new Promise((resolve, reject) => {
    if (window.introJs) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = INTROJS_CSS;
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = INTROJS_JS;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function startTour(kind, opts = {}) {
  const config = TOURS[kind];
  if (!config) return;
  await loadDeps();
  const intro = window.introJs();
  intro.setOptions({
    steps: config.steps,
    nextLabel: 'Próximo →',
    prevLabel: '← Voltar',
    doneLabel: 'Beleza, comecei',
    skipLabel: '×',
    showBullets: true,
    showProgress: true,
    overlayOpacity: 0.6,
    tooltipClass: 'mv-introjs-tooltip',
    exitOnOverlayClick: false,
  });
  window.minhavezAnalytics?.capture('tour_started', { kind });
  intro.onbeforechange((target, idx) => {
    window.minhavezAnalytics?.capture('tour_step_view', { kind, step: idx });
  });
  intro.oncomplete(() => {
    window.minhavezAnalytics?.capture('tour_completed', { kind });
    if (!opts.dontMark) localStorage.setItem(`mv-tour-${kind}-done`, '1');
  });
  intro.onexit(() => {
    if (!intro._completed) window.minhavezAnalytics?.capture('tour_skipped', { kind });
    if (!opts.dontMark) localStorage.setItem(`mv-tour-${kind}-done`, '1');
  });
  intro.start();
}

export function startTourIfFirstTime(kind) {
  if (localStorage.getItem(`mv-tour-${kind}-done`)) return;
  // Espera 600ms pra UI carregar primeiro
  setTimeout(() => startTour(kind), 600);
}

// Expor global pro botão "?" inline nos headers
window.minhavezTour = { start: startTour, startIfFirstTime: startTourIfFirstTime };

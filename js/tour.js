// minhavez — Onboarding tour (intro.js wrapper)
//
// Uso: importar e chamar startTour('dashboard') ou startTour('tablet').
// Trigger automático na primeira visita (flag localStorage `mv-tour-${kind}-done`).

const INTROJS_CSS = 'https://cdn.jsdelivr.net/npm/intro.js@7.2.0/minified/introjs.min.css';
const INTROJS_JS = 'https://cdn.jsdelivr.net/npm/intro.js@7.2.0/minified/intro.min.js';

const TOUR_VERSION = '2'; // bump pra invalidar done antigos

const TOURS = {
  dashboard: {
    steps: [
      {
        intro:
          '<strong>Bem-vindo ao minhavez Dashboard.</strong><br>Em 30s vou te mostrar onde está cada coisa. Pode pular a qualquer momento.'
      },
      {
        element: '.dash-sidebar',
        intro:
          '📊 <strong>Sidebar</strong> — navegação entre Dashboard, Tablet, Comunicados, Gamificação, Missões, VM Photos, IA Assist e Configurações.',
        position: 'right'
      },
      {
        element: '#dashDropdown',
        intro:
          '🧭 <strong>3 visões do Dashboard</strong> — Visão Geral (overview), Por Vendedor (ranking + performance), Operacional (rupturas + pausas).',
        position: 'right'
      },
      {
        element: '.topbar-stripe',
        intro:
          '📆 <strong>Filtro de período</strong> — Hoje, Ontem, Semana, Mês, ou customizado. Tudo na tela respeita esse filtro.',
        position: 'bottom'
      },
      {
        element: '.hero-kpi',
        intro:
          '⚡ <strong>KPIs em destaque</strong> — Atendimentos, Vendas e Taxa de Conversão do período, com gráfico inline comparando Hoje vs Ontem.',
        position: 'bottom'
      },
      {
        element: '#linkAi',
        intro:
          '🤖 <strong>IA Assist</strong> — gera resumo do turno, sugere missões e prevê pico de fluxo. Tudo com base nos seus dados reais.',
        position: 'right'
      }
    ]
  },
  tablet: {
    steps: [
      {
        intro: '<strong>Tablet do balcão.</strong><br>Tour rápido pra você operar a fila em segundos.'
      },
      {
        element: '.t-header',
        intro: '🏷️ <strong>Header</strong> com KPIs do turno: atendidos, vendas e conversão. Sempre visível.',
        position: 'bottom'
      },
      {
        element: '#setorTabs',
        intro: '🎯 <strong>Setores</strong> — toca pra filtrar a fila pelo setor (Loja, Chapelaria, Selaria, etc).',
        position: 'bottom'
      },
      {
        element: '.queue-list',
        intro:
          '👥 <strong>Fila</strong> — vendedor da vez no topo. Toca pra começar atendimento, registrar venda, ou pausar.',
        position: 'top'
      },
      {
        element: '.t-footer',
        intro:
          '👤 <strong>Vendedores</strong> — arrasta card pra reposicionar na fila. Status em tempo real de cada um.',
        position: 'top'
      }
    ]
  }
};

function loadDeps() {
  return new Promise((resolve, reject) => {
    if (window.introJs) {
      resolve();
      return;
    }
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
  const steps = config.steps.filter((step) => !step.element || document.querySelector(step.element));
  intro.setOptions({
    steps,
    nextLabel: 'Próximo →',
    prevLabel: '← Voltar',
    doneLabel: 'Beleza, comecei',
    skipLabel: '×',
    showBullets: true,
    showProgress: true,
    overlayOpacity: 0.6,
    tooltipClass: 'mv-introjs-tooltip',
    exitOnOverlayClick: false
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
  // Invalida tour-done antigos quando TOUR_VERSION muda (reaplica o onboarding
  // após redesigns grandes, tipo o Stripe-style de abril/2026)
  const storedVersion = localStorage.getItem('mv-tour-version');
  if (storedVersion !== TOUR_VERSION) {
    localStorage.removeItem('mv-tour-dashboard-done');
    localStorage.removeItem('mv-tour-tablet-done');
    localStorage.setItem('mv-tour-version', TOUR_VERSION);
  }
  if (localStorage.getItem(`mv-tour-${kind}-done`)) return;
  // Espera 600ms pra UI carregar primeiro
  setTimeout(() => startTour(kind), 600);
}

// Expor global pro botão "?" inline nos headers
window.minhavezTour = { start: startTour, startIfFirstTime: startTourIfFirstTime };

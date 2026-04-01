// ============================================
// MinhaVez — Dashboard Constants & Config
// ============================================

export const CHART_HEIGHT = 320;          // ApexCharts internal height (chart-box = 340px)
export const CHART_TAB_KEY = 'minhavez_chart_tab';
export const METAS_KEY = 'minhavez_metas';
export const DEFAULT_METAS = { conversao: 70, tempo_medio: 30, ticket_medio: 3000 };

// Donut chart palette: pinks/reds → grays (aligned with MOTIVOS palette)
export const ORIGEM_PALETTE = ['#e2506f','#c43d5a','#f0758e','#D4D4D8','#A1A1AA','#818181','#60a5fa','#34d399'];

// Period identifiers
export const PERIODS = {
  HOJE: 'hoje',
  ONTEM: 'ontem',
  SEMANA: 'semana',
  MES: 'mes',
  CUSTOM: 'custom'
};

// Setor labels (must match values in the database)
export const SETOR_LABELS = {
  loja: 'Vestuário',
  chapelaria: 'Chapelaria',
  selaria: 'Selaria'
};

// Animation durations (ms)
export const ANIM = {
  COUNT_UP: 1200,
  CHART_SPEED: 600,
  DEBOUNCE_RT: 800,         // realtime reload debounce
  DEBOUNCE_ATEND: 500       // atendimento reload debounce
};

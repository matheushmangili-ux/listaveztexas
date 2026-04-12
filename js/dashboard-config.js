// ============================================
// MinhaVez — Dashboard Constants & Config
// ============================================

export const CHART_HEIGHT = 320; // ApexCharts internal height (chart-box = 340px)
export const CHART_TAB_KEY = 'minhavez_chart_tab';
export const METAS_KEY = 'minhavez_metas';
export const DEFAULT_METAS = { conversao: 70, tempo_medio: 30, ticket_medio: 3000 };

// Donut chart palette: diverse colors for distinct category identification
export const ORIGEM_PALETTE = ['#8ea5c9', '#aaeec4', '#d4a373', '#b8a8d4', '#d4a8c4', '#a8d4d8', '#b8875a', '#9ca3af'];

// Period identifiers
export const PERIODS = {
  HOJE: 'hoje',
  ONTEM: 'ontem',
  SEMANA: 'semana',
  MES: 'mes',
  CUSTOM: 'custom'
};

// Animation durations (ms)
export const ANIM = {
  COUNT_UP: 1200,
  CHART_SPEED: 600,
  DEBOUNCE_RT: 800, // realtime reload debounce
  DEBOUNCE_ATEND: 500 // atendimento reload debounce
};

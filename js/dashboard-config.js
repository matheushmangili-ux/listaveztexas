// ============================================
// MinhaVez — Dashboard Constants & Config
// ============================================

export const CHART_HEIGHT = 320;          // ApexCharts internal height (chart-box = 340px)
export const CHART_TAB_KEY = 'minhavez_chart_tab';
export const METAS_KEY = 'minhavez_metas';
export const DEFAULT_METAS = { conversao: 70, tempo_medio: 30, ticket_medio: 3000 };

// Donut chart palette: diverse colors for distinct category identification
export const ORIGEM_PALETTE = ['#3B82F6','#22C55E','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#F97316','#64748B'];

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
  DEBOUNCE_RT: 800,         // realtime reload debounce
  DEBOUNCE_ATEND: 500       // atendimento reload debounce
};

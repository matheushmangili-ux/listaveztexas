// ============================================
// MinhaVez — Dashboard Charts Module
// Chart rendering, KPIs, load functions, chart tabs
// ============================================

import { fetchCanalStats, fetchRuptureLog, fetchPauseLog, fetchVendedores } from '/js/dashboard-api.js';
import { CHART_TAB_KEY, ORIGEM_PALETTE, DEFAULT_METAS, PERIODS } from '/js/dashboard-config.js';
import { STATUS_CONFIG, MOTIVOS, initials, toast, todayRange, escapeHtml } from '/js/utils.js';
import { CHART_RESIZE_DELAY } from '/js/constants.js';

let _ctx = null;

// Metas por tenant no localStorage (com fallback pra chave antiga sem prefixo).
// Sem prefixo, um gerente vê meta do tenant anterior ao trocar de sessão.
function lsGetMeta(key, tenantId) {
  if (tenantId) {
    const v = localStorage.getItem(`${key}_${tenantId}`);
    if (v != null) return v;
  }
  return localStorage.getItem(key);
}

// ─── Module-level state ───
const charts = {};
const chartTypes = {}; // track rendered type per key to decide reuse vs destroy
let _firstLoad = true;
let _activeChartTab = null;

// ─── Paleta harmonizada (purple + neutros) ───
// Lê o accent atual dos CSS tokens pra refletir mudanças de tema em runtime.
function _cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (_) {
    return fallback;
  }
}
function chartAccent() {
  return {
    accent: _cssVar('--accent', '#a78bfa'),
    accentBright: _cssVar('--accent-bright', '#c4b5fd'),
    accentDim: _cssVar('--accent-dim', '#8b5cf6')
  };
}
// Atalhos legados (mantidos por compat; nomes "mint*" são históricos, valores = accent)
const BRAND_PALETTE = {
  get mint() {
    return chartAccent().accent;
  },
  get mintDeep() {
    return chartAccent().accentDim;
  },
  get mintSoft() {
    return chartAccent().accentBright;
  },
  coral: '#e89b8a',
  coralDeep: '#d47a68',
  sand: '#d4a373',
  sandDeep: '#b8875a',
  dusty: '#8ea5c9',
  dustyDeep: '#6d85ac',
  lavender: '#b8a8d4',
  neutral: '#a3a3a3',
  charcoal: '#2a2a2a'
};

// Donut categórico (motivos, setores, canais)
const CATEGORICAL = ['#a78bfa', '#8ea5c9', '#d4a373', '#b8a8d4', '#e89b8a', '#8b5cf6', '#6d85ac', '#a3a3a3'];
// Dual-series (hoje vs ontem): mint + sand
const DUAL = ['#a78bfa', '#d4a373'];
// Triple: mint (positivo) + dusty (info) + coral (negativo)
const TRIPLE = ['#a78bfa', '#8ea5c9', '#e89b8a'];

// ─── Semantic tempo colors harmonizados ───
function tempoColor(minutes, meta) {
  if (minutes <= meta) return BRAND_PALETTE.mint;
  if (minutes <= meta * 1.3) return BRAND_PALETTE.sand;
  return BRAND_PALETTE.coral;
}

// ─── Unified custom tooltip builder ───
function buildTooltip(title, rows, color) {
  const cc = chartColors();
  let html = `<div style="padding:10px 14px;font-family:Inter Tight,sans-serif;font-size:12px;line-height:1.6;min-width:140px;background:${cc.tooltipBg};border:1px solid ${cc.tooltipBorder};border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15)">`;
  if (title) {
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`;
    if (color)
      html += `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>`;
    html += `<strong style="font-size:13px;color:${cc.tooltipTitle}">${escapeHtml(title)}</strong></div>`;
  }
  rows.forEach(([label, value]) => {
    html += `<div style="color:${cc.tooltipBody}">${escapeHtml(label)}: <strong style="color:${cc.tooltipTitle}">${escapeHtml(String(value))}</strong></div>`;
  });
  html += '</div>';
  return html;
}

// ─── Shared donut chart config factory ───
function donutConfig({ labels, values, colors, total, centerLabel, tooltipFn, events }) {
  const cc = chartColors();
  return {
    chart: { type: 'donut', height: 280, ...(events ? { events } : {}) },
    series: values,
    labels: labels.map((l, i) => l + ' (' + values[i] + ')'),
    colors,
    plotOptions: {
      pie: {
        expandOnClick: true,
        donut: {
          size: '68%',
          labels: {
            show: true,
            name: { show: true, fontSize: '10px', fontWeight: 600, color: cc.textMuted, offsetY: -8 },
            value: {
              show: true,
              fontSize: '28px',
              fontWeight: 700,
              color: cc.centerText,
              offsetY: 4,
              formatter: () => String(total)
            },
            total: {
              show: true,
              label: centerLabel,
              fontSize: '10px',
              fontWeight: 600,
              color: cc.textMuted,
              formatter: () => String(total)
            }
          }
        }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => Math.round(v) + '%',
      dropShadow: { enabled: false },
      style: { fontSize: '11px', fontWeight: 700, fontFamily: "'Inter Tight'" }
    },
    legend: {
      position: 'bottom',
      fontSize: '11px',
      fontWeight: 600,
      fontFamily: "'Inter Tight'",
      labels: { colors: cc.textStrong }
    },
    stroke: { width: 2, colors: [isDarkTheme() ? '#18181B' : '#FFFFFF'] },
    tooltip: {
      custom: tooltipFn,
      // Âncora o tooltip no canto top-right do chart em vez de seguir o cursor.
      // Evita clipping na borda superior do .chart-card (que tem overflow:hidden).
      fixed: { enabled: true, position: 'topRight', offsetX: -8, offsetY: 8 }
    },
    states: { hover: { filter: { type: 'darken', value: 0.82 } }, active: { filter: { type: 'none' } } }
  };
}

/**
 * Initialize dashboard charts module with shared dependencies.
 * @param {object} ctx - Context with state accessors and helpers
 */
export function initDashboardCharts(ctx) {
  _ctx = ctx;
  // Expose to window for onclick handlers in HTML
  window.setChartTab = setChartTab;

  // Restore last tab on load
  const _savedTab = localStorage.getItem(CHART_TAB_KEY);
  if (_savedTab) {
    setChartTab(_savedTab);
  } else {
    setChartTab('geral');
  }
}

// ─── Theme-aware chart colors ───
function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}
function chartColors() {
  const dark = isDarkTheme();
  return {
    text: dark ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.55)',
    textStrong: dark ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.7)',
    textMuted: dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.35)',
    grid: dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)',
    tooltipBg: dark ? '#1E1E2E' : '#FFFFFF',
    tooltipTitle: dark ? '#fff' : '#18181B',
    tooltipBody: dark ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.7)',
    tooltipBorder: dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
    centerText: dark ? '#FAFAFA' : '#18181B',
    datalabel: dark ? '#D4D4D8' : '#3F3F46',
    trackBg: dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'
  };
}

// Error boundary — mostra fallback quando um chart falha
function showChartError(el, key) {
  if (!el) return;
  el.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;color:var(--text-muted);font-size:12px;text-align:center;padding:20px">' +
    '<div><i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;opacity:.6"></i>' +
    '<div>Erro ao renderizar gráfico</div>' +
    '<div style="font-size:10px;opacity:.6;margin-top:4px">' +
    key +
    '</div></div></div>';
}

function applyChartDefaults(options) {
  if (!options.chart) options.chart = {};
  options.chart.fontFamily = options.chart.fontFamily || "'Inter Tight', system-ui, sans-serif";
  if (!options.chart.toolbar) options.chart.toolbar = { show: false };
  if (!options.chart.animations) options.chart.animations = { enabled: true, easing: 'easeinout', speed: 600 };
}

// ApexCharts helper — reusa o chart existente quando possível (updateOptions)
// e cai para destroy+recreate só quando o tipo muda ou updateOptions falha.
function renderChart(key, selector, options) {
  const el = document.querySelector(selector);
  if (!el) return null;
  applyChartDefaults(options);
  const type = options.chart && options.chart.type;

  // Fast path: reusa chart existente com mesmo tipo
  if (charts[key] && chartTypes[key] === type) {
    try {
      charts[key].updateOptions(options, false, true, true);
      return charts[key];
    } catch (err) {
      console.warn('[renderChart:' + key + '] updateOptions falhou, recriando:', err?.message || err);
      // cai para destroy+recreate abaixo
    }
  }

  // Destroy + recreate (primeira render ou mudança de tipo)
  if (charts[key]) {
    try {
      charts[key].destroy();
    } catch {
      /* no-op */
    }
  }
  try {
    el.innerHTML = '';
    charts[key] = new ApexCharts(el, options);
    chartTypes[key] = type;
    charts[key].render();
    return charts[key];
  } catch (err) {
    console.error('[renderChart:' + key + '] falhou:', err);
    showChartError(el, key);
    charts[key] = null;
    chartTypes[key] = null;
    return null;
  }
}

// CountUp animation (first load only)
export function formatTempo(minutes) {
  const m = parseFloat(minutes) || 0;
  if (m === 0) return '0 min';
  if (m < 1) return '< 1 min';
  if (m < 60) return Math.round(m) + ' min';
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem > 0 ? h + 'h ' + rem + 'min' : h + 'h';
}

function countUp(el, endVal, suffix = '', duration = 800, formatter = null) {
  if (!el) return;
  const display = (v) => (formatter ? formatter(v) : v + suffix);
  if (!_firstLoad) {
    el.textContent = display(endVal);
    return;
  }
  const start = performance.now();
  const end = parseFloat(endVal) || 0;
  if (end === 0) {
    el.textContent = display(endVal);
    return;
  }
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const val = Math.round(ease * end * 10) / 10;
    const cur = Number.isInteger(end) ? Math.round(ease * end) : val;
    el.textContent = display(cur);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = display(endVal);
  }
  requestAnimationFrame(step);
}

function renderCompare(elId, current, previous, invertGood = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (previous === 0 || previous == null) {
    el.innerHTML = '<span class="neutral">—</span>';
    return;
  }
  const diff = ((current - previous) / previous) * 100;
  const isUp = diff > 0;
  const isGood = invertGood ? !isUp : isUp;
  const cls = Math.abs(diff) < 1 ? 'neutral' : isGood ? 'up' : 'down';
  const sign = isUp ? '+' : '−';
  const arrow = isUp ? '↑' : '↓';
  el.innerHTML = `<span class="${cls}">${arrow} ${sign}${Math.abs(diff).toFixed(0)}% vs anterior</span>`;
}

// ─── Load all data ───
export async function loadAll() {
  const sb = _ctx.sb;
  const tenantId = _ctx.tenantId;
  const filterSetor = _ctx.filterSetor;
  const filterVendedor = _ctx.filterVendedor;
  const _cachedVendedores = _ctx.cachedVendedores;
  const _kpi = _ctx.kpi;

  const range = _ctx.getRange();
  const prevRange = _ctx.getPrevRange();
  const hasFilter = !!(filterSetor || filterVendedor);
  // Carregar ranking + KPIs em paralelo (são independentes)
  let rankRes;
  try {
    const [rankResult, kpiResult] = await Promise.allSettled([
      sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end }),
      hasFilter ? Promise.resolve(null) : loadKPIs(range, prevRange)
    ]);
    if (kpiResult.status === 'rejected') console.error('[loadKPIs] erro:', kpiResult.reason);
    rankRes = rankResult.status === 'fulfilled' ? rankResult.value : { data: [], error: rankResult.reason };
  } catch (fetchErr) {
    console.error('[loadAll] fetch erro:', fetchErr);
    toast('Erro de conexão. Verifique sua internet e recarregue.', 'error');
    return;
  }
  if (rankRes.error) {
    toast('Erro ao carregar ranking: ' + (rankRes.error?.message || rankRes.error), 'error');
  }
  let cachedRanking = rankRes.data || [];
  // Aplicar filtros no ranking
  if (filterSetor) {
    const setorMap = new Map(_cachedVendedores.map((cv) => [cv.id, cv.setor || 'loja']));
    cachedRanking = cachedRanking.filter((r) => setorMap.get(r.vendedor_id) === filterSetor);
  }
  if (filterVendedor) cachedRanking = cachedRanking.filter((r) => r.vendedor_id === filterVendedor);
  _ctx.cachedRanking = cachedRanking;
  // Se filtro ativo, buscar dados reais dos atendimentos filtrados
  if (hasFilter) {
    // Query direta para KPIs precisos do vendedor/setor filtrado
    let aq = sb
      .from('atendimentos')
      .select('resultado, valor_venda, inicio, fim, preferencial')
      .gte('inicio', range.start)
      .lt('inicio', range.end)
      .neq('resultado', 'em_andamento');
    if (tenantId) aq = aq.eq('tenant_id', tenantId);
    if (filterVendedor) {
      aq = aq.eq('vendedor_id', filterVendedor);
    } else if (filterSetor) {
      const setorIds = _cachedVendedores.filter((v) => (v.setor || 'loja') === filterSetor).map((v) => v.id);
      if (setorIds.length > 0) aq = aq.in('vendedor_id', setorIds);
    }
    const { data: atendData } = await aq;
    const items = atendData || [];
    const totAtend = items.length;
    const totVendas = items.filter((a) => a.resultado === 'venda').length;
    const trocasComValor = items.filter((a) => a.resultado === 'troca' && a.valor_venda > 0).length;
    const totNaoConv = items.filter((a) => a.resultado === 'nao_convertido').length;
    const conv = totAtend > 0 ? Math.round(((totVendas + trocasComValor) / totAtend) * 1000) / 10 : 0;
    const tempos = items.filter((a) => a.inicio && a.fim).map((a) => (new Date(a.fim) - new Date(a.inicio)) / 60000);
    const tempoMed = tempos.length > 0 ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : 0;
    if (_kpi.total) _kpi.total.textContent = totAtend;
    if (_kpi.vendas) _kpi.vendas.textContent = totVendas;
    if (_kpi.conv) _kpi.conv.textContent = conv + '%';
    if (_kpi.loss) _kpi.loss.textContent = totNaoConv;
    if (_kpi.time) _kpi.time.textContent = formatTempo(tempoMed);
    if (_kpi.pref) _kpi.pref.textContent = items.filter((a) => a.preferencial).length;
    ['kpiTotalCmp', 'kpiVendasCmp', 'kpiConvCmp', 'kpiLossCmp', 'kpiTimeCmp', 'kpiPrefCmp'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span class="neutral">filtrado</span>';
    });
  }
  const loaders = [
    ['motivos', loadMotivos(range)],
    ['hourly', loadHourly(range)],
    ['ranking', loadRanking(range, cachedRanking)],
    ['ruptures', loadRuptures(range)],
    ['pauseStats', loadPauseStats(range)],
    ['floor', loadFloor()],
    ['scatter', loadScatter(range, cachedRanking)],
    ['tempoMeta', loadTempoMeta(range, cachedRanking)],
    ['trend', loadTrend(range)],
    ['preferenciais', loadPreferenciais(range)],
    ['origem', loadOrigem(range)]
  ];
  const results = await Promise.allSettled(loaders.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[dashboard.loadAll:' + loaders[i][0] + '] falhou:', r.reason);
    }
  });
  _ctx.updateTimestamp();
}

// ─── KPIs ───
export async function loadKPIs(range, prevRange) {
  const sb = _ctx.sb;
  const _kpi = _ctx.kpi;

  const tenantId = _ctx.tenantId;
  let prefQ = sb
    .from('atendimentos')
    .select('preferencial')
    .gte('inicio', range.start)
    .lt('inicio', range.end)
    .neq('resultado', 'em_andamento');
  let prevPrefQ = sb
    .from('atendimentos')
    .select('preferencial')
    .gte('inicio', prevRange.start)
    .lt('inicio', prevRange.end)
    .neq('resultado', 'em_andamento');
  if (tenantId) {
    prefQ = prefQ.eq('tenant_id', tenantId);
    prevPrefQ = prevPrefQ.eq('tenant_id', tenantId);
  }
  const [curr, prev, currTrocas, prevTrocas, currPrefRes, prevPrefRes] = await Promise.all([
    sb.rpc('get_conversion_stats', { p_inicio: range.start, p_fim: range.end }),
    sb.rpc('get_conversion_stats', { p_inicio: prevRange.start, p_fim: prevRange.end }),
    sb
      .from('atendimentos')
      .select('valor_venda')
      .eq('resultado', 'troca')
      .gte('inicio', range.start)
      .lt('inicio', range.end),
    sb
      .from('atendimentos')
      .select('valor_venda')
      .eq('resultado', 'troca')
      .gte('inicio', prevRange.start)
      .lt('inicio', prevRange.end),
    prefQ,
    prevPrefQ
  ]);
  if (curr.error || !curr.data || curr.data.length === 0) return;
  const d = curr.data[0];
  const p = prev.data?.[0] || {};

  // Recalcular taxa de conversão: vendas + trocas com valor > 0
  function calcConv(stats, trocasData) {
    const vendas = stats.total_vendas || 0;
    const trocasComValor = (trocasData || []).filter((t) => t.valor_venda && t.valor_venda > 0).length;
    const total = stats.total_atendimentos || 0;
    return total > 0 ? Math.round(((vendas + trocasComValor) / total) * 1000) / 10 : 0;
  }
  const convAtual = calcConv(d, currTrocas.data);
  const convAnterior = calcConv(p, prevTrocas.data);

  countUp(_kpi.total, d.total_atendimentos || 0);
  countUp(_kpi.vendas, d.total_vendas || 0);
  countUp(_kpi.conv, convAtual, '%');
  countUp(_kpi.loss, d.total_nao_convertido || 0);
  countUp(_kpi.time, d.tempo_medio_min || 0, '', 800, formatTempo);
  // Fidelizados
  const prefCurr = (currPrefRes.data || []).filter((a) => a.preferencial).length;
  const prefPrev = (prevPrefRes.data || []).filter((a) => a.preferencial).length;
  countUp(_kpi.pref, prefCurr);
  renderCompare('kpiTotalCmp', d.total_atendimentos || 0, p.total_atendimentos || 0);
  renderCompare('kpiVendasCmp', d.total_vendas || 0, p.total_vendas || 0);
  renderCompare('kpiConvCmp', convAtual, convAnterior);
  renderCompare('kpiLossCmp', d.total_nao_convertido || 0, p.total_nao_convertido || 0, true);
  renderCompare('kpiTimeCmp', d.tempo_medio_min || 0, p.tempo_medio_min || 0, true);
  renderCompare('kpiPrefCmp', prefCurr, prefPrev);

  // ─── KPI Sparklines (Conversão + Tempo) ───
  // Sparklines are populated from trend data in loadTrend()

  _ctx._cachedStats = d;
}

// ─── Motivos chart ───
export async function loadMotivos(range) {
  const sb = _ctx.sb;

  const { data, error } = await sb.rpc('get_loss_reasons', { p_inicio: range.start, p_fim: range.end });
  if (error) {
    toast('Erro ao carregar motivos: ' + error.message, 'error');
    return;
  }
  _ctx._cachedMotivos = data || [];
  const el = document.querySelector('#chartMotivos');

  const labels = (data || []).map((d) => MOTIVOS[d.motivo]?.label || d.motivo);
  const values = (data || []).map((d) => d.total);
  const colors = (data || []).map((d) => MOTIVOS[d.motivo]?.color || '#6b7280');

  const totalMotivos = values.reduce((a, b) => a + b, 0);
  const emptyMotivos = document.getElementById('chartMotivosEmpty');
  if (totalMotivos === 0) {
    if (el) el.style.display = 'none';
    if (emptyMotivos) emptyMotivos.style.display = 'block';
    return;
  }
  if (el) el.style.display = '';
  if (emptyMotivos) emptyMotivos.style.display = 'none';

  renderChart(
    'motivos',
    '#chartMotivos',
    donutConfig({
      labels,
      values,
      colors,
      total: totalMotivos,
      centerLabel: 'PERDAS',
      events: {
        dataPointSelection: function (event, chartCtx, config) {
          const idx = config.dataPointIndex;
          const motivo = (data || [])[idx]?.motivo;
          if (motivo && typeof window.openDrillMotivo === 'function') window.openDrillMotivo(motivo, labels[idx]);
        },
        dataPointMouseEnter: function (event) {
          event.target.style.cursor = 'pointer';
        }
      },
      tooltipFn: function ({ series, seriesIndex, dataPointIndex }) {
        const val = series[seriesIndex];
        const pct = Math.round((val / totalMotivos) * 100);
        return (
          buildTooltip(
            labels[dataPointIndex],
            [
              ['Registros', val],
              ['Percentual', pct + '%']
            ],
            colors[dataPointIndex]
          ) +
          '<div style="padding:0 14px 8px;font-size:10px;color:' +
          chartColors().textMuted +
          ';font-family:Inter Tight,sans-serif">Clique para detalhes</div>'
        );
      }
    })
  );
}

// ─── Hourly flow chart ───
export async function loadHourly(range) {
  const sb = _ctx.sb;

  try {
    const isMultiDay = _ctx.currentPeriod === PERIODS.SEMANA || _ctx.currentPeriod === PERIODS.MES;
    // Load main data + today overlay in parallel
    const promises = [sb.rpc('get_hourly_flow', { p_inicio: range.start, p_fim: range.end })];
    if (isMultiDay) {
      const todayR = todayRange();
      promises.push(
        sb.rpc('get_hourly_flow', { p_inicio: todayR.start, p_fim: todayR.end }).then(
          (r) => r,
          () => ({ data: null })
        )
      );
    }
    const results = await Promise.all(promises);
    const { data, error } = results[0];
    if (error) {
      console.error('[loadHourly] RPC error:', error);
      toast('Erro ao carregar fluxo: ' + error.message, 'error');
      return;
    }
    const todayHourlyData = isMultiDay ? results[1]?.data || null : null;

    const el = document.querySelector('#chartHourly');
    const emptyHourly = document.getElementById('chartHourlyEmpty');
    if (!el) {
      console.error('[loadHourly] element not found');
      return;
    }
    if (!data || data.length === 0) {
      el.style.display = 'none';
      if (emptyHourly) emptyHourly.style.display = 'block';
      return;
    }
    el.style.display = '';
    if (emptyHourly) emptyHourly.style.display = 'none';

    // Calculate number of days in range for averaging
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);
    const numDays = Math.max(1, Math.round((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)));

    const hours = (data || []).map((d) => d.hora + 'h');
    const atendRaw = (data || []).map((d) => d.atendimentos);
    const vendasRaw = (data || []).map((d) => d.vendas);
    // For multi-day, show daily average; for single day, show totals
    const atend = isMultiDay ? atendRaw.map((v) => Math.round((v / numDays) * 10) / 10) : atendRaw;
    const vendas = isMultiDay ? vendasRaw.map((v) => Math.round((v / numDays) * 10) / 10) : vendasRaw;

    // Build today overlay for multi-day
    const todayAtendByHour = {};
    if (todayHourlyData) {
      todayHourlyData.forEach((d) => {
        todayAtendByHour[d.hora + 'h'] = d.atendimentos;
      });
    }
    const todayOverlay = isMultiDay ? hours.map((h) => todayAtendByHour[h] || 0) : null;

    // Calcular média
    const avgAtend = atend.length > 0 ? Math.round((atend.reduce((a, b) => a + b, 0) / atend.length) * 10) / 10 : 0;

    // Build series
    const series = [
      { name: isMultiDay ? 'Média Atendimentos' : 'Atendimentos', type: 'bar', data: atend },
      { name: isMultiDay ? 'Média Vendas' : 'Vendas', type: 'bar', data: vendas }
    ];
    if (todayOverlay && todayOverlay.some((v) => v > 0)) {
      series.push({ name: 'Hoje', type: 'line', data: todayOverlay });
    }

    const annotations = {};
    if (avgAtend > 0) {
      const _cc = chartColors();
      const _annBg = isDarkTheme() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)';
      annotations.yaxis = [
        {
          y: avgAtend,
          borderColor: _cc.grid,
          strokeDashArray: 4,
          label: {
            text: (isMultiDay ? 'média/dia ' : 'média ') + avgAtend,
            style: {
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: "'Inter Tight'",
              color: _cc.textMuted,
              background: _annBg,
              borderColor: 'transparent',
              padding: { left: 6, right: 6, top: 2, bottom: 2 }
            },
            position: 'right',
            offsetX: -10,
            offsetY: -1
          }
        }
      ];
    }

    // Annotation for current hour (only for today/single day)
    const currentHour = new Date().getHours();
    const currentHourLabel = currentHour + 'h';
    const hourIdx = hours.indexOf(currentHourLabel);
    if (hourIdx >= 0 && !isMultiDay) {
      if (!annotations.xaxis) annotations.xaxis = [];
      annotations.xaxis.push({
        x: currentHourLabel,
        borderColor: BRAND_PALETTE.coralDeep,
        strokeDashArray: 3,
        label: {
          text: 'agora',
          style: {
            fontSize: '9px',
            fontWeight: 700,
            background: BRAND_PALETTE.coralDeep,
            color: '#fff',
            padding: { left: 5, right: 5, top: 2, bottom: 2 }
          },
          orientation: 'horizontal',
          offsetY: -5
        }
      });
    }

    renderChart('hourly', '#chartHourly', {
      chart: { type: 'bar', height: 300, stacked: false },
      series,
      xaxis: { categories: hours, labels: { style: { fontSize: '11px', fontWeight: 500 } } },
      yaxis: { labels: { style: { fontSize: '11px', fontWeight: 500 } }, forceNiceScale: true },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
      colors: TRIPLE,
      fill: {
        type: ['gradient', 'gradient', 'solid'],
        gradient: {
          shade: 'dark',
          type: 'vertical',
          shadeIntensity: 0.5,
          opacityFrom: 1.0,
          opacityTo: 0.55,
          stops: [0, 100]
        },
        opacity: [1.0, 0.85, 0.2]
      },
      stroke: { width: [0, 0, 2], curve: 'smooth' },
      markers: { size: [0, 0, 3] },
      grid: { borderColor: chartColors().grid, strokeDashArray: 3, padding: { left: 14, right: 20, top: 10 } },
      legend: {
        position: 'top',
        fontSize: '11px',
        fontWeight: 600,
        labels: { colors: chartColors().textStrong },
        markers: { shape: 'circle', size: 5 },
        itemMargin: { horizontal: 12 }
      },
      annotations,
      dataLabels: { enabled: false },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (val, opts) => {
            if (val == null) return '';
            // Em single-day: mostra só o valor inteiro.
            // Em multi-day (Semana/Mês): mostra "média (total: N)" pras 2 primeiras séries (Média Atendimentos/Vendas).
            //   A 3ª série ("Hoje") é single-value — sem total.
            const base = Math.round(val * 10) / 10;
            if (!isMultiDay) return Math.round(val);
            const idx = opts?.dataPointIndex;
            const seriesIdx = opts?.seriesIndex;
            if (idx == null || seriesIdx == null || seriesIdx > 1) return base;
            const raw = seriesIdx === 0 ? atendRaw[idx] : vendasRaw[idx];
            return `${base} (total: ${raw})`;
          }
        }
      }
    });
  } catch (err) {
    console.error('loadHourly error:', err);
  }
}

// ─── Preferenciais por vendedor ───
export async function loadPreferenciais() {
  // Fidelizados data is now loaded in loadKPIs — this is a no-op placeholder
}

// ─── Ranking cards ───
export async function loadRanking(range, cachedData) {
  const sb = _ctx.sb;
  const tenantId = _ctx.tenantId;

  if (!cachedData) {
    const res = await sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
    if (res.error) {
      console.error('loadRanking RPC error:', res.error);
      return;
    }
    cachedData = res.data;
  }
  const data = cachedData;
  const body = document.getElementById('rankingBody');
  if (!data || data.length === 0) {
    body.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted)">Sem dados no período</div>';
    return;
  }

  // Buscar fotos dos vendedores
  let vendQuery = sb.from('vendedores').select('id, foto_url, apelido').eq('ativo', true);
  if (tenantId) vendQuery = vendQuery.eq('tenant_id', tenantId);
  const { data: vendedoresData } = await vendQuery;
  const fotoMap = {};
  (vendedoresData || []).forEach((v) => {
    fotoMap[v.id] = v.foto_url;
  });

  const metaConv = parseInt(lsGetMeta('meta_conversao', tenantId) || DEFAULT_METAS.conversao);

  const tempoMeta = parseInt(lsGetMeta('meta_tempo_medio', tenantId) || DEFAULT_METAS.tempo_medio);

  body.innerHTML = `<div class="rank-list">
    <div class="rank-list-header">
      <span class="rl-pos">#</span>
      <span class="rl-name">Vendedor</span>
      <span class="rl-bar">Conversão</span>
      <span class="rl-stat">Atend</span>
      <span class="rl-stat">Vendas</span>
      <span class="rl-stat">Tempo</span>
    </div>
    ${data
      .map((r, i) => {
        const cv = r.taxa_conversao || 0;
        const convColor =
          cv >= metaConv ? 'var(--accent)' : cv >= metaConv * 0.6 ? 'var(--accent-bright)' : 'var(--text-muted)';
        const barW = Math.min(cv, 100);
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        const isTop = i < 3;
        const foto = fotoMap[r.vendedor_id];
        const avatarContent = foto
          ? `<img src="${escapeHtml(foto)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : initials(r.nome);
        const tm = r.tempo_medio_min || 0;
        const tmColor = tempoColor(tm, tempoMeta);
        const delay = Math.min(i * 50, 300);
        return `<div class="rank-row${isTop ? ' rank-row--top' : ''}" style="animation:cardFadeIn .35s ease ${delay}ms both">
        <span class="rl-pos">${medal || i + 1}</span>
        <div class="rl-name">
          <div class="rl-avatar">${avatarContent}</div>
          <span>${escapeHtml(r.apelido || r.nome.split(' ')[0])}</span>
        </div>
        <div class="rl-bar">
          <div class="rl-bar-track"><div class="rl-bar-fill" style="width:${barW}%;background:${convColor}"></div></div>
          <span class="rl-bar-val" style="color:${convColor}">${cv}%</span>
        </div>
        <span class="rl-stat">${r.total_atendimentos || 0}</span>
        <span class="rl-stat">${r.total_vendas || 0}</span>
        <span class="rl-stat" style="color:${tmColor}">${tm}<span style="font-size:9px;opacity:.7">min</span></span>
      </div>`;
      })
      .join('')}
  </div>`;
}

// ─── Ruptures ───
export async function loadRuptures(range) {
  const sb = _ctx.sb;

  const { data, error } = await fetchRuptureLog(sb, range);
  if (error) {
    toast('Erro ao carregar rupturas: ' + error.message, 'error');
    return;
  }
  const el = document.getElementById('ruptureList');
  if (!data || data.length === 0) {
    el.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px"><i class="fa-solid fa-check-circle" style="font-size:20px;margin-bottom:8px;display:block;color:var(--success);opacity:.4"></i>Nenhuma ruptura registrada</div>';
    return;
  }
  el.innerHTML = data
    .map(
      (r) => `<div class="rupture-item">
    <div>
      <div style="font-weight:600;font-size:13px">${escapeHtml(r.produto)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${r.total} ${r.total === 1 ? 'registro' : 'registros'}</div>
    </div>
    <div class="rupture-count">${r.total}</div>
  </div>`
    )
    .join('');
}

// ─── Pause Log (semantic cards) ───
export async function loadPauseStats(range) {
  const sb = _ctx.sb;

  const { data, error } = await fetchPauseLog(sb, range);
  const el = document.getElementById('pauseStatsList');
  if (!el) return;
  if (error || !data || data.length === 0) {
    el.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px"><i class="fa-solid fa-check-circle" style="font-size:20px;margin-bottom:8px;display:block;color:var(--success);opacity:.4"></i>Nenhuma pausa registrada</div>';
    return;
  }
  const motivoLabels = {
    almoco: 'Almoço',
    banheiro: 'Banheiro',
    reuniao: 'Reunião',
    operacional: 'Operacional',
    outro: 'Outro'
  };
  const motivoIcons = {
    almoco: 'fa-utensils',
    banheiro: 'fa-restroom',
    reuniao: 'fa-people-group',
    operacional: 'fa-wrench',
    outro: 'fa-ellipsis'
  };
  const motivoColors = {
    almoco: BRAND_PALETTE.sand,
    banheiro: BRAND_PALETTE.dusty,
    reuniao: BRAND_PALETTE.neutral,
    operacional: BRAND_PALETTE.lavender,
    outro: BRAND_PALETTE.neutral
  };

  el.innerHTML = data
    .map((r) => {
      const hrSaida = new Date(r.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const emPausa = !r.fim;
      const hrRetorno = r.fim
        ? new Date(r.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '—';
      const dur = Math.round(r.duracao_min || 0);
      const motLabel = motivoLabels[r.motivo] || r.motivo || '—';
      const motIcon = motivoIcons[r.motivo] || 'fa-ellipsis';
      const motColor = motivoColors[r.motivo] || '#64748b';
      const durColor = emPausa ? 'var(--warning)' : dur > 60 ? 'var(--danger)' : 'var(--text-primary)';
      const activeClass = emPausa ? ' pause-log-entry--active' : '';
      const statusHtml = emPausa
        ? `<span class="pause-log-status pause-log-status--active"><i class="fa-solid fa-circle" style="font-size:5px;animation:dotPulse 2s ease-in-out infinite"></i>Em pausa</span>`
        : `<span class="pause-log-status pause-log-status--done"><i class="fa-solid fa-check" style="font-size:8px"></i>Concluído</span>`;

      return `<article class="pause-log-entry${activeClass}">
      <div class="pause-log-header">
        <span class="pause-log-name">${escapeHtml(r.vendedor_nome)}</span>
        ${statusHtml}
      </div>
      <div class="pause-log-motivo" style="background:${motColor}18;color:${motColor}">
        <i class="fa-solid ${motIcon}" style="font-size:10px"></i>${escapeHtml(motLabel)}
      </div>
      <div class="pause-log-meta">
        <div class="pause-log-field">
          <span class="pause-log-label">Saída</span>
          <span class="pause-log-time">${hrSaida}</span>
        </div>
        <div class="pause-log-field">
          <span class="pause-log-label">Retorno</span>
          <span class="pause-log-time" style="${emPausa ? 'color:var(--warning)' : ''}">${hrRetorno}</span>
        </div>
        <span class="pause-log-duration" style="color:${durColor}">${formatTempo(dur)}</span>
      </div>
    </article>`;
    })
    .join('');
}

// ─── Floor (who's on now) — LED marquee ───
export async function loadFloor() {
  const sb = _ctx.sb;
  const tenantId = _ctx.tenantId;

  const { data, error } = await fetchVendedores(sb, tenantId);
  if (error) {
    toast('Erro ao carregar equipe: ' + error.message, 'error');
    return;
  }
  if (!data || data.length === 0) {
    renderHeaderMarquee([]);
    return;
  }

  // Atualizar marquee do header
  renderHeaderMarquee(data);
}

function renderHeaderMarquee(vendedoresData) {
  const track = document.getElementById('marqueeTrack');
  if (!track) return;
  if (!vendedoresData || vendedoresData.length === 0) {
    track.innerHTML =
      '<span style="color:var(--text-muted);font-size:11px;padding:0 16px">Nenhum vendedor no turno</span>';
    track.style.animation = 'none';
    return;
  }
  const pills = vendedoresData
    .map((v) => {
      const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.fora;
      const pos = v.posicao_fila ? ` #${v.posicao_fila}` : '';
      const isFora = v.status === 'fora';
      const isOnTime = v.status === 'disponivel';
      return `<div class="marquee-pill">
      <div class="mp-dot${isOnTime ? ' pulse-on' : ''}" style="background:${cfg.color}"></div>
      <span class="mp-name">${escapeHtml(v.apelido || v.nome.split(' ')[0])}</span>
      <span class="mp-status${isFora ? ' fora' : ''}" style="color:${isFora ? '' : cfg.color}">${cfg.short}${pos}</span>
    </div>`;
    })
    .join('');
  // Se poucos vendedores, mostrar estático sem marquee
  if (vendedoresData.length <= 4) {
    track.innerHTML = pills;
    track.style.animation = 'none';
    track.style.transform = 'none';
    return;
  }
  // Triplicar para loop suave (garante que -50% sempre funcione)
  track.innerHTML = pills + pills + pills;
  const speed = Math.max(15, vendedoresData.length * 3);
  track.style.animationDuration = speed + 's';
  // Reiniciar animação
  track.style.animation = 'none';
  track.offsetHeight; // force reflow
  track.style.animation = `marqueeHeader ${speed}s linear infinite`;
}

// ─── Scatter: Volume × Conversão ───
export async function loadScatter(range, cachedData) {
  const sb = _ctx.sb;
  const metas = _ctx.metas;

  if (!cachedData) {
    const res = await sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
    if (res.error) {
      console.error('loadScatter RPC error:', res.error);
      return;
    }
    cachedData = res.data;
  }
  const data = cachedData;
  // Filtrar apenas vendedores com atendimentos
  const filtered = (data || []).filter((r) => (r.total_atendimentos || 0) > 0);
  const emptyScatter = document.getElementById('chartScatterEmpty');
  if (filtered.length === 0) {
    if (charts.scatter) {
      try {
        charts.scatter.destroy();
      } catch {
        /* no-op */
      }
    }
    charts.scatter = null;
    chartTypes.scatter = null;
    const el = document.querySelector('#chartScatter');
    if (el) el.style.display = 'none';
    if (emptyScatter) emptyScatter.style.display = 'block';
    return;
  }
  const elScatter = document.querySelector('#chartScatter');
  if (elScatter) elScatter.style.display = '';
  if (emptyScatter) emptyScatter.style.display = 'none';

  const metaConv = metas.conversao || 70;
  const maxAtend = Math.max(...filtered.map((r) => r.total_atendimentos || 0), 1);

  const series1 = [],
    series2 = [],
    series3 = [];
  const names1 = [],
    names2 = [],
    names3 = [];

  filtered.forEach((r) => {
    const x = r.total_atendimentos || 0;
    const y = r.taxa_conversao || 0;
    const name = (r.apelido || r.nome || '').split(' ')[0];
    const pt = [x, y];
    if (y >= metaConv) {
      series1.push(pt);
      names1.push(name);
    } else if (y >= metaConv * 0.6) {
      series2.push(pt);
      names2.push(name);
    } else {
      series3.push(pt);
      names3.push(name);
    }
  });

  const allNames = [names1, names2, names3];
  const allY = filtered.map((r) => r.taxa_conversao || 0);
  const minY = Math.max(0, Math.floor(Math.min(...allY) / 10) * 10 - 10);
  const maxX = Math.max(maxAtend, 5);
  const gridColor = isDarkTheme() ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)';
  const axisColor = isDarkTheme() ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)';

  renderChart('scatter', '#chartScatter', {
    chart: { type: 'scatter', height: 280, zoom: { enabled: false } },
    series: [
      { name: 'Acima da meta', data: series1 },
      { name: 'Perto da meta', data: series2 },
      { name: 'Abaixo da meta', data: series3 }
    ],
    colors: [BRAND_PALETTE.mint, BRAND_PALETTE.sand, BRAND_PALETTE.coral],
    markers: {
      size: 10,
      opacity: 0.85,
      strokeWidth: 2,
      strokeColors: [BRAND_PALETTE.mintDeep, BRAND_PALETTE.sandDeep, BRAND_PALETTE.coralDeep],
      hover: { sizeOffset: 4 }
    },
    xaxis: {
      type: 'numeric',
      min: 0,
      max: Math.ceil(maxX * 1.3) + 1,
      axisBorder: { show: true, color: gridColor },
      axisTicks: { show: true, color: gridColor },
      title: { text: 'Volume (Atendimentos)', style: { fontSize: '10px', fontWeight: 600, color: axisColor } },
      labels: { style: { fontSize: '10px', fontWeight: 500, colors: axisColor }, formatter: (v) => Math.round(v) },
      tickAmount: Math.min(6, maxX + 1)
    },
    yaxis: {
      min: Math.max(0, minY - 5),
      max: 105,
      forceNiceScale: false,
      axisBorder: { show: true, color: gridColor },
      axisTicks: { show: true, color: gridColor },
      title: { text: 'Conversão %', style: { fontSize: '10px', fontWeight: 600, color: axisColor } },
      labels: {
        formatter: (v) => Math.round(v) + '%',
        style: { fontSize: '10px', fontWeight: 500, colors: [axisColor] }
      },
      tickAmount: 5
    },
    grid: {
      show: true,
      borderColor: gridColor,
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      padding: { right: 20, top: 10, left: 10, bottom: 10 }
    },
    annotations: {
      yaxis: [
        {
          y: metaConv,
          borderColor: '#a78bfa',
          strokeDashArray: 5,
          opacity: 0.6,
          label: {
            text: 'Meta ' + metaConv + '%',
            style: {
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: "'Inter Tight'",
              background: 'rgba(167, 139, 250,.12)',
              color: '#a78bfa',
              padding: { left: 6, right: 6, top: 2, bottom: 2 }
            },
            position: 'right',
            offsetX: -10
          }
        }
      ]
    },
    dataLabels: {
      enabled: filtered.length <= 12,
      formatter: function (val, { seriesIndex, dataPointIndex }) {
        return allNames[seriesIndex]?.[dataPointIndex] || '';
      },
      textAnchor: 'start',
      offsetX: 6,
      style: { fontSize: '10px', fontWeight: 600, colors: [chartColors().textStrong] }
    },
    legend: {
      position: 'top',
      fontSize: '11px',
      fontWeight: 600,
      labels: { colors: chartColors().textStrong },
      markers: { shape: 'circle', size: 5 },
      offsetY: -5
    },
    tooltip: {
      shared: false,
      intersect: true,
      custom: function ({ seriesIndex, dataPointIndex, w }) {
        const d = w.config.series[seriesIndex].data[dataPointIndex];
        const name = allNames[seriesIndex]?.[dataPointIndex] || '';
        const color = w.config.colors[seriesIndex];
        const xVal = Array.isArray(d) ? d[0] : d.x || 0;
        const yVal = Array.isArray(d) ? d[1] : d.y || 0;
        return buildTooltip(
          name,
          [
            ['Atendimentos', xVal],
            ['Conversão', yVal + '%']
          ],
          color
        );
      }
    }
  });
}

// ─── Tempo Médio vs Meta ───
export async function loadTempoMeta(range, cachedData) {
  const sb = _ctx.sb;
  const metas = _ctx.metas;

  if (!cachedData) {
    const res = await sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
    if (res.error) {
      console.error('loadTempoMeta RPC error:', res.error);
      return;
    }
    cachedData = res.data;
  }
  const data = cachedData;
  const el = document.querySelector('#chartTempoMeta');
  // Filtrar apenas vendedores com atendimentos (tempo > 0)
  const filtered = (data || []).filter((r) => (r.tempo_medio_min || 0) > 0);
  const emptyTempo = document.getElementById('chartTempoEmpty');
  if (filtered.length === 0) {
    if (charts.tempoMeta) {
      try {
        charts.tempoMeta.destroy();
      } catch {
        /* no-op */
      }
    }
    charts.tempoMeta = null;
    chartTypes.tempoMeta = null;
    if (el) el.style.display = 'none';
    if (emptyTempo) emptyTempo.style.display = 'block';
    return;
  }
  if (el) el.style.display = '';
  if (emptyTempo) emptyTempo.style.display = 'none';

  const names = filtered.map((r) => (r.apelido || r.nome || '?').split(' ')[0]);
  const tempos = filtered.map((r) => r.tempo_medio_min || 0);
  const metaTempo = metas.tempo_medio || 30;
  // Cor semântica: verde = abaixo da meta (bom), amarelo = perto, vermelho = acima
  const barColors = tempos.map((t) => tempoColor(t, metaTempo));

  // Altura dinâmica: 38px por vendedor, mínimo 180px, máximo 400px
  const dynamicHeight = Math.max(180, Math.min(400, filtered.length * 38 + 50));
  // Ajustar o container
  const chartBox = el?.parentElement;
  if (chartBox) chartBox.style.height = dynamicHeight + 'px';

  renderChart('tempoMeta', '#chartTempoMeta', {
    chart: { type: 'bar', height: dynamicHeight },
    series: [{ name: 'Tempo Médio (min)', data: tempos }],
    plotOptions: {
      bar: { horizontal: true, borderRadius: 5, barHeight: '55%', distributed: true, dataLabels: { position: 'top' } }
    },
    colors: barColors,
    xaxis: { labels: { formatter: (v) => v + 'min', style: { fontSize: '11px', fontWeight: 500 } }, categories: names },
    yaxis: { labels: { style: { fontSize: '12px', fontWeight: 700, colors: [chartColors().textStrong] } } },
    grid: {
      borderColor: chartColors().grid,
      strokeDashArray: 3,
      padding: { right: 40 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } }
    },
    annotations: {
      xaxis: [
        {
          x: metaTempo,
          borderColor: chartColors().textMuted,
          strokeDashArray: 4,
          label: {
            text: 'Meta ' + metaTempo + 'min',
            style: { fontSize: '10px', fontWeight: 600, background: 'transparent', color: chartColors().textMuted },
            orientation: 'horizontal'
          }
        }
      ]
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => Math.round(v) + 'min',
      offsetX: 0,
      style: { fontSize: '11px', fontWeight: 700, colors: [chartColors().datalabel] }
    },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => Math.round(v) + ' min' } }
  });
}

// ─── Trend Line (evolução diária) ───
export async function loadTrend(range) {
  const sb = _ctx.sb;
  const tenantId = _ctx.tenantId;

  // Para trend, usar range mínimo de 7 dias para ter contexto visual
  let trendRange = range;
  if (
    _ctx.currentPeriod === PERIODS.HOJE ||
    _ctx.currentPeriod === PERIODS.ONTEM ||
    _ctx.currentPeriod === PERIODS.CUSTOM
  ) {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    trendRange = { start: start.toISOString(), end: end.toISOString() };
  }
  const { data, error } = await sb.rpc('get_daily_trend', { p_inicio: trendRange.start, p_fim: trendRange.end });
  if (error) {
    return;
  }
  const emptyTrend = document.getElementById('chartTrendEmpty');
  if (!data || data.length === 0) {
    if (charts.trend) {
      try {
        charts.trend.destroy();
      } catch {
        /* no-op */
      }
    }
    charts.trend = null;
    chartTypes.trend = null;
    const elTrend = document.querySelector('#chartTrend');
    if (elTrend) elTrend.style.display = 'none';
    if (emptyTrend) emptyTrend.style.display = 'block';
    return;
  }
  const elTrend = document.querySelector('#chartTrend');
  if (elTrend) elTrend.style.display = '';
  if (emptyTrend) emptyTrend.style.display = 'none';

  const todayStr = new Date().toISOString().split('T')[0];
  const todayIdx = data.findIndex((d) => d.dia === todayStr);
  const xLabels = data.map((d, i) => {
    const dt = new Date(d.dia + 'T12:00:00');
    const label = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return i === todayIdx ? label + ' \u2605' : label;
  });
  const atend = data.map((d) => d.total_atendimentos);
  const vendas = data.map((d) => d.total_vendas);
  const conv = data.map((d) => d.taxa_conversao || 0);

  // Meta line for conversion
  const metaConv = parseInt(lsGetMeta('meta_conversao', tenantId) || DEFAULT_METAS.conversao);

  const annotations = {};
  if (metaConv > 0) {
    annotations.yaxis = [
      {
        y: metaConv,
        yAxisIndex: 1,
        borderColor: 'rgba(167, 139, 250,.25)',
        strokeDashArray: 4,
        opacity: 0.5,
        label: {
          text: 'Meta ' + metaConv + '%',
          style: {
            fontSize: '9px',
            fontWeight: 600,
            background: 'rgba(167, 139, 250,.08)',
            color: '#a78bfa',
            padding: { left: 4, right: 4, top: 2, bottom: 2 }
          },
          position: 'right',
          offsetX: -8
        }
      }
    ];
  }

  // Dynamic min-width so horizontal scroll appears when many days
  const trendBox = document.querySelector('#chartTrend')?.parentElement;
  if (trendBox && xLabels.length > 10) {
    trendBox.style.minWidth = Math.max(700, xLabels.length * 55) + 'px';
  }

  // Se só tem 1 dia, usar barras agrupadas. Se mais, usar barras + linha
  const isSingleDay = xLabels.length <= 2;

  renderChart('trend', '#chartTrend', {
    chart: { type: 'line', height: 300, stacked: false },
    series: [
      { name: 'Atendimentos', type: 'bar', data: atend },
      { name: 'Vendas', type: 'bar', data: vendas },
      { name: 'Conversão', type: 'area', data: conv }
    ],
    xaxis: { categories: xLabels, labels: { style: { fontSize: '11px', fontWeight: 600 } } },
    yaxis: [
      {
        seriesName: 'Atendimentos',
        labels: { style: { fontSize: '10px', fontWeight: 500 } },
        forceNiceScale: true,
        min: 0
      },
      { seriesName: 'Vendas', show: false, min: 0 },
      {
        seriesName: 'Conversão',
        opposite: true,
        labels: { formatter: (v) => Math.round(v) + '%', style: { fontSize: '10px', fontWeight: 500 } },
        min: 0,
        max: 100,
        forceNiceScale: false
      }
    ],
    plotOptions: { bar: { borderRadius: 4, columnWidth: isSingleDay ? '50%' : '65%' } },
    stroke: { width: [0, 0, 2.5], curve: ['straight', 'straight', 'smooth'] },
    fill: {
      type: ['solid', 'solid', 'gradient'],
      opacity: [0.85, 0.5, 1],
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.3,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 95]
      }
    },
    colors: [BRAND_PALETTE.mint, BRAND_PALETTE.dusty, BRAND_PALETTE.sand],
    markers: { size: [0, 0, 4], strokeWidth: 2, strokeColors: '#fff', hover: { sizeOffset: 2 } },
    grid: { borderColor: chartColors().grid, strokeDashArray: 3, padding: { left: 10, right: 10, bottom: 5 } },
    legend: {
      position: 'top',
      horizontalAlign: 'center',
      fontSize: '11px',
      fontWeight: 600,
      labels: { colors: chartColors().textStrong },
      markers: { shape: 'circle', size: 5 },
      itemMargin: { horizontal: 24, vertical: 0 }
    },
    annotations,
    dataLabels: {
      enabled: isSingleDay,
      formatter: (val, { seriesIndex }) => (seriesIndex === 2 ? val + '%' : Math.round(val)),
      style: { fontSize: '11px', fontWeight: 700 },
      offsetY: -4
    },
    tooltip: {
      shared: true,
      intersect: false,
      y: { formatter: (val, { seriesIndex }) => (seriesIndex === 2 ? Math.round(val) + '%' : Math.round(val)) }
    }
  });

  // ─── KPI Sparklines ───
  const sparkDates = data.map((d) => {
    const dt = new Date(d.dia + 'T12:00:00');
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  });
  const sparkOpts = (series, color, labels, suffix) => ({
    chart: { type: 'area', height: 48, sparkline: { enabled: true }, animations: { enabled: true, speed: 400 } },
    series: [{ data: series }],
    stroke: { width: 2, curve: 'smooth' },
    colors: [color],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } },
    tooltip: {
      enabled: true,
      fixed: { enabled: false },
      x: { show: false },
      y: {
        title: { formatter: () => '' },
        formatter: (val, { dataPointIndex }) => labels[dataPointIndex] + ': ' + Math.round(val) + suffix
      },
      marker: { show: false },
      style: { fontSize: '11px' },
      cssClass: 'spark-tooltip'
    }
  });
  if (conv.length > 1) renderChart('sparkConv', '#sparkConv', sparkOpts(conv, '#a78bfa', sparkDates, '%'));
  if (atend.length > 1) renderChart('sparkTempo', '#sparkTempo', sparkOpts(atend, '#8ea5c9', sparkDates, ''));
}

// ─── Origem dos Clientes (ApexCharts donut) ───
export async function loadOrigem(range) {
  const sb = _ctx.sb;

  const container = document.getElementById('chartOrigem');
  const emptyMsg = document.getElementById('chartOrigemEmpty');
  if (!container) return;

  const { data, error } = await fetchCanalStats(sb, range);
  if (error) {
    console.warn('Erro canais:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    container.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  container.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';

  const labels = data.map((d) => d.canal_nome || 'Não informado');
  const values = data.map((d) => Number(d.total));
  const colors = data.map((_, i) => ORIGEM_PALETTE[i % ORIGEM_PALETTE.length]);
  const total = values.reduce((a, b) => a + b, 0);

  renderChart(
    'origem',
    '#chartOrigem',
    donutConfig({
      labels,
      values,
      colors,
      total,
      centerLabel: 'TOTAL',
      tooltipFn: function ({ series, seriesIndex, dataPointIndex }) {
        const val = series[seriesIndex];
        const pct = Math.round((val / total) * 100);
        return buildTooltip(
          labels[dataPointIndex],
          [
            ['Clientes', val],
            ['Percentual', pct + '%']
          ],
          colors[dataPointIndex]
        );
      }
    })
  );
}

// ─── Chart section tabs ───
export function setChartTab(section) {
  // Second click on active tab → collapse all
  if (_activeChartTab === section) {
    document.querySelectorAll('.chart-section').forEach((s) => (s.style.display = 'none'));
    document.querySelectorAll('.chart-tab').forEach((b) => b.classList.remove('active'));
    _activeChartTab = null;
    localStorage.removeItem(CHART_TAB_KEY);
    return;
  }
  document.querySelectorAll('.chart-section').forEach((s) => (s.style.display = 'none'));
  document.querySelectorAll('.chart-tab').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
  const el = document.getElementById('section-' + section);
  if (el) el.style.display = 'block';
  _activeChartTab = section;
  localStorage.setItem(CHART_TAB_KEY, section);
  // ApexCharts renders 0px when container is display:none — force resize after reveal
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, CHART_RESIZE_DELAY);
}

// ─── _firstLoad management ───
export function setFirstLoadDone() {
  _firstLoad = false;
}

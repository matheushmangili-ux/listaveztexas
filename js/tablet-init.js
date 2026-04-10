// ============================================
// MinhaVez — Tablet Init
// Bootstrap + turno/fila/atendimento wiring for tablet.html
// ============================================

import { getSupabase } from '/js/supabase-config.js';
import { requireRole, logout, getTenantId } from '/js/auth.js';
import { SAIDA_COLORS, toast, initTheme, toggleTheme } from '/js/utils.js';
import { loadTenant, applyBranding, tenantPath } from '/js/tenant.js';
import { showChangelog, setVersionLabel } from '/js/changelog.js';
import { playSound } from '/js/sound.js';
import { createModal } from '/js/ui.js';
import { initTurno, checkExistingTurno } from '/js/tablet-turno.js';
import { initFooter, renderFooter, invalidateFooter, clearFooterTimer } from '/js/tablet-footer.js';
import {
  initQueue,
  renderQueue,
  scheduleRender,
  invalidateQueue,
  getDraggedId,
  setDraggedId,
  isTouchDragging,
  cleanupQueue,
  resetDragState
} from '/js/tablet-queue.js';
import {
  initAtendimento,
  renderActiveAtendimentos,
  checkActiveAtendimentos,
  doSendToAtendimento,
  loadCanaisOrigem,
  clearAtendTimers,
  resetAtendDragState
} from '/js/tablet-atendimento.js';
import {
  SESSION_TIMEOUT_TABLET,
  SESSION_CHECK_INTERVAL,
  AUTO_SYNC_INTERVAL,
  QUICK_STATS_INTERVAL,
  ACTION_LOCK_SAFETY,
  LOCAL_ACTION_DEBOUNCE,
  RT_VENDEDOR_DEBOUNCE,
  RT_RECONNECT_DELAY,
  TOAST_SHORT,
  TOAST_MEDIUM,
  INPUT_FOCUS_DELAY
} from '/js/constants.js';
initTheme();
// Sync theme-color meta with saved theme
{
  const _t = document.documentElement.getAttribute('data-theme') || 'light';
  const _m = document.querySelector('meta[name="theme-color"]');
  if (_m) _m.content = _t === 'dark' ? '#060606' : '#F5F5F7';
}

// Load tenant context
const tenant = await loadTenant();
if (tenant) applyBranding(tenant);
const tenantId = tenant?.id || null;

// Render setor tabs dynamically from tenant config
const SETOR_ICONS = { loja: 'fa-store', chapelaria: 'fa-hat-cowboy', selaria: 'fa-horse' };
const SETOR_LABELS = { loja: 'Loja', chapelaria: 'Chapelaria', selaria: 'Selaria' };
const tenantSetores = tenant?.setores || ['loja'];
const setorTabsEl = document.getElementById('setorTabs');
if (setorTabsEl) {
  setorTabsEl.innerHTML = tenantSetores
    .map(
      (s, i) =>
        `<button class="setor-tab${i === 0 ? ' active' : ''}" data-setor="${s}" onclick="setSetor('${s}')"><i class="fa-solid ${SETOR_ICONS[s] || 'fa-store'}"></i><span class="tab-label">${SETOR_LABELS[s] || s}</span></button>`
    )
    .join('');
  if (tenantSetores.length <= 1) setorTabsEl.style.display = 'none';
}

const sb = getSupabase();
let user;
try {
  user = await requireRole(['recepcionista', 'gerente', 'admin', 'owner']);
} catch {
  /* auth error */
}
if (!user) {
  window.handleLogout = () => {
    window.location.href = tenantPath('/login');
  };
  window._toggleTheme = () => {
    toggleTheme();
  };
}

// Guard: JWT tenant must match URL tenant — force re-login if mismatched
const jwtTenantId = user ? getTenantId(user) : null;
if (tenant && jwtTenantId && jwtTenantId !== tenant.id) {
  await sb.auth.signOut();
  window.location.href = tenantPath('/login');
}

// ─── Grouped state objects ───
const state = {
  turno: null, // turno aberto atual
  atendimentos: [], // atendimentos ativos
  vendedores: [], // lista de vendedores
  setor: 'loja', // setor ativo
  saidaMotivos: {}, // vendedorId → motivo key
  pendingSaidaId: null, // vendedorId aguardando confirmação de saída
  vendorAtendCount: {}, // vendedor_id → count de atendimentos no turno
  queueEntryTimes: new Map(), // vendedorId → { pos, time } para cold seller
  pauseStartTimes: new Map(), // vendedorId → Date inicio da pausa
  savedPositions: new Map(), // vendedorId → posicao_fila antes da pausa (para restaurar ao voltar)
  positionLog: [] // { time, icon, vendedor, action, details } — max 200
};

const ui = {
  tvMode: localStorage.getItem('minhavez_tvMode') === '1' || new URLSearchParams(location.search).has('tv'),
  actionLock: false, // previne double-tap em ações críticas
  localAction: false, // ignora realtime quando ação é local
  renderPending: false, // debounce render
  loadingVendedores: false, // previne concurrent loads
  miniRankingOpen: false,
  miniRankingOutside: null, // click-outside handler ref
  miniRankingOutsideTimer: null, // pending setTimeout id for delayed listener attach
  prevStats: { total: 0, vendas: 0, conv: 0 },
  statsThrottle: 0
};

const timers = {
  session: null,
  rtVend: null,
  rtAtend: null,
  reconnect: null,
  localAction: null
};

// Cached DOM refs (evita querySelector repetido)
const dom = {
  queuePanel: document.querySelector('.queue-panel'),
  servicePanel: document.querySelector('.service-panel'),
  queueList: document.getElementById('queueList'),
  statusFooter: document.getElementById('statusFooter')
};

// Lock para ações críticas (previne double-tap)
async function withLock(fn) {
  if (ui.actionLock) return;
  ui.actionLock = true;
  const safety = setTimeout(() => {
    ui.actionLock = false;
  }, ACTION_LOCK_SAFETY);
  try {
    await fn();
  } finally {
    clearTimeout(safety);
    ui.actionLock = false;
  }
}

// Marcar que uma ação local está em andamento (evita re-render do realtime)
function markLocal() {
  ui.localAction = true;
  clearTimeout(timers.localAction);
  timers.localAction = setTimeout(() => {
    ui.localAction = false;
  }, LOCAL_ACTION_DEBOUNCE);
}

window.setSetor = function (setor) {
  state.setor = setor;
  document.querySelectorAll('.setor-tab').forEach((t) => t.classList.toggle('active', t.dataset.setor === setor));
  invalidateQueue();
  invalidateFooter();
  renderQueue();
  renderFooter();
};

// ─── Position log (in-memory session history) ───
function logPosition(vendedor, action, details) {
  const nome = vendedor ? vendedor.apelido || vendedor.nome : '?';
  const icons = {
    fila: 'fa-list-ol',
    atendimento: 'fa-headset',
    pausa: 'fa-pause',
    retorno: 'fa-arrow-rotate-left',
    saida: 'fa-door-open',
    cancelar: 'fa-xmark',
    finalizar: 'fa-check',
    turno: 'fa-clock'
  };
  state.positionLog.unshift({
    time: new Date(),
    icon: icons[action] || 'fa-circle',
    vendedor: nome,
    action,
    details: details || ''
  });
  if (state.positionLog.length > 200) state.positionLog.length = 200;
}

// Sound effects imported from /js/sound.js

// Celebrations imported from /js/tablet-celebrations.js

// ─── Turno module init ───
initTurno({
  sb,
  get currentTurno() {
    return state.turno;
  },
  set currentTurno(v) {
    state.turno = v;
  },
  get activeAtendimentos() {
    return state.atendimentos;
  },
  set activeAtendimentos(v) {
    state.atendimentos = v;
  },
  get vendedores() {
    return state.vendedores;
  },
  get currentSetor() {
    return state.setor;
  },
  get tenantId() {
    return tenantId;
  },
  pauseStartTimes: state.pauseStartTimes,
  queueEntryTimes: state.queueEntryTimes,
  markLocal,
  logPosition,
  clearPositionLog: () => {
    state.positionLog = [];
  },
  renderActiveAtendimentos,
  loadVendedores
});

// ─── Footer module init ───
initFooter({
  statusFooter: dom.statusFooter,
  get currentTurno() {
    return state.turno;
  },
  get vendedores() {
    return state.vendedores;
  },
  get currentSetor() {
    return state.setor;
  },
  get activeAtendimentos() {
    return state.atendimentos;
  },
  get tvMode() {
    return ui.tvMode;
  },
  get draggedId() {
    return getDraggedId();
  },
  set draggedId(v) {
    setDraggedId(v);
  },
  get touchDragging() {
    return isTouchDragging();
  },
  get saidaMotivos() {
    return state.saidaMotivos;
  },
  pauseStartTimes: state.pauseStartTimes,
  openSaida,
  get onTouchDragStart() {
    return window.onTouchDragStart;
  },
  addToQueue
});

// ─── Queue module init ───
initQueue({
  sb,
  get currentTurno() {
    return state.turno;
  },
  get vendedores() {
    return state.vendedores;
  },
  get currentSetor() {
    return state.setor;
  },
  get activeAtendimentos() {
    return state.atendimentos;
  },
  get tvMode() {
    return ui.tvMode;
  },
  get renderPending() {
    return ui.renderPending;
  },
  set renderPending(v) {
    ui.renderPending = v;
  },
  queueList: dom.queueList,
  queuePanel: dom.queuePanel,
  servicePanel: dom.servicePanel,
  statusFooter: dom.statusFooter,
  get saidaMotivos() {
    return state.saidaMotivos;
  },
  queueEntryTimes: state.queueEntryTimes,
  get vendorAtendCount() {
    return state.vendorAtendCount;
  },
  markLocal,
  loadVendedores,
  openSaida,
  returnFromPause: (...args) => window.returnFromPause(...args),
  withLock,
  doSendToAtendimento: (...args) => doSendToAtendimento(...args),
  updateQuickStats
});

// ─── Atendimento module init ───
initAtendimento({
  sb,
  get currentTurno() {
    return state.turno;
  },
  get activeAtendimentos() {
    return state.atendimentos;
  },
  set activeAtendimentos(v) {
    state.atendimentos = v;
  },
  get vendedores() {
    return state.vendedores;
  },
  get tenantId() {
    return tenantId;
  },
  get currentSetor() {
    return state.setor;
  },
  get tvMode() {
    return ui.tvMode;
  },
  get actionLock() {
    return ui.actionLock;
  },
  set actionLock(v) {
    ui.actionLock = v;
  },
  queueList: dom.queueList,
  queuePanel: dom.queuePanel,
  servicePanel: dom.servicePanel,
  markLocal,
  logPosition,
  loadVendedores,
  addToQueue,
  withLock
});

// ─── Load vendedores ───
async function loadVendedores() {
  if (ui.loadingVendedores) return;
  ui.loadingVendedores = true;
  try {
    const vq = sb.from('vendedores').select('*').eq('ativo', true);
    if (tenantId) vq.eq('tenant_id', tenantId);
    const { data, error } = await vq.order('posicao_fila', { ascending: true, nullsFirst: false });
    if (error) {
      const backup = localStorage.getItem('minhavez_vendedores');
      if (backup) {
        state.vendedores = JSON.parse(backup);
        toast('Offline — usando dados locais', 'warning');
      } else {
        toast('Erro ao carregar vendedores', 'error');
      }
      scheduleRender();
      return;
    }
    state.vendedores = data || [];
    try {
      localStorage.setItem('minhavez_vendedores', JSON.stringify(state.vendedores));
    } catch (e) {
      console.warn('[localStorage] quota/disabled:', e?.message || e);
    }
    // Carregar motivos de pausa do banco apenas para vendedores sem motivo local
    const pausadosSemMotivo = state.vendedores.filter((v) => v.status === 'pausa' && !state.saidaMotivos[v.id]);
    if (pausadosSemMotivo.length > 0) {
      const { data: pausas } = await sb
        .from('pausas')
        .select('vendedor_id, motivo, inicio')
        .is('fim', null)
        .in(
          'vendedor_id',
          pausadosSemMotivo.map((v) => v.id)
        );
      if (pausas) {
        pausas.forEach((p) => {
          state.saidaMotivos[p.vendedor_id] = p.motivo;
          if (p.inicio) state.pauseStartTimes.set(p.vendedor_id, new Date(p.inicio));
        });
      }
    }
    // Limpar motivos e timers de vendedores que não estão mais em pausa
    Object.keys(state.saidaMotivos).forEach((id) => {
      const v = state.vendedores.find((x) => x.id === id);
      if (!v || (v.status !== 'pausa' && v.status !== 'fora')) {
        delete state.saidaMotivos[id];
        state.pauseStartTimes.delete(id);
      }
    });
    for (const [id] of state.pauseStartTimes) {
      const v = state.vendedores.find((x) => x.id === id);
      if (!v || v.status !== 'pausa') state.pauseStartTimes.delete(id);
    }
    scheduleRender();
  } finally {
    ui.loadingVendedores = false;
  }
}

// scheduleRender imported from /js/tablet-queue.js

// Queue rendering, drag-and-drop imported from /js/tablet-queue.js

// Atendimento functions imported from /js/tablet-atendimento.js

async function addToQueue(vendedorId) {
  const v = state.vendedores.find((x) => x.id === vendedorId);
  const setor = v?.setor || 'loja';
  const setorQueue = state.vendedores.filter((x) => (x.setor || 'loja') === setor && x.posicao_fila != null);
  const maxPos = Math.max(0, ...setorQueue.map((x) => x.posicao_fila));
  const newPos = maxPos + 1;
  markLocal();
  if (v) {
    v.status = 'disponivel';
    v.posicao_fila = newPos;
  }
  invalidateQueue();
  invalidateFooter();
  scheduleRender();
  logPosition(v, 'fila', 'Posição #' + newPos);
  toast((v?.apelido || v?.nome || 'Vendedor') + ' entrou na fila', 'success', TOAST_SHORT);
  const { error } = await sb
    .from('vendedores')
    .update({ status: 'disponivel', posicao_fila: newPos })
    .eq('id', vendedorId)
    .eq('tenant_id', tenantId);
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    await loadVendedores();
  }
}

// ─── Restaurar posição original ao voltar da pausa ───
async function returnToSavedPosition(vendedorId) {
  const v = state.vendedores.find((x) => x.id === vendedorId);
  if (!v) return;
  const setor = v.setor || 'loja';
  const savedPos = state.savedPositions.get(vendedorId);
  state.savedPositions.delete(vendedorId);

  // Vendedores atualmente na fila, ordenados por posição
  const inQueue = state.vendedores
    .filter((x) => x.id !== vendedorId && (x.setor || 'loja') === setor && x.posicao_fila != null)
    .sort((a, b) => a.posicao_fila - b.posicao_fila);

  // Quantos ainda estão à frente da posição original?
  const insertIdx = savedPos != null ? inQueue.filter((x) => x.posicao_fila < savedPos).length : inQueue.length; // sem posição salva → vai para o final

  // Reconstruir fila com o vendedor reinserido na posição correta
  const newOrder = [...inQueue.slice(0, insertIdx), v, ...inQueue.slice(insertIdx)];

  // Re-normalizar posições 1, 2, 3, ...
  const toUpdate = [];
  newOrder.forEach((vendor, i) => {
    const newPos = i + 1;
    if (vendor.posicao_fila !== newPos) {
      vendor.posicao_fila = newPos;
      if (vendor.id !== vendedorId) toUpdate.push({ id: vendor.id, posicao_fila: newPos });
    }
  });
  v.status = 'disponivel';
  v.posicao_fila = insertIdx + 1;

  markLocal();
  invalidateQueue();
  invalidateFooter();
  scheduleRender();

  // Salvar no banco — vendedor retornando primeiro
  const { error } = await sb
    .from('vendedores')
    .update({ status: 'disponivel', posicao_fila: v.posicao_fila })
    .eq('id', vendedorId)
    .eq('tenant_id', tenantId);
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    await loadVendedores();
    return;
  }

  // Atualizar posições dos vendedores deslocados
  for (const u of toUpdate) {
    await sb.from('vendedores').update({ posicao_fila: u.posicao_fila }).eq('id', u.id).eq('tenant_id', tenantId);
  }
}

// ─── Retornar da pausa ───
window.returnFromPause = async function (vendedorId) {
  delete state.saidaMotivos[vendedorId];
  state.pauseStartTimes.delete(vendedorId);
  invalidateQueue();
  invalidateFooter();
  sb.rpc('registrar_retorno', { p_vendedor_id: vendedorId }).catch((err) =>
    console.warn('[registrar_retorno] falhou:', err?.message || err)
  );
  await returnToSavedPosition(vendedorId);
  const v = state.vendedores.find((x) => x.id === vendedorId);
  playSound('retorno');
  logPosition(v, 'retorno', 'Voltou à posição #' + (v?.posicao_fila ?? '?'));
  toast((v?.apelido || v?.nome || 'Vendedor') + ' voltou à fila', 'success', TOAST_SHORT);
};

// ─── Remover da fila (com motivo) ───

function openSaida(vendedorId) {
  state.pendingSaidaId = vendedorId;
  const v = state.vendedores.find((x) => x.id === vendedorId);
  const nome = v ? v.apelido || v.nome : 'Vendedor';
  document.getElementById('saidaNome').textContent = nome + ' — selecione o motivo';
  document.getElementById('saidaOverlay').classList.add('open');
  document.getElementById('saidaSheet').classList.add('open');
}

window.closeSaida = function () {
  document.getElementById('saidaOverlay').classList.remove('open');
  document.getElementById('saidaSheet').classList.remove('open');
  state.pendingSaidaId = null;
  invalidateQueue();
  invalidateFooter();
  scheduleRender();
};

window.confirmSaida = async function (motivo) {
  if (!state.pendingSaidaId) return;
  const newStatus = motivo === 'banheiro' || motivo === 'reuniao' || motivo === 'operacional' ? 'pausa' : 'fora';
  state.saidaMotivos[state.pendingSaidaId] = motivo;
  state.pauseStartTimes.set(state.pendingSaidaId, new Date());
  // Salvar posição na fila antes de zerá-la — usada para restaurar ao retornar
  if (newStatus === 'pausa') {
    const svTemp = state.vendedores.find((x) => x.id === state.pendingSaidaId);
    if (svTemp?.posicao_fila != null) state.savedPositions.set(state.pendingSaidaId, svTemp.posicao_fila);
  }
  markLocal();
  const savedId = state.pendingSaidaId;
  const { error } = await sb
    .from('vendedores')
    .update({ status: newStatus, posicao_fila: null })
    .eq('id', savedId)
    .eq('tenant_id', tenantId);
  if (error) {
    toast('Erro ao registrar saída', 'error');
    window.closeSaida();
    return;
  }
  if (state.turno) {
    // Fechar qualquer pausa anterior aberta antes de criar a nova
    await sb.rpc('registrar_retorno', { p_vendedor_id: savedId });
    const { error: pausaErr } = await sb.rpc('registrar_pausa', {
      p_vendedor_id: savedId,
      p_turno_id: state.turno.id,
      p_motivo: motivo
    });
    if (pausaErr) console.error('[pausas] registrar_pausa:', pausaErr.message);
  }
  const sv = state.vendedores.find((x) => x.id === savedId);
  logPosition(sv, 'saida', SAIDA_COLORS[motivo]?.label || 'Saída');
  toast(SAIDA_COLORS[motivo]?.label || 'Saiu da fila', 'info', TOAST_MEDIUM);
  window.closeSaida();
  const savedMotivo = motivo;
  await loadVendedores();
  state.saidaMotivos[savedId] = savedMotivo;
  scheduleRender();
};

// ─── Finalizar Todos ───
window.finalizarTodos = async function () {
  const ativos = state.vendedores.filter((v) => v.status !== 'fora' && v.status !== 'em_atendimento');
  if (ativos.length === 0) {
    toast('Nenhum vendedor na fila', 'warning');
    return;
  }
  if (!confirm('Remover todos os ' + ativos.length + ' vendedores da fila?')) return;
  const ids = ativos.map((v) => v.id);
  markLocal();
  const { error } = await sb
    .from('vendedores')
    .update({ status: 'fora', posicao_fila: null })
    .in('id', ids)
    .eq('tenant_id', tenantId);
  if (error) {
    toast('Erro ao remover vendedores', 'error');
    return;
  }
  // Fechar todas as pausas abertas dos vendedores removidos
  await Promise.all(ids.map((id) => sb.rpc('registrar_retorno', { p_vendedor_id: id })));
  ids.forEach((id) => delete state.saidaMotivos[id]);
  toast('Todos removidos da fila', 'info');
  await loadVendedores();
};

// Footer imported from /js/tablet-footer.js

// Ghost cleanup imported from /js/tablet-atendimento.js

// ─── Animated counter ───
function animateValue(el, start, end, duration = 400, suffix = '') {
  if (!el || start === end) {
    if (el) el.textContent = end + suffix;
    return;
  }
  const range = end - start;
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + range * eased);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Quick stats ───
async function updateQuickStats() {
  const now = Date.now();
  if (now - ui.statsThrottle < 2000) return;
  ui.statsThrottle = now;
  if (!state.turno) return;
  const [totalRes, vendasRes, perVendor] = await Promise.all([
    sb
      .from('atendimentos')
      .select('id', { count: 'exact', head: true })
      .eq('turno_id', state.turno.id)
      .neq('resultado', 'em_andamento'),
    sb
      .from('atendimentos')
      .select('id', { count: 'exact', head: true })
      .eq('turno_id', state.turno.id)
      .eq('resultado', 'venda'),
    sb.from('atendimentos').select('vendedor_id').eq('turno_id', state.turno.id).neq('resultado', 'em_andamento')
  ]);
  const total = totalRes.count || 0;
  const vendas = vendasRes.count || 0;
  const conv = total > 0 ? Math.round((vendas / total) * 100) : 0;
  animateValue(document.getElementById('statAtend'), ui.prevStats.total, total);
  animateValue(document.getElementById('statVendas'), ui.prevStats.vendas, vendas);
  animateValue(document.getElementById('statConv'), ui.prevStats.conv, conv, 400, '%');
  const bar = document.getElementById('convBar');
  if (bar) {
    bar.style.width = conv + '%';
    bar.style.background = conv >= 50 ? 'var(--success)' : conv >= 30 ? 'var(--warning)' : 'var(--accent)';
  }
  ui.prevStats = { total, vendas, conv };
  const newCounts = {};
  if (perVendor.data) {
    perVendor.data.forEach((r) => {
      newCounts[r.vendedor_id] = (newCounts[r.vendedor_id] || 0) + 1;
    });
  }
  const changed = JSON.stringify(newCounts) !== JSON.stringify(state.vendorAtendCount);
  state.vendorAtendCount = newCounts;
  if (changed) {
    invalidateQueue();
    invalidateFooter();
    scheduleRender();
  }
}

// Turno functions imported from /js/tablet-turno.js

// Próximo cliente, renderActiveAtendimentos, outcome sheet,
// multi-client, troca, venda, motivos imported from /js/tablet-atendimento.js

// ─── Position Log (histórico da sessão) ───
window.openPosLog = function () {
  const list = document.getElementById('posLogList');
  if (state.positionLog.length === 0) {
    list.innerHTML =
      '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">Nenhuma movimentação registrada nesta sessão</div>';
  } else {
    list.innerHTML = state.positionLog
      .map((entry) => {
        const h = String(entry.time.getHours()).padStart(2, '0');
        const m = String(entry.time.getMinutes()).padStart(2, '0');
        const s = String(entry.time.getSeconds()).padStart(2, '0');
        const actionLabels = {
          fila: 'Entrou na fila',
          atendimento: 'Atendimento',
          pausa: 'Pausa',
          retorno: 'Retornou',
          saida: 'Saiu',
          cancelar: 'Cancelado',
          finalizar: 'Finalizado',
          turno: 'Turno'
        };
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border-subtle)">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);flex-shrink:0;width:52px">${h}:${m}:${s}</span>
        <i class="fa-solid ${entry.icon}" style="font-size:11px;color:var(--text-muted);width:16px;text-align:center;flex-shrink:0"></i>
        <span style="font-weight:600;font-size:13px;flex-shrink:0;max-width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${entry.vendedor}</span>
        <span style="font-size:11px;color:var(--text-muted);flex-shrink:0">${actionLabels[entry.action] || entry.action}</span>
        <span style="font-size:11px;color:var(--text-secondary);margin-left:auto;flex-shrink:0;text-align:right">${entry.details}</span>
      </div>`;
      })
      .join('');
  }
  document.getElementById('posLogOverlay').classList.add('open');
  document.getElementById('posLogSheet').classList.add('open');
};
window.closePosLog = function () {
  document.getElementById('posLogOverlay').classList.remove('open');
  document.getElementById('posLogSheet').classList.remove('open');
};

// ─── Mini Ranking (troféu) ───
window.toggleMiniRanking = async function () {
  const dd = document.getElementById('miniRankingDropdown');
  if (!dd) return;
  if (ui.miniRankingOpen) {
    closeMiniRanking();
    return;
  }
  if (!state.turno) {
    toast('Abra o turno para ver o ranking', 'warning');
    return;
  }
  ui.miniRankingOpen = true;
  dd.style.display = '';
  // Query atendimentos do turno
  const { data } = await sb
    .from('atendimentos')
    .select('vendedor_id, resultado, vendedores(nome, apelido)')
    .eq('turno_id', state.turno.id)
    .neq('resultado', 'em_andamento');
  if (!data || data.length === 0) {
    document.getElementById('miniRankingList').innerHTML =
      '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px">Nenhum atendimento finalizado</div>';
  } else {
    // Agrupar por vendedor
    const map = new Map();
    data.forEach((a) => {
      const vid = a.vendedor_id;
      if (!map.has(vid))
        map.set(vid, { nome: a.vendedores?.apelido || a.vendedores?.nome || '?', total: 0, vendas: 0 });
      const e = map.get(vid);
      e.total++;
      if (a.resultado === 'venda') e.vendas++;
    });
    const sorted = [...map.values()].sort((a, b) => b.vendas - a.vendas || b.total - a.total).slice(0, 5);
    const medals = ['🥇', '🥈', '🥉', '4º', '5º'];
    document.getElementById('miniRankingList').innerHTML = sorted
      .map((s, i) => {
        const conv = s.total > 0 ? Math.round((s.vendas / s.total) * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;${i === 0 ? 'background:rgba(251,191,36,.08);border-radius:8px' : ''}">
        <span style="font-size:14px;width:24px;text-align:center;flex-shrink:0">${medals[i]}</span>
        <span style="flex:1;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.nome}</span>
        <span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--success)">${s.vendas}v</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${s.total}at</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${conv}%</span>
      </div>`;
      })
      .join('');
  }
  // Fechar ao clicar fora (delay evita capturar o próprio click que abriu)
  ui.miniRankingOutsideTimer = setTimeout(() => {
    ui.miniRankingOutsideTimer = null;
    if (!ui.miniRankingOpen) return;
    ui.miniRankingOutside = (e) => {
      if (!dd.contains(e.target) && !e.target.closest('[onclick*="toggleMiniRanking"]')) closeMiniRanking();
    };
    document.addEventListener('click', ui.miniRankingOutside);
  }, INPUT_FOCUS_DELAY);
};
function closeMiniRanking() {
  ui.miniRankingOpen = false;
  const dd = document.getElementById('miniRankingDropdown');
  if (dd) dd.style.display = 'none';
  if (ui.miniRankingOutsideTimer) {
    clearTimeout(ui.miniRankingOutsideTimer);
    ui.miniRankingOutsideTimer = null;
  }
  if (ui.miniRankingOutside) {
    document.removeEventListener('click', ui.miniRankingOutside);
    ui.miniRankingOutside = null;
  }
}

// Footer card tap + confirm fila imported from /js/tablet-footer.js

// ─── TV Mode ───
window.toggleTvMode = function () {
  ui.tvMode = !ui.tvMode;
  localStorage.setItem('minhavez_tvMode', ui.tvMode ? '1' : '0');
  applyTvMode();
  toast(ui.tvMode ? 'Modo TV ativado' : 'Modo TV desativado', 'info', TOAST_SHORT);
};
function applyTvMode() {
  const layout = document.querySelector('.tablet-layout');
  const btn = document.getElementById('tvMenuBtn');
  if (layout) layout.classList.toggle('tv-mode', ui.tvMode);
  if (btn) btn.classList.toggle('active', ui.tvMode);
  // Forçar re-render para esconder/mostrar elementos dinâmicos
  invalidateQueue();
  invalidateFooter();
  scheduleRender();
}
// Aplicar modo TV ao carregar
if (ui.tvMode) requestAnimationFrame(() => applyTvMode());

// ─── Logout ───
window.handleLogout = function () {
  logout();
};
window._toggleTheme = function () {
  const next = toggleTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'dark' ? '#060606' : '#F5F5F7';
};

// ─── More menu (three dots) ───
window.toggleMoreMenu = function () {
  const m = document.getElementById('moreMenu');
  if (!m) return;
  const open = m.style.display === 'none';
  m.style.display = open ? 'block' : 'none';
  // Atualizar label do tema
  if (open) {
    const lbl = document.getElementById('themeLabel');
    if (lbl)
      lbl.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Modo Claro' : 'Modo Escuro';
  }
};
document.addEventListener('click', function (e) {
  const m = document.getElementById('moreMenu');
  if (!m || m.style.display === 'none') return;
  if (!e.target.closest('.more-btn') && !e.target.closest('.more-menu')) {
    m.style.display = 'none';
  }
});

// ─── Session timeout (30min inactivity) ───
let _lastActivity = Date.now();
['click', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
  document.addEventListener(
    evt,
    () => {
      _lastActivity = Date.now();
    },
    { passive: true }
  );
});
timers.session = setInterval(() => {
  if (Date.now() - _lastActivity > SESSION_TIMEOUT_TABLET) {
    toast('Sessão expirada por inatividade', 'warning');
    setTimeout(() => logout(), TOAST_SHORT);
  }
}, SESSION_CHECK_INTERVAL);

// ─── Realtime (debounced, ignora ação local) ───
const _rtChannelName = `tablet-sync-${tenantId || 'default'}`;
let _rtChannel = sb
  .channel(_rtChannelName)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'vendedores', filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined },
    () => {
      if (ui.localAction) return;
      clearTimeout(timers.rtVend);
      timers.rtVend = setTimeout(loadVendedores, RT_VENDEDOR_DEBOUNCE);
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'atendimentos', filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined },
    () => {
      if (ui.localAction) return;
      clearTimeout(timers.rtAtend);
      timers.rtAtend = setTimeout(() => {
        updateQuickStats();
        checkActiveAtendimentos();
      }, RT_VENDEDOR_DEBOUNCE);
    }
  )
  .subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'flex';
      clearTimeout(timers.reconnect);
      const delay = Math.min(RT_RECONNECT_DELAY * Math.pow(2, ui._rtRetries || 0), 60000);
      ui._rtRetries = (ui._rtRetries || 0) + 1;
      timers.reconnect = setTimeout(() => {
        if (_rtChannel) _rtChannel.subscribe();
      }, delay);
    } else if (status === 'SUBSCRIBED') {
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'none';
      ui._rtRetries = 0;
    }
  });

// ─── Auto-sync: recarrega dados a cada 30s (funciona sempre, independente de tab/app switch) ───
setInterval(() => {
  if (document.hidden || !state.turno) return;
  ui.loadingVendedores = false;
  ui.localAction = false;
  loadVendedores();
  checkActiveAtendimentos();
}, AUTO_SYNC_INTERVAL);

// ─── Visibility: pause timer when hidden, refetch on return ───
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearAtendTimers();
    clearInterval(timers.session);
    timers.session = null;
    resetDragState();
    document.body.style.overflow = '';
    dom.queuePanel?.style.setProperty('overflow', '');
    dom.servicePanel?.style.setProperty('overflow', '');
  } else {
    ui.localAction = false;
    resetDragState();
    resetAtendDragState();
    document.body.style.overflow = '';
    clearTimeout(timers.localAction);
    ui.loadingVendedores = false;
    ui.actionLock = false;
    clearInterval(timers.session);
    timers.session = setInterval(() => {
      if (state.turno) updateQuickStats();
    }, QUICK_STATS_INTERVAL);
    invalidateQueue();
    invalidateFooter();
    scheduleRender();
    if (state.atendimentos.length > 0) renderActiveAtendimentos();
    loadVendedores();
    checkActiveAtendimentos();
    updateQuickStats();
  }
});

// checkExistingTurno imported from /js/tablet-turno.js

// checkActiveAtendimentos imported from /js/tablet-atendimento.js

// ─── Cleanup on page unload (timers, realtime, observers) ───
window.addEventListener('beforeunload', () => {
  clearInterval(timers.session);
  clearFooterTimer();
  clearAtendTimers();
  clearTimeout(timers.rtVend);
  clearTimeout(timers.rtAtend);
  clearTimeout(timers.reconnect);
  cleanupQueue();
  try {
    if (_rtChannel) {
      _rtChannel.unsubscribe();
      sb.removeChannel(_rtChannel);
      _rtChannel = null;
    }
  } catch (e) {
    console.warn('[rtChannel] cleanup:', e?.message || e);
  }
});

// ─── Changelog versionado (adicione novas entradas no TOPO do array) ───
// Para cada deploy, basta adicionar um objeto { version, date, items[] } no início.
// O popup aparece automaticamente 1x por versão para cada usuário.
const APP_CHANGELOG = [
  {
    version: '4.3.0',
    date: '2026-04-09',
    items: [
      { icon: 'fa-bug', text: 'Correção: pausas ficavam abertas indefinidamente ao arrastar vendedor de volta à fila' },
      { icon: 'fa-bug', text: 'Correção: trocar motivo de pausa não fechava a pausa anterior' }
    ]
  },
  {
    version: '4.2.0',
    date: '2026-04-07',
    items: [
      {
        icon: 'fa-wifi',
        text: 'Suporte offline real — o tablet continua funcionando sem internet e reconecta automaticamente'
      },
      {
        icon: 'fa-mobile-screen',
        text: 'PWA habilitado — agora é possível instalar o sistema como app na tela inicial do tablet'
      },
      {
        icon: 'fa-shield-halved',
        text: 'Proteção contra força bruta no PIN — bloqueio automático após tentativas inválidas'
      },
      { icon: 'fa-bug', text: 'Correção: ícone do sistema carregava com fundo preto no logo' },
      { icon: 'fa-wrench', text: 'Correção: Service Worker instalava com erro silencioso (logo inexistente no cache)' }
    ]
  },
  {
    version: '4.1.0',
    date: '2026-04-06',
    items: [
      {
        icon: 'fa-ranking-star',
        text: 'Header redesenhado — botões "Iniciar" e "Ranking" substituem o toggle e o troféu'
      },
      { icon: 'fa-palette', text: 'Ícones dos KPIs (Atendidos, Vendas, Conversão) unificados em rosa' },
      { icon: 'fa-text-height', text: 'Fonte dos KPIs no header aumentada para melhor leitura no tablet' },
      {
        icon: 'fa-stop',
        text: 'Botão "Encerrar" aparece em vermelho quando o turno está ativo — distinção clara de ação destrutiva'
      }
    ]
  },
  {
    version: '4.0.0',
    date: '2026-03-30',
    items: [
      { icon: 'fa-hand-pointer', text: 'Confirmação antes de iniciar atendimento — evita toques acidentais' },
      { icon: 'fa-star', text: 'Badge PRÓXIMO no 1º da fila com destaque visual' },
      { icon: 'fa-bell', text: 'Som ao retornar da pausa + vibração ao iniciar atendimento' },
      { icon: 'fa-clock', text: 'Timer de pausa no rodapé com alerta de tempo excedido' },
      { icon: 'fa-snowflake', text: 'Indicador de vendedor frio (>20min na fila sem ser chamado)' },
      { icon: 'fa-trophy', text: 'Mini-ranking do turno no header (troféu)' },
      { icon: 'fa-flag-checkered', text: 'Resumo completo ao encerrar turno (KPIs + top vendedor)' },
      { icon: 'fa-clock-rotate-left', text: 'Histórico de movimentações da sessão (botão Log na fila)' },
      { icon: 'fa-tv', text: 'Modo TV: painel somente leitura com fontes maiores' },
      { icon: 'fa-wand-magic-sparkles', text: 'Animações de transição entre estados (fila ↔ atendimento)' }
    ]
  },
  {
    version: '3.0.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-shield-halved', text: 'Proteção contra double-tap em ações (lock com fallback de segurança)' },
      { icon: 'fa-plug-circle-check', text: 'Canal realtime com cleanup correto — sem vazamento de conexão' },
      { icon: 'fa-broom', text: 'Timers, ghosts e drag limpos automaticamente ao trocar de aba' }
    ]
  },
  {
    version: '2.9.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-sync', text: 'Correção definitiva: nomes não somem mais ao alternar abas' },
      { icon: 'fa-feather', text: 'Tab mais leve — carregamento mais rápido' },
      { icon: 'fa-bell', text: 'Banner de atualização funciona corretamente' }
    ]
  },
  {
    version: '2.8.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-cash-register', text: 'Som realista de caixa registradora ao registrar venda' },
      { icon: 'fa-bolt', text: 'Feedback instantâneo ao enviar vendedor para atendimento' },
      { icon: 'fa-eye', text: 'Lista de atendimentos não some mais ao alternar abas' }
    ]
  },
  {
    version: '2.7.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-gauge-high', text: 'Micro-otimização: transições CSS mais leves, menos repaints' },
      { icon: 'fa-shield', text: 'Correções de estabilidade: race condition no menu de fila, guards em timers' },
      { icon: 'fa-chart-line', text: 'Dashboard: KPIs com cache de DOM, transições específicas' }
    ]
  },
  {
    version: '2.6.0',
    date: '2026-03-28',
    items: [
      {
        icon: 'fa-arrow-rotate-right',
        text: 'Atualizações agora mostram banner "toque para atualizar" — sem deslogar'
      },
      { icon: 'fa-bell', text: 'Dashboard agora mostra popup de novidades igual ao tablet' },
      { icon: 'fa-shield', text: 'Correções: troca com diferença e envio de vendedor para atendimento' }
    ]
  },
  {
    version: '2.5.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-bug', text: 'Correções de bugs: race condition no drag, double-tap cancelar, timer leak' },
      { icon: 'fa-bolt', text: 'Performance: limpeza de DOM otimizada, animações via GPU, cache de drag melhorado' },
      { icon: 'fa-battery-half', text: 'Economia de bateria: intervals pausam quando tab está oculta' },
      { icon: 'fa-expand', text: 'Responsivo: breakpoints para tablets pequenos e grandes, landscape otimizado' },
      { icon: 'fa-hand-pointer', text: 'Touch targets mínimo 44px, fontes mínimo 10px para acessibilidade' }
    ]
  },
  {
    version: '2.4.0',
    date: '2026-03-28',
    items: [
      {
        icon: 'fa-hand-pointer',
        text: 'Novo: arraste ou toque o card de atendimento para resolver (venda, troca, não converteu ou cancelar)'
      },
      {
        icon: 'fa-arrow-up',
        text: 'Cancelar atendimento agora retorna o vendedor ao 1º da fila (antes ia pro último)'
      },
      { icon: 'fa-clock', text: 'Timers agora mostram "5min 23s" em vez de "05:23" — mais legível' },
      { icon: 'fa-broom', text: 'Removidos os 4 mini botões de ação — interface mais limpa' }
    ]
  },
  {
    version: '2.3.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-bolt', text: 'Resposta instantânea ao colocar vendedor na fila (sem delay)' },
      { icon: 'fa-font', text: 'Fontes maiores em todos os popups, toasts e modais' },
      { icon: 'fa-circle-dot', text: 'Indicador de turno: bolinha verde pulsante na chave' },
      { icon: 'fa-square', text: 'Bordas arredondadas em check-in e confirmações' },
      { icon: 'fa-broom', text: 'Header limpo: removido texto e imagem desnecessários' }
    ]
  },
  {
    version: '2.2.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-circle-dot', text: 'Indicador de turno: bolinha verde pulsante na chave' },
      { icon: 'fa-palette', text: 'Chave de turno agora em cinza neutro, visual mais limpo' },
      { icon: 'fa-square', text: 'Bordas arredondadas no check-in dos vendedores' },
      { icon: 'fa-broom', text: 'Header limpo: removido texto e imagem desnecessários' }
    ]
  },
  {
    version: '2.1.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-display', text: 'Header redesenhado com KPIs mais claros e informativos' },
      { icon: 'fa-store', text: 'Tabs de setor maiores com ícones e nomes completos' },
      { icon: 'fa-users', text: 'Cards dos vendedores no rodapé ampliados e legíveis' },
      { icon: 'fa-bug', text: 'Correções de bugs: drag & drop, timers e estabilidade' },
      { icon: 'fa-gauge-high', text: 'Melhorias de performance e responsividade ao toque' }
    ]
  }
  // ↑ Adicione novas versões ACIMA desta linha ↑
];

// Mostrar versão no header + popup de novidades
setVersionLabel(APP_CHANGELOG, 'appVersion');
showChangelog(APP_CHANGELOG, 'minhavez_update_seen_', { createModal });

// ─── Init ───
// Cleanup de dados órfãos (atendimentos >8h, turnos antigos, vendedores presos)
if (tenantId) {
  try {
    const { data: cleanup } = await sb.rpc('cleanup_dados_orfaos', { p_tenant_id: tenantId });
    const cr = typeof cleanup === 'string' ? JSON.parse(cleanup) : cleanup;
    if (cr && (cr.atendimentos_stale > 0 || cr.vendedores_stuck > 0 || cr.turnos_fechados > 0)) {
      console.warn('[cleanup] Dados órfãos limpos:', cr);
    }
  } catch (e) {
    console.warn('[cleanup] erro:', e.message);
  }
}
await checkExistingTurno();
await loadVendedores();
await checkActiveAtendimentos();
loadCanaisOrigem(); // carrega canais de origem em background

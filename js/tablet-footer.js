// ============================================
// MinhaVez — Footer (vendedores com status)
// Render, events, confirm-fila popup
// ============================================

import { STATUS_CONFIG, SAIDA_COLORS, PAUSE_LIMITS, initials, toast } from '/js/utils.js';

let _ctx = null;
let _footerDropLabel = null;
let _lastFooterKey = '';
let _footerTimerInterval = null;
let _confirmFilaOutsideHandler = null;
let _confirmFilaTimeout = null;

/**
 * Initialize footer module with shared dependencies.
 * @param {object} ctx - Context with state accessors and helpers
 */
export function initFooter(ctx) {
  _ctx = ctx;

  // Expose to window for onclick handlers in HTML
  window.handleFooterTap = handleFooterTap;
  window.confirmAddToQueue = confirmAddToQueue;
  window.closeConfirmFila = closeConfirmFila;

  // Init footer event delegation
  initFooterEvents();

  // Timer refresh (pause/atend timers update every 60s)
  _footerTimerInterval = setInterval(() => {
    if (document.hidden || !_ctx.currentTurno) return;
    _lastFooterKey = '';
    renderFooter();
  }, 60000);
}

/** Clear footer timer (call on page unload) */
export function clearFooterTimer() {
  clearInterval(_footerTimerInterval);
}

/** Force footer re-render on next call */
export function invalidateFooter() {
  _lastFooterKey = '';
}

// ─── Drop zone label helpers ───

export function showFooterDropLabel() {
  const footer = _ctx.statusFooter;
  if (_footerDropLabel || !footer) return;
  _footerDropLabel = document.createElement('div');
  _footerDropLabel.className = 'drop-label';
  _footerDropLabel.textContent = 'Soltar para dar saída';
  footer.appendChild(_footerDropLabel);
}

export function hideFooterDropLabel() {
  if (_footerDropLabel) { _footerDropLabel.remove(); _footerDropLabel = null; }
}

// ─── Render footer (vendedores com status) ───

export function renderFooter() {
  const footer = _ctx.statusFooter;
  if (!footer) return;
  // Não re-renderizar durante drag ativo
  if (_ctx.touchDragging || _ctx.draggedId) return;

  const allV = _ctx.vendedores || [];
  const setorVendedores = allV.filter(v => (v.setor || 'loja') === _ctx.currentSetor);
  const _atendMap = new Map(_ctx.activeAtendimentos.map(a => [a.vendedor_id, a]));
  const _minGlobal = Math.floor(Date.now() / 60000);
  const footerKey = _minGlobal + '|' + setorVendedores.map(v => {
    let k = v.id + ':' + v.status + ':' + (v.posicao_fila || '') + ':' + (_ctx.saidaMotivos[v.id] || '');
    if (v.status === 'pausa') {
      const ps = _ctx.pauseStartTimes.get(v.id);
      if (ps) k += ':' + Math.floor((Date.now() - ps.getTime()) / 60000);
    }
    if (v.status === 'em_atendimento') {
      const at = _atendMap.get(v.id);
      if (at?.inicio) k += ':' + Math.floor((Date.now() - new Date(at.inicio).getTime()) / 60000);
    }
    return k;
  }).join('|');
  if (footerKey === _lastFooterKey) return;
  _lastFooterKey = footerKey;

  const cards = setorVendedores.map(v => {
    const inQueue = v.status === 'disponivel' && v.posicao_fila != null;
    const atendendo = v.status === 'em_atendimento';
    let statusLabel, statusColor, dotColor;

    if (atendendo) {
      const atend = _atendMap.get(v.id);
      const mins = atend && atend.inicio ? Math.floor((Date.now() - new Date(atend.inicio).getTime()) / 60000) : 0;
      statusLabel = mins > 0 ? 'Atendendo (' + mins + 'min)' : 'Atendendo';
      statusColor = 'var(--info)';
      dotColor = STATUS_CONFIG.em_atendimento.color;
    } else if (inQueue) {
      statusLabel = 'Na fila (#' + v.posicao_fila + ')';
      statusColor = 'var(--success)';
      dotColor = STATUS_CONFIG.disponivel.color;
    } else if (v.status === 'pausa') {
      const m = _ctx.saidaMotivos[v.id];
      const sc = SAIDA_COLORS[m] || SAIDA_COLORS.outro;
      const pauseStart = _ctx.pauseStartTimes.get(v.id);
      const pauseMins = pauseStart ? Math.floor((Date.now() - pauseStart.getTime()) / 60000) : 0;
      statusLabel = sc.label + (pauseMins > 0 ? ' (' + pauseMins + 'min)' : '');
      statusColor = sc.color;
      dotColor = sc.color;
    } else if (v.status === 'disponivel') {
      statusLabel = 'Disponível';
      statusColor = '#64748b';
      dotColor = '#64748b';
    } else {
      const m = _ctx.saidaMotivos[v.id];
      const sc = SAIDA_COLORS[m] || SAIDA_COLORS.outro;
      statusLabel = sc.labelFull;
      statusColor = sc.color;
      dotColor = sc.color;
    }

    // Pause exceeded check
    let pauseExceededClass = '';
    if (v.status === 'pausa') {
      const pm = _ctx.saidaMotivos[v.id];
      const pStart = _ctx.pauseStartTimes.get(v.id);
      const pMins = pStart ? Math.floor((Date.now() - pStart.getTime()) / 60000) : 0;
      const pLimit = PAUSE_LIMITS[pm] || 60;
      if (pMins >= pLimit) pauseExceededClass = ' pause-exceeded';
    }

    const inQueueClass = inQueue || atendendo ? ' in-queue' : '';
    const dragAttr = !inQueue && !atendendo ? 'draggable="true"' : '';

    const ini = initials(v.apelido || v.nome);
    const avatarContent = v.foto_url
      ? `<img src="${v.foto_url}" alt="${v.apelido || v.nome}" loading="lazy" width="48" height="48">`
      : ini;

    // Avatar color by status
    let avatarBg = '#4b5563'; // cinza = fora
    if (atendendo) avatarBg = '#3b82f6'; // azul
    else if (inQueue) avatarBg = '#22c55e'; // verde
    else if (v.status === 'pausa') avatarBg = statusColor;

    const firstName = (v.apelido || v.nome.split(' ')[0]);

    return `<div class="footer-card${inQueueClass}${pauseExceededClass}" data-id="${v.id}" ${dragAttr}>
      <div class="fc-avatar" style="background:${avatarBg}">${avatarContent}</div>
      <span class="fc-name">${firstName}</span>
      <span class="fc-status" style="color:${statusColor}">${statusLabel}</span>
    </div>`;
  }).join('');

  const footerTitle = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:64px;padding:6px 8px;flex-shrink:0"><span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);white-space:nowrap">Vendedores</span><span style="font-size:13px;font-weight:700;color:var(--text-secondary);font-family:var(--font-mono)">${setorVendedores.length}</span></div>`;

  footer.innerHTML = footerTitle + cards;
}

// ─── Footer event delegation ───

function initFooterEvents() {
  const footer = _ctx.statusFooter;
  if (!footer) return;
  // Drop zone
  footer.addEventListener('dragover', e => { e.preventDefault(); footer.classList.add('drop-highlight'); showFooterDropLabel(); });
  footer.addEventListener('dragleave', () => { footer.classList.remove('drop-highlight'); hideFooterDropLabel(); });
  footer.addEventListener('drop', e => {
    e.preventDefault();
    footer.classList.remove('drop-highlight');
    hideFooterDropLabel();
    const id = _ctx.draggedId;
    _ctx.draggedId = null;
    if (id) { _ctx.openSaida(id); }
  });
  // Click delegation
  footer.addEventListener('click', e => {
    const card = e.target.closest('.footer-card[data-id]');
    if (card) handleFooterTap(card.dataset.id);
  });
  // Drag start delegation
  footer.addEventListener('dragstart', e => {
    const card = e.target.closest('.footer-card[draggable="true"]');
    if (!card) return;
    _ctx.draggedId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    card.style.opacity = '0.4';
    setTimeout(() => { if (card) card.style.opacity = ''; }, 200);
  });
  footer.addEventListener('dragend', () => { _ctx.draggedId = null; });
  // Touch start delegation
  footer.addEventListener('touchstart', e => {
    const card = e.target.closest('.footer-card[data-id]');
    if (card) _ctx.onTouchDragStart(e);
  }, { passive: true });
}

// ─── Footer card tap ───

async function handleFooterTap(vendedorId) {
  if (_ctx.tvMode) return;
  const v = _ctx.vendedores.find(x => x.id === vendedorId);
  if (!v) return;
  if (v.status === 'em_atendimento') return;
  // Na fila → abrir popup de saída
  if (v.status === 'disponivel' && v.posicao_fila != null) {
    _ctx.openSaida(vendedorId);
    return;
  }
  // Fora/pausa → confirmar entrada na fila
  if (!_ctx.currentTurno) { toast('Abra o turno primeiro', 'warning'); return; }
  openConfirmFila(vendedorId);
}

// ─── Popup de confirmação para entrar na fila ───

function openConfirmFila(vendedorId) {
  const v = _ctx.vendedores.find(x => x.id === vendedorId);
  const nome = v ? (v.apelido || v.nome) : 'Vendedor';
  closeConfirmFila();

  const menu = document.createElement('div');
  menu.id = 'footerMenu';
  menu.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border-medium);border-radius:16px;padding:20px;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.2);min-width:280px;text-align:center;color:var(--text-primary)';

  menu.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px">${nome}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Colocar na fila de atendimento?</div>
    <div style="display:flex;gap:10px">
      <button onclick="closeConfirmFila()" style="flex:1;padding:12px;border:1px solid var(--border-subtle);border-radius:12px;background:var(--bg-hover);color:var(--text-muted);font-weight:600;font-size:14px;cursor:pointer;font-family:var(--font-body)">Cancelar</button>
      <button onclick="confirmAddToQueue('${vendedorId}')" style="flex:1;padding:12px;border:none;border-radius:12px;background:var(--success);color:#060606;font-weight:700;font-size:14px;cursor:pointer;font-family:var(--font-body)">
        <i class="fa-solid fa-check" style="margin-right:4px"></i>Confirmar
      </button>
    </div>
  `;

  document.body.appendChild(menu);
  _confirmFilaTimeout = setTimeout(() => {
    if (!menu.parentNode) return;
    _confirmFilaOutsideHandler = function(e) {
      if (!menu.contains(e.target)) closeConfirmFila();
    };
    document.addEventListener('click', _confirmFilaOutsideHandler);
  }, 100);
}

async function confirmAddToQueue(vendedorId) {
  closeConfirmFila();
  delete _ctx.saidaMotivos[vendedorId];
  await _ctx.addToQueue(vendedorId);
}

function closeConfirmFila() {
  if (_confirmFilaTimeout) { clearTimeout(_confirmFilaTimeout); _confirmFilaTimeout = null; }
  if (_confirmFilaOutsideHandler) {
    document.removeEventListener('click', _confirmFilaOutsideHandler);
    _confirmFilaOutsideHandler = null;
  }
  const m = document.getElementById('footerMenu');
  if (m) m.remove();
}

// ============================================
// MinhaVez — Footer (vendedores com status)
// Render, events, confirm-fila popup
// ============================================

import { SAIDA_COLORS, PAUSE_LIMITS, initials, toast, escapeHtml } from '/js/utils.js';
import { FOOTER_TIMER_INTERVAL, INPUT_FOCUS_DELAY, Z_MENU } from '/js/constants.js';

let _ctx = null;
let _footerDropLabel = null;
let _lastFooterKey = '';
let _footerTimerInterval = null;
let _confirmFilaOutsideHandler = null;
let _confirmFilaTimeout = null;
// Per-card state para diffing: id -> { key, node }
const _footerCardState = new Map();
let _footerTitleEl = null;

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
  }, FOOTER_TIMER_INTERVAL);
}

/** Clear footer timer (call on page unload) */
export function clearFooterTimer() {
  clearInterval(_footerTimerInterval);
}

/** Force footer re-render on next call */
export function invalidateFooter() {
  _lastFooterKey = '';
}

/** Reset card cache (use after full footer wipe, e.g. setor change). */
function resetFooterCardState() {
  _footerCardState.clear();
  _footerTitleEl = null;
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
  if (_footerDropLabel) {
    _footerDropLabel.remove();
    _footerDropLabel = null;
  }
}

// ─── Render footer (vendedores com status) ───

/** Build a CardData object from vendedor + context. */
function buildFooterCardData(v, atendMap) {
  const inQueue = v.status === 'disponivel' && v.posicao_fila != null;
  const atendendo = v.status === 'em_atendimento';
  let statusLabel, statusColor;

  if (atendendo) {
    const atend = atendMap.get(v.id);
    const mins = atend && atend.inicio ? Math.floor((Date.now() - new Date(atend.inicio).getTime()) / 60000) : 0;
    statusLabel = mins > 0 ? 'Atendendo (' + mins + 'min)' : 'Atendendo';
    statusColor = 'var(--info)';
  } else if (inQueue) {
    statusLabel = 'Na fila (#' + v.posicao_fila + ')';
    statusColor = 'var(--success)';
  } else if (v.status === 'pausa') {
    const m = _ctx.saidaMotivos[v.id];
    const sc = SAIDA_COLORS[m] || SAIDA_COLORS.outro;
    const pauseStart = _ctx.pauseStartTimes.get(v.id);
    const pauseMins = pauseStart ? Math.floor((Date.now() - pauseStart.getTime()) / 60000) : 0;
    statusLabel = sc.label + (pauseMins > 0 ? ' (' + pauseMins + 'min)' : '');
    statusColor = sc.color;
  } else if (v.status === 'disponivel') {
    statusLabel = 'Disponível';
    statusColor = '#64748b';
  } else {
    const m = _ctx.saidaMotivos[v.id];
    const sc = SAIDA_COLORS[m] || SAIDA_COLORS.outro;
    statusLabel = sc.labelFull;
    statusColor = sc.color;
  }

  // Pause exceeded check
  let pauseExceeded = false;
  if (v.status === 'pausa') {
    const pm = _ctx.saidaMotivos[v.id];
    const pStart = _ctx.pauseStartTimes.get(v.id);
    const pMins = pStart ? Math.floor((Date.now() - pStart.getTime()) / 60000) : 0;
    const pLimit = PAUSE_LIMITS[pm] || 60;
    if (pMins >= pLimit) pauseExceeded = true;
  }

  const draggable = !inQueue && !atendendo;
  const firstName = v.apelido || v.nome.split(' ')[0];

  // Avatar color by status
  let avatarBg = '#525252';
  if (atendendo) avatarBg = '#8ea5c9';
  else if (inQueue) avatarBg = '#a78bfa';
  else if (v.status === 'pausa') avatarBg = statusColor;

  // Fingerprint — tudo que altera a saída renderizada
  const key = [
    v.id,
    v.status,
    v.posicao_fila || '',
    statusLabel,
    statusColor,
    avatarBg,
    firstName,
    v.foto_url || '',
    inQueue ? 1 : 0,
    atendendo ? 1 : 0,
    pauseExceeded ? 1 : 0,
    draggable ? 1 : 0
  ].join('|');

  return {
    id: v.id,
    key,
    inQueue,
    atendendo,
    pauseExceeded,
    draggable,
    statusLabel,
    statusColor,
    avatarBg,
    firstName,
    fotoUrl: v.foto_url || '',
    fullName: v.apelido || v.nome
  };
}

/** Create a brand-new footer card DOM node from card data. */
function createFooterCardNode(cd) {
  const node = document.createElement('div');
  node.dataset.id = cd.id;
  const avatar = document.createElement('div');
  avatar.className = 'fc-avatar';
  const name = document.createElement('span');
  name.className = 'fc-name';
  const status = document.createElement('span');
  status.className = 'fc-status';
  node.appendChild(avatar);
  node.appendChild(name);
  node.appendChild(status);
  applyFooterCardData(node, cd);
  return node;
}

/** Apply card data to an existing DOM node (idempotent). */
function applyFooterCardData(node, cd) {
  // Classes
  let cls = 'footer-card';
  if (cd.inQueue || cd.atendendo) cls += ' in-queue';
  if (cd.pauseExceeded) cls += ' pause-exceeded';
  // Preserve transient enter animation class se presente
  if (node.classList.contains('new-item')) cls += ' new-item';
  if (node.className !== cls) node.className = cls;

  // Draggable attr
  if (cd.draggable) {
    if (node.getAttribute('draggable') !== 'true') node.setAttribute('draggable', 'true');
  } else if (node.hasAttribute('draggable')) {
    node.removeAttribute('draggable');
  }

  // Avatar bg
  const avatar = node.firstChild;
  if (avatar.style.background !== cd.avatarBg) avatar.style.background = cd.avatarBg;

  // Avatar content (img vs initials)
  const hasImg = avatar.firstChild && avatar.firstChild.tagName === 'IMG';
  if (cd.fotoUrl) {
    if (!hasImg) {
      avatar.textContent = '';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.width = 48;
      img.height = 48;
      img.src = cd.fotoUrl;
      img.alt = cd.fullName;
      avatar.appendChild(img);
    } else {
      const img = avatar.firstChild;
      if (img.src !== cd.fotoUrl) img.src = cd.fotoUrl;
      if (img.alt !== cd.fullName) img.alt = cd.fullName;
    }
  } else {
    const ini = initials(cd.fullName);
    if (hasImg || avatar.textContent !== ini) {
      avatar.textContent = ini;
    }
  }

  // Name + status
  const name = avatar.nextSibling;
  if (name.textContent !== cd.firstName) name.textContent = cd.firstName;
  const status = name.nextSibling;
  if (status.textContent !== cd.statusLabel) status.textContent = cd.statusLabel;
  if (status.style.color !== cd.statusColor) status.style.color = cd.statusColor;
}

/** Ensure the footer title block exists and reflects the vendor count. */
function ensureFooterTitle(footer, count) {
  if (!_footerTitleEl || _footerTitleEl.parentNode !== footer) {
    _footerTitleEl = document.createElement('div');
    _footerTitleEl.className = 'footer-title';
    const lbl = document.createElement('span');
    lbl.className = 'footer-title-label';
    lbl.textContent = 'Vendedores';
    const cnt = document.createElement('span');
    cnt.className = 'footer-title-count';
    _footerTitleEl.appendChild(lbl);
    _footerTitleEl.appendChild(cnt);
    footer.insertBefore(_footerTitleEl, footer.firstChild);
  }
  const cntEl = _footerTitleEl.lastChild;
  const str = String(count);
  if (cntEl.textContent !== str) cntEl.textContent = str;
}

export function renderFooter() {
  const footer = _ctx.statusFooter;
  if (!footer) return;
  // Não re-renderizar durante drag ativo
  if (_ctx.touchDragging || _ctx.draggedId) return;

  const allV = _ctx.vendedores || [];
  const setorVendedores = allV.filter((v) => (v.setor || 'loja') === _ctx.currentSetor);
  const _atendMap = new Map(_ctx.activeAtendimentos.map((a) => [a.vendedor_id, a]));
  const _minGlobal = Math.floor(Date.now() / 60000);
  const footerKey =
    _minGlobal +
    '|' +
    setorVendedores
      .map((v) => {
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
      })
      .join('|');
  if (footerKey === _lastFooterKey) return;
  _lastFooterKey = footerKey;

  // Se o footer foi esvaziado/reconstruído externamente (ex: toggleTvMode),
  // o cache fica obsoleto. Detectamos checando se ainda contém os nós.
  if (_footerTitleEl && _footerTitleEl.parentNode !== footer) resetFooterCardState();

  ensureFooterTitle(footer, setorVendedores.length);

  const seen = new Set();
  let prev = _footerTitleEl;
  for (const v of setorVendedores) {
    const cd = buildFooterCardData(v, _atendMap);
    seen.add(cd.id);
    const cached = _footerCardState.get(cd.id);
    let node;
    if (cached && cached.node.parentNode === footer) {
      node = cached.node;
      if (cached.key !== cd.key) {
        applyFooterCardData(node, cd);
        cached.key = cd.key;
      }
    } else {
      node = createFooterCardNode(cd);
      _footerCardState.set(cd.id, { key: cd.key, node });
      // Animação de entrada — classe removida após o fim da animação pra
      // não interferir com o próximo diff (applyFooterCardData preserva
      // a classe se presente, mas removemos pra manter o DOM limpo)
      node.classList.add('new-item');
      setTimeout(() => node.classList.remove('new-item'), 400);
    }
    // Reorder se necessário (e insere novos)
    if (prev.nextSibling !== node) {
      footer.insertBefore(node, prev.nextSibling);
    }
    prev = node;
  }

  // Remove nós obsoletos (vendedores que sumiram do setor atual)
  for (const [id, cached] of _footerCardState) {
    if (!seen.has(id)) {
      if (cached.node.parentNode === footer) cached.node.remove();
      _footerCardState.delete(id);
    }
  }
}

// ─── Footer event delegation ───

function initFooterEvents() {
  const footer = _ctx.statusFooter;
  if (!footer) return;
  // Drop zone
  footer.addEventListener('dragover', (e) => {
    e.preventDefault();
    footer.classList.add('drop-highlight');
    showFooterDropLabel();
  });
  footer.addEventListener('dragleave', () => {
    footer.classList.remove('drop-highlight');
    hideFooterDropLabel();
  });
  footer.addEventListener('drop', (e) => {
    e.preventDefault();
    footer.classList.remove('drop-highlight');
    hideFooterDropLabel();
    const id = _ctx.draggedId;
    _ctx.draggedId = null;
    if (id) {
      _ctx.openSaida(id);
    }
  });
  // Click delegation
  footer.addEventListener('click', (e) => {
    const card = e.target.closest('.footer-card[data-id]');
    if (card) handleFooterTap(card.dataset.id);
  });
  // Drag start delegation
  footer.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.footer-card[draggable="true"]');
    if (!card) return;
    _ctx.draggedId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    card.style.opacity = '0.4';
    setTimeout(() => {
      if (card) card.style.opacity = '';
    }, 200);
  });
  footer.addEventListener('dragend', () => {
    _ctx.draggedId = null;
  });
  // Touch start delegation
  footer.addEventListener(
    'touchstart',
    (e) => {
      const card = e.target.closest('.footer-card[data-id]');
      if (card) _ctx.onTouchDragStart(e);
    },
    { passive: true }
  );
}

// ─── Footer card tap ───

async function handleFooterTap(vendedorId) {
  if (_ctx.tvMode) return;
  const v = _ctx.vendedores.find((x) => x.id === vendedorId);
  if (!v) return;
  if (v.status === 'em_atendimento') return;
  // Na fila → abrir popup de saída
  if (v.status === 'disponivel' && v.posicao_fila != null) {
    _ctx.openSaida(vendedorId);
    return;
  }
  // Fora/pausa → confirmar entrada na fila
  if (!_ctx.currentTurno) {
    toast('Abra o turno primeiro', 'warning');
    return;
  }
  openConfirmFila(vendedorId);
}

// ─── Popup de confirmação para entrar na fila ───

function openConfirmFila(vendedorId) {
  const v = _ctx.vendedores.find((x) => x.id === vendedorId);
  const nome = v ? v.apelido || v.nome : 'Vendedor';
  closeConfirmFila();

  const menu = document.createElement('div');
  menu.id = 'footerMenu';
  menu.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border-medium);border-radius:16px;padding:20px;z-index:${Z_MENU};box-shadow:0 4px 20px rgba(0,0,0,.2);min-width:280px;text-align:center;color:var(--text-primary)`;

  menu.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px">${escapeHtml(nome)}</div>
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
    _confirmFilaOutsideHandler = function (e) {
      if (!menu.contains(e.target)) closeConfirmFila();
    };
    document.addEventListener('click', _confirmFilaOutsideHandler);
  }, INPUT_FOCUS_DELAY);
}

async function confirmAddToQueue(vendedorId) {
  closeConfirmFila();
  delete _ctx.saidaMotivos[vendedorId];
  await _ctx.addToQueue(vendedorId);
}

function closeConfirmFila() {
  if (_confirmFilaTimeout) {
    clearTimeout(_confirmFilaTimeout);
    _confirmFilaTimeout = null;
  }
  if (_confirmFilaOutsideHandler) {
    document.removeEventListener('click', _confirmFilaOutsideHandler);
    _confirmFilaOutsideHandler = null;
  }
  const m = document.getElementById('footerMenu');
  if (m) m.remove();
}

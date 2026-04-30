// ============================================
// MinhaVez — Queue Rendering & Drag-and-Drop
// renderQueue, drag desktop + touch
// ============================================

import { STATUS_CONFIG, SAIDA_COLORS, formatTime, toast, escapeHtml, setoresMatch } from '/js/utils.js';
import { renderFooter, invalidateFooter, showFooterDropLabel, hideFooterDropLabel } from '/js/tablet-footer.js';
import {
  COLD_SELLER_TIMEOUT,
  ATTENDANCE_DANGER_SECONDS,
  DRAG_THRESHOLD_QUEUE,
  DRAG_GHOST_Y_OFFSET,
  Z_DRAG_GHOST,
  TOAST_SHORT
} from '/js/constants.js';

let _ctx = null;

// ─── Queue state (module-private) ───
let _lastQueueKey = '';
let draggedId = null;
let _dragDropInitialized = false;
let _itemObserver = null;
let _dragRectsCache = null;
let _dragRectsCacheTime = 0;

// Per-item diffing state
const _queueItemState = new Map(); // id -> { key, node }
const _pauseItemState = new Map(); // id -> { key, node }
let _queueEmptyNode = null;
let _queueInitialNode = null;
let _queuePauseHeader = null;

// Touch drag state
let touchDragEl = null;
let touchDragId = null;
let touchGhost = null;
let touchStartX = 0,
  touchStartY = 0;
let touchDragging = false;
let _ghostInitX = 0,
  _ghostInitY = 0;
let _lastDropCheck = 0;

/**
 * Initialize queue module with shared dependencies.
 */
export function initQueue(ctx) {
  _ctx = ctx;

  // Expose to window for HTML onclick handlers
  window.onTouchDragStart = onTouchDragStart;
  window.sendToAtendimento = function (vendedorId) {
    if (_ctx.tvMode) return;
    _ctx.withLock(() => _ctx.doSendToAtendimento(vendedorId));
  };

  // Service panel as drop zone (desktop drag)
  initServiceDrop();
}

/** Force queue re-render on next call */
export function invalidateQueue() {
  _lastQueueKey = '';
}

/** Get current draggedId (needed by footer module) */
export function getDraggedId() {
  return draggedId;
}
export function setDraggedId(v) {
  draggedId = v;
}

/** Get touchDragging state */
export function isTouchDragging() {
  return touchDragging;
}

/** Get touchGhost ref for ghost cleanup */
export function getTouchGhost() {
  return touchGhost;
}
export function setTouchGhost(v) {
  touchGhost = v;
}

/** Cleanup observer on page unload */
export function cleanupQueue() {
  if (_itemObserver) _itemObserver.disconnect();
}

/** Reset all drag state (call on visibilitychange) */
export function resetDragState() {
  if (touchGhost) {
    touchGhost.remove();
    touchGhost = null;
  }
  if (touchDragEl) {
    touchDragEl.style.opacity = '1';
    touchDragEl = null;
  }
  draggedId = null;
  touchDragId = null;
  touchDragging = false;
  _dragRectsCache = null;
}

// ─── Batch render ───

export function scheduleRender() {
  if (_ctx.renderPending) return;
  _ctx.renderPending = true;
  requestAnimationFrame(() => {
    _ctx.renderPending = false;
    renderQueue();
    renderFooter();
    _ctx.updateQuickStats();
  });
}

// ─── Render queue ───

/** Parse an HTML string into a single element. */
function htmlToElement(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.firstElementChild;
}

function ensureInitialNode() {
  if (!_queueInitialNode) {
    _queueInitialNode = htmlToElement(
      '<div class="queue-blank-state"><i class="fa-solid fa-users-slash"></i>Abra o turno para iniciar</div>'
    );
  }
  return _queueInitialNode;
}

function ensureEmptyNode() {
  if (!_queueEmptyNode) {
    _queueEmptyNode = htmlToElement(
      '<div class="queue-empty-state"><div class="queue-empty-icon"><i class="fa-solid fa-check"></i></div><strong>Todo mundo ocupado!</strong><span>Arraste alguém do rodapé ou toque num vendedor para colocar na fila</span></div>'
    );
  }
  return _queueEmptyNode;
}

function ensurePauseHeader() {
  if (!_queuePauseHeader) {
    _queuePauseHeader = htmlToElement(
      '<div class="queue-pause-header"><i class="fa-solid fa-pause"></i>Em pausa</div>'
    );
  }
  return _queuePauseHeader;
}

function renderPauseItemHtml(v, motivoColor, motivoLabel) {
  return `<div class="queue-item queue-item-pause" data-id="${v.id}" data-action="return-pause" draggable="true" style="border-left:3px solid ${motivoColor}">
    <div class="queue-position" style="background:${motivoColor}20;color:${motivoColor}"><i class="fa-solid ${STATUS_CONFIG.pausa.icon}"></i></div>
    <div class="queue-item-body">
      <div class="queue-item-name">${escapeHtml(v.apelido || v.nome)}</div>
      <div class="queue-item-pause-label" style="color:${motivoColor}">${escapeHtml(motivoLabel)}</div>
    </div>
    <i class="fa-solid fa-arrow-rotate-left queue-pause-return" title="Voltar à fila"></i>
  </div>`;
}

export function renderQueue() {
  const list = _ctx.queueList;
  const allVendedores = _ctx.vendedores || [];
  const setorVendedores = allVendedores.filter((v) => setoresMatch(v.setor, _ctx.currentSetor));
  const inQueue = setorVendedores
    .filter((v) => v.status === 'disponivel' && v.posicao_fila != null)
    .sort((a, b) => a.posicao_fila - b.posicao_fila);
  const pausa = setorVendedores.filter((v) => v.status === 'pausa');

  const countEl = document.getElementById('queueCount');
  if (countEl) {
    const txt = inQueue.length + ' na fila';
    if (countEl.textContent !== txt) countEl.textContent = txt;
  }

  // Atualizar cold seller tracking
  const currentIds = new Set(inQueue.map((v) => v.id));
  for (const [id] of _ctx.queueEntryTimes) {
    if (!currentIds.has(id)) _ctx.queueEntryTimes.delete(id);
  }
  inQueue.forEach((v) => {
    const entry = _ctx.queueEntryTimes.get(v.id);
    if (!entry) {
      _ctx.queueEntryTimes.set(v.id, { pos: v.posicao_fila, time: Date.now() });
    } else if (entry.pos !== v.posicao_fila) {
      entry.pos = v.posicao_fila;
      entry.time = Date.now();
    }
  });

  // Build key para detectar mudanças reais
  const _nowMin = Math.floor(Date.now() / 60000);
  const queueKey =
    (_ctx.currentTurno ? '1' : '0') +
    '|' +
    inQueue
      .map((v) => {
        const cold =
          _ctx.queueEntryTimes.has(v.id) && Date.now() - _ctx.queueEntryTimes.get(v.id).time > COLD_SELLER_TIMEOUT;
        return v.id + (cold ? ':C' : '');
      })
      .join(',') +
    '|' +
    pausa.map((v) => v.id + ':' + (_ctx.saidaMotivos[v.id] || '')).join(',') +
    '|' +
    _nowMin;
  if (queueKey === _lastQueueKey) return;
  _lastQueueKey = queueKey;

  // Sem turno → estado inicial, zera caches
  if (!_ctx.currentTurno) {
    _queueItemState.clear();
    _pauseItemState.clear();
    list.replaceChildren(ensureInitialNode());
    return;
  }

  // Constrói a lista de nós desejados, na ordem de exibição
  const desired = [];
  inQueue.forEach((v, i) => {
    const pos = i + 1;
    const cold =
      _ctx.queueEntryTimes.has(v.id) && Date.now() - _ctx.queueEntryTimes.get(v.id).time > COLD_SELLER_TIMEOUT;
    const count = _ctx.vendorAtendCount[v.id] || 0;
    const atendForTimer =
      v.status === 'em_atendimento' ? _ctx.activeAtendimentos.find((a) => a.vendedor_id === v.id) : null;
    const atendId = atendForTimer ? atendForTimer.id : '';
    const key = [v.id, v.status, pos, v.apelido || v.nome, cold ? 1 : 0, count, atendId].join('|');
    const cached = _queueItemState.get(v.id);
    let node;
    if (cached && cached.key === key && cached.node.parentNode === list) {
      node = cached.node;
    } else {
      const isBrandNew = !cached;
      node = htmlToElement(renderQueueItem(v, pos, false, true));
      _queueItemState.set(v.id, { key, node });
      if (isBrandNew) node._justCreated = true;
    }
    desired.push(node);
  });

  if (inQueue.length === 0) desired.push(ensureEmptyNode());

  if (pausa.length > 0) {
    desired.push(ensurePauseHeader());
    pausa.forEach((v) => {
      const motivoKey = _ctx.saidaMotivos[v.id];
      const motivoColor = motivoKey
        ? SAIDA_COLORS[motivoKey]?.color || STATUS_CONFIG.pausa.color
        : STATUS_CONFIG.pausa.color;
      const motivoLabel = motivoKey ? SAIDA_COLORS[motivoKey]?.label || 'Pausa' : 'Pausa';
      const key = [v.id, v.apelido || v.nome, motivoKey || '', motivoColor, motivoLabel].join('|');
      const cached = _pauseItemState.get(v.id);
      let node;
      if (cached && cached.key === key && cached.node.parentNode === list) {
        node = cached.node;
      } else {
        node = htmlToElement(renderPauseItemHtml(v, motivoColor, motivoLabel));
        _pauseItemState.set(v.id, { key, node });
      }
      desired.push(node);
    });
  }

  // Reconcilia o DOM: insere/reordena na ordem desejada
  let prev = null;
  for (const node of desired) {
    const target = prev ? prev.nextSibling : list.firstChild;
    if (target !== node) {
      list.insertBefore(node, target);
    }
    prev = node;
  }
  // Remove nós stale após o último desejado
  while (prev && prev.nextSibling) {
    list.removeChild(prev.nextSibling);
  }
  if (!prev && list.firstChild) {
    list.replaceChildren();
  }

  // Limpa entries stale dos caches
  const queueIds = new Set(inQueue.map((v) => v.id));
  for (const [id] of _queueItemState) {
    if (!queueIds.has(id)) _queueItemState.delete(id);
  }
  const pauseIds = new Set(pausa.map((v) => v.id));
  for (const [id] of _pauseItemState) {
    if (!pauseIds.has(id)) _pauseItemState.delete(id);
  }

  initDragAndDrop();

  // GSAP: anima entrada de novos itens com stagger (2.4)
  animateNewQueueItems(desired);
}

function animateNewQueueItems(nodes) {
  const gsap = window.gsap;
  if (!gsap) return;
  const fresh = nodes.filter((n) => n._justCreated);
  if (!fresh.length) return;
  fresh.forEach((n) => {
    n._justCreated = false;
  });
  gsap.from(fresh, {
    opacity: 0,
    scale: 0.85,
    y: -8,
    duration: 0.42,
    ease: 'back.out(1.6)',
    stagger: { each: 0.05, from: 'start' },
    clearProps: 'all'
  });
}

/**
 * Shared-element flight: clona ficha da fila e faz arc até o painel de atendimento.
 * Chamado antes da mutação de dados, pra dar sensação de continuidade.
 */
export function animateFichaToAtendimento(vendedorId) {
  const gsap = window.gsap;
  if (!gsap) return;
  const src =
    document.querySelector(`.queue-item[data-id="${vendedorId}"]`) ||
    document.querySelector(`[data-vendedor-id="${vendedorId}"]`);
  const target = document.querySelector('.service-panel') || document.getElementById('activeServices');
  if (!src || !target) return;
  const sRect = src.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const clone = src.cloneNode(true);
  clone.style.cssText = `position:fixed;left:${sRect.left}px;top:${sRect.top}px;width:${sRect.width}px;margin:0;z-index:${Z_DRAG_GHOST};pointer-events:none;box-shadow:0 20px 48px rgba(167, 139, 250,.3);border:1px solid rgba(167, 139, 250,.4)`;
  document.body.appendChild(clone);
  const tx = tRect.left + 20;
  const ty = tRect.top + 20;
  gsap
    .timeline({ onComplete: () => clone.remove() })
    .to(clone, { scale: 1.04, duration: 0.15, ease: 'power2.out' })
    .to(clone, {
      left: tx,
      top: ty,
      scale: 0.95,
      opacity: 0.5,
      duration: 0.55,
      ease: 'power2.inOut'
    })
    .to(clone, { opacity: 0, scale: 0.8, duration: 0.15, ease: 'power2.in' });
}

function renderQueueItem(v, pos, isActive, draggable) {
  const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.fora;
  const dragAttr = draggable ? 'draggable="true"' : '';
  const dragStyle = draggable ? 'cursor:grab;' : '';

  // ─── Layout v54 (alinhado ao mockup ScreenTablet) ───
  // [grip] [N°mono] [⚪M circle 36px] [nome \n status / "↪ próximo"] [count] [timer] [→]
  const isNext = draggable && pos === 1;
  const nextClass = isNext ? ' next-in-line' : '';
  const coldClass =
    draggable &&
    _ctx.queueEntryTimes.has(v.id) &&
    Date.now() - _ctx.queueEntryTimes.get(v.id).time > COLD_SELLER_TIMEOUT
      ? ' cold-seller'
      : '';

  // Posição mono inline (estilo mockup: "01", "02", "03")
  const posStr = pos ? String(pos).padStart(2, '0') : '';
  const posHtml = posStr
    ? `<span class="queue-pos-num">${posStr}</span>`
    : `<span class="queue-pos-num"><i class="fa-solid ${cfg.icon}"></i></span>`;

  // Avatar circular 36px com inicial; bg pega da cor do status
  const initial = (v.apelido || v.nome || '?').trim().charAt(0).toUpperCase();
  const avatarHtml = `<span class="queue-avatar" style="background:${cfg.color}">${escapeHtml(initial)}</span>`;

  // Tempo na fila — mostra há quanto tempo o vendedor está esperando
  // (ajuda recepcionista a perceber vendedores parados há muito tempo)
  let queueTimeText = '';
  if (draggable && v.status === 'disponivel' && _ctx.queueEntryTimes.has(v.id)) {
    const entry = _ctx.queueEntryTimes.get(v.id);
    const elapsedMin = Math.floor((Date.now() - entry.time) / 60000);
    if (elapsedMin >= 1) queueTimeText = `${elapsedMin}min na fila`;
  }

  // Linha de status: "↪ próximo cliente" (1º) ou status + tempo na fila
  let statusLine = '';
  if (isNext) {
    statusLine = `<span class="queue-item-next-text">↪ próximo cliente</span>`;
  } else if (queueTimeText) {
    statusLine = `<span class="queue-item-status" style="color:${cfg.color}">${cfg.short}</span><span class="queue-item-time">${queueTimeText}</span>`;
  } else {
    statusLine = `<span class="queue-item-status" style="color:${cfg.color}">${cfg.short}</span>`;
  }

  // Timer (vendedor em_atendimento que ainda aparece na fila)
  let timerHtml = '';
  if (v.status === 'em_atendimento') {
    const atend = _ctx.activeAtendimentos.find((a) => a.vendedor_id === v.id);
    if (atend && atend.inicio) {
      const startMs = new Date(atend.inicio).getTime();
      const elapsed = isNaN(startMs) ? 0 : (Date.now() - startMs) / 1000;
      const clr = elapsed > ATTENDANCE_DANGER_SECONDS ? 'var(--mv-status-error)' : 'var(--mv-text)';
      timerHtml = `<span class="queue-item-timer" data-sidebar-timer="${atend.id}" style="color:${clr}">${formatTime(elapsed)}</span>`;
    }
  }

  // Botão de ação (mandar pra atendimento) — preserva funcionalidade
  let actionHtml = '';
  if (draggable && _ctx.currentTurno) {
    actionHtml = `<button class="queue-item-action" data-action="send-atend" data-vid="${v.id}" title="Enviar ao atendimento" aria-label="Enviar ao atendimento"><i class="fa-solid fa-arrow-right"></i></button>`;
  }

  // Badge de contagem de atendimentos no turno
  const atendCount = _ctx.vendorAtendCount[v.id] || 0;
  const countBadge =
    atendCount > 0
      ? `<span class="atend-count-badge" title="${atendCount} atendimento${atendCount > 1 ? 's' : ''} no turno">${atendCount}</span>`
      : '';

  return `<div class="queue-item ${v.status}${isActive ? ' active' : ''}${nextClass}${coldClass}" data-id="${v.id}" ${dragAttr} style="${dragStyle};position:relative">
    ${draggable ? '<i class="fa-solid fa-grip-vertical queue-item-grip" aria-hidden="true"></i>' : ''}
    ${posHtml}
    ${avatarHtml}
    <div class="queue-item-body">
      <div class="queue-item-name-row">
        <span class="queue-item-name">${escapeHtml(v.apelido || v.nome)}</span>
        ${countBadge}
      </div>
      ${statusLine}
    </div>
    ${timerHtml}
    ${actionHtml}
  </div>`;
}

// ─── Drag and Drop (desktop) ───

function initDragAndDrop() {
  const dropzone = _ctx.queueList;
  if (!dropzone) return;
  if (_dragDropInitialized) return;
  _dragDropInitialized = true;

  dropzone.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action="send-atend"]');
    if (actionBtn) {
      e.stopPropagation();
      window.sendToAtendimento(actionBtn.dataset.vid);
      return;
    }
    const pauseItem = e.target.closest('[data-action="return-pause"]');
    if (pauseItem) {
      _ctx.returnFromPause(pauseItem.dataset.id);
      return;
    }
  });
  dropzone.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.queue-item');
    if (!item) return;
    draggedId = item.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
  });
  dropzone.addEventListener('dragend', () => {
    draggedId = null;
  });
  dropzone.addEventListener(
    'touchstart',
    (e) => {
      const item = e.target.closest('.queue-item');
      if (item) onTouchDragStart(e);
    },
    { passive: true }
  );

  let _cachedQueueItems = null;
  const getCachedItems = () => _cachedQueueItems || (_cachedQueueItems = [...dropzone.querySelectorAll('.queue-item')]);
  const clearDragIndicators = () => {
    getCachedItems().forEach((el) => el.classList.remove('drag-above', 'drag-below'));
  };
  if (_itemObserver) _itemObserver.disconnect();
  _itemObserver = new MutationObserver(() => {
    _cachedQueueItems = null;
  });
  _itemObserver.observe(dropzone, { childList: true });

  let _prevDragAfter = null;
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
    dropzone.style.background = 'rgba(167, 139, 250,.05)';
    const after = getDragAfterElement(dropzone, e.clientY);
    if (after !== _prevDragAfter) {
      clearDragIndicators();
      if (after) after.classList.add('drag-above');
      else {
        const items = getCachedItems();
        if (items.length > 0) items[items.length - 1].classList.add('drag-below');
      }
      _prevDragAfter = after;
    }
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragging');
    dropzone.style.background = '';
    clearDragIndicators();
    _prevDragAfter = null;
  });
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
    dropzone.style.background = '';
    clearDragIndicators();
    _prevDragAfter = null;
    if (!draggedId) return;

    const v = _ctx.vendedores.find((x) => x.id === draggedId);
    const isInQueue = v && v.status === 'disponivel' && v.posicao_fila != null;
    const afterEl = getDragAfterElement(dropzone, e.clientY);
    const afterId = afterEl?.dataset.id || null;

    if (isInQueue) {
      await reorderInQueue(draggedId, afterId);
    } else {
      await addToQueueAt(draggedId, afterId);
    }
    draggedId = null;
  });
}

// ─── Drag helpers ───

const DRAG_RECTS_CACHE_TTL = 200; // ms — invalida pra absorver scroll durante drag

function cacheDragRects(container) {
  const items = [...container.querySelectorAll('.queue-item:not([style*="opacity: 0.3"])')];
  _dragRectsCache = items.map((el) => ({ el, rect: el.getBoundingClientRect() }));
  _dragRectsCacheTime = performance.now();
}

function getDragAfterElement(container, y) {
  const now = performance.now();
  if (!_dragRectsCache || now - _dragRectsCacheTime > DRAG_RECTS_CACHE_TTL) {
    cacheDragRects(container);
  }
  return (
    _dragRectsCache.reduce(
      (closest, { el, rect }) => {
        const offset = y - rect.top - rect.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: el };
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element || null
  );
}

// ─── Reorder / Add to queue ───

async function reorderInQueue(movedId, beforeId) {
  const moved = _ctx.vendedores.find((v) => v.id === movedId);
  const setor = moved?.setor || 'loja';
  const inQueue = _ctx.vendedores
    .filter((v) => setoresMatch(v.setor, setor) && v.status === 'disponivel' && v.posicao_fila != null)
    .sort((a, b) => a.posicao_fila - b.posicao_fila);
  const ordered = inQueue.filter((v) => v.id !== movedId);
  const beforeIdx = beforeId ? ordered.findIndex((v) => v.id === beforeId) : ordered.length;
  if (!moved) return;
  ordered.splice(beforeIdx >= 0 ? beforeIdx : ordered.length, 0, moved);

  const ids = ordered.map((v) => v.id);

  _ctx.markLocal();
  ids.forEach((id, i) => {
    const vv = _ctx.vendedores.find((x) => x.id === id);
    if (vv) vv.posicao_fila = i + 1;
  });
  _lastQueueKey = '';
  invalidateFooter();
  scheduleRender();

  const { error } = await _ctx.sb.rpc('reordenar_fila', { p_ids: ids });
  if (error) {
    toast('Erro ao reordenar: ' + error.message, 'error');
    await _ctx.loadVendedores();
  }
}

async function addToQueueAt(vendedorId, beforeId) {
  delete _ctx.saidaMotivos[vendedorId];
  // Fechar pausa aberta ao voltar pra fila (drag-and-drop)
  try {
    await _ctx.sb.rpc('registrar_retorno', { p_vendedor_id: vendedorId });
  } catch (e) {
    console.warn('[registrar_retorno] falhou:', e?.message || e);
  }
  const target = _ctx.vendedores.find((x) => x.id === vendedorId);
  const setor = target?.setor || 'loja';
  const inQueue = _ctx.vendedores
    .filter((v) => setoresMatch(v.setor, setor) && v.status === 'disponivel' && v.posicao_fila != null)
    .sort((a, b) => a.posicao_fila - b.posicao_fila);
  const beforeIdx = beforeId ? inQueue.findIndex((v) => v.id === beforeId) : inQueue.length;
  const insertAt = beforeIdx >= 0 ? beforeIdx : inQueue.length;

  const newOrder = [...inQueue];
  newOrder.splice(insertAt, 0, { id: vendedorId });
  const ids = newOrder.map((v) => v.id);

  _ctx.markLocal();
  if (target) {
    target.status = 'disponivel';
  }
  ids.forEach((id, i) => {
    const vv = _ctx.vendedores.find((x) => x.id === id);
    if (vv) vv.posicao_fila = i + 1;
  });
  invalidateFooter();
  scheduleRender();
  toast((target?.apelido || target?.nome || 'Vendedor') + ' entrou na fila', 'success', TOAST_SHORT);

  const { error } = await _ctx.sb.rpc('reordenar_fila', { p_ids: ids });
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    await _ctx.loadVendedores();
  }
}

// ─── Service panel drop zone (desktop) ───

function initServiceDrop() {
  const sp = document.getElementById('servicePanel');
  if (!sp) return;
  sp.addEventListener('dragover', (e) => {
    e.preventDefault();
    sp.classList.add('drop-active');
  });
  sp.addEventListener('dragleave', () => sp.classList.remove('drop-active'));
  sp.addEventListener('drop', async (e) => {
    e.preventDefault();
    sp.classList.remove('drop-active');
    const id = draggedId;
    draggedId = null;
    if (!id) return;
    await _ctx.withLock(() => _ctx.doSendToAtendimento(id));
  });
}

// ─── Touch drag (ghost card segue o dedo) ───

function onTouchDragStart(e) {
  if (_ctx.tvMode) return;
  const item = e.target.closest('.queue-item') || e.target.closest('.footer-card');
  if (!item || item.closest('#activeList')) return;
  touchDragId = item.dataset.id;
  touchDragEl = item;
  touchDragging = false;

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;

  const itemW = item.offsetWidth;
  const queueList = _ctx.queueList;
  const footer = _ctx.statusFooter;
  let _prevAfter = null;
  let _markedEl = null;
  let _pendingGhostX = 0;
  let _pendingGhostY = 0;
  let _ghostRafPending = false;
  const _clearTouchIndicators = () => {
    if (_markedEl) {
      _markedEl.classList.remove('drag-above', 'drag-below');
      _markedEl = null;
    }
  };

  const _paintGhost = () => {
    _ghostRafPending = false;
    if (!touchGhost) return;
    touchGhost.style.transform = `translate3d(${_pendingGhostX}px,${_pendingGhostY}px,0) scale(1.05)`;
  };

  const onMove = (ev) => {
    ev.preventDefault();
    const t = ev.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (!touchDragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_QUEUE) {
      touchDragging = true;
      item.style.opacity = '0.3';
      queueList.classList.add('dragging');

      document.body.style.overflow = 'hidden';
      _ctx.queuePanel?.style.setProperty('overflow', 'hidden');
      _ctx.servicePanel?.style.setProperty('overflow', 'hidden');
      cacheDragRects(queueList);

      _ghostInitX = t.clientX - itemW / 2;
      _ghostInitY = t.clientY - DRAG_GHOST_Y_OFFSET;

      // Ghost simplificado — só o header do card (nome + avatar), mais leve
      touchGhost = document.createElement('div');
      touchGhost.setAttribute('aria-hidden', 'true');
      const header = item.querySelector('.queue-item-header') || item.querySelector('.footer-card') || item;
      touchGhost.innerHTML = header.outerHTML;
      touchGhost.style.cssText = `
        position:fixed;z-index:${Z_DRAG_GHOST};pointer-events:none;
        opacity:.92;will-change:transform;
        box-shadow:0 6px 20px rgba(0,0,0,.25);
        border:1px solid var(--success);border-radius:var(--radius);
        background:var(--bg-card);
        width:${itemW}px;
        left:0;top:0;
        transform:translate3d(${_ghostInitX}px,${_ghostInitY}px,0) scale(1.05);
      `;
      document.body.appendChild(touchGhost);
    }

    if (touchDragging && touchGhost) {
      _pendingGhostX = t.clientX - itemW / 2;
      _pendingGhostY = t.clientY - DRAG_GHOST_Y_OFFSET;
      if (!_ghostRafPending) {
        _ghostRafPending = true;
        requestAnimationFrame(_paintGhost);
      }

      const now = performance.now();
      if (now - _lastDropCheck < 60) return;
      _lastDropCheck = now;

      const elUnder = document.elementFromPoint(t.clientX, t.clientY);

      if (elUnder && (elUnder.id === 'queueList' || elUnder.closest('#queueList'))) {
        queueList.style.background = 'rgba(167, 139, 250,.05)';
        footer?.classList.remove('drop-highlight');
        hideFooterDropLabel();
        const after = getDragAfterElement(queueList, t.clientY);
        if (after !== _prevAfter) {
          _clearTouchIndicators();
          if (after) {
            after.classList.add('drag-above');
            _markedEl = after;
          }
          _prevAfter = after;
        }
      } else if (elUnder && (elUnder.id === 'statusFooter' || elUnder.closest('#statusFooter'))) {
        footer?.classList.add('drop-highlight');
        showFooterDropLabel();
        queueList.style.background = '';
        _clearTouchIndicators();
        _prevAfter = null;
      } else {
        queueList.style.background = '';
        footer?.classList.remove('drop-highlight');
        hideFooterDropLabel();
        _clearTouchIndicators();
        _prevAfter = null;
      }
    }
  };

  const onEnd = async (ev) => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);

    document.body.style.overflow = '';
    _ctx.queuePanel?.style.setProperty('overflow', '');
    _ctx.servicePanel?.style.setProperty('overflow', '');

    _dragRectsCache = null;
    queueList.classList.remove('dragging');
    _clearTouchIndicators();
    if (touchGhost) {
      touchGhost.remove();
      touchGhost = null;
    }
    if (touchDragEl) {
      touchDragEl.style.opacity = '1';
      const liveEl = queueList.querySelector('[data-id="' + (touchDragId || '') + '"]');
      if (liveEl && liveEl !== touchDragEl) liveEl.style.opacity = '1';
    }
    queueList.style.background = '';
    footer?.classList.remove('drop-highlight');
    hideFooterDropLabel();

    if (!touchDragging) {
      touchDragId = null;
      touchDragEl = null;
      return;
    }

    const touch = ev.changedTouches ? ev.changedTouches[0] : null;

    const _savedDragId = touchDragId;
    touchDragId = null;
    touchDragEl = null;
    touchDragging = false;
    invalidateFooter();
    _lastQueueKey = '';

    if (!touch) {
      scheduleRender();
      return;
    }

    const dropEl = document.elementFromPoint(touch.clientX, touch.clientY);

    if (dropEl && (dropEl.id === 'queueList' || dropEl.closest('#queueList'))) {
      const v = _ctx.vendedores.find((x) => x.id === _savedDragId);
      const isInQueue = v && v.status === 'disponivel' && v.posicao_fila != null;
      const afterEl = getDragAfterElement(queueList, touch.clientY);
      const afterId = afterEl?.dataset.id || null;
      if (isInQueue) {
        await reorderInQueue(_savedDragId, afterId);
      } else {
        await addToQueueAt(_savedDragId, afterId);
      }
    } else if (
      dropEl &&
      (dropEl.id === 'servicePanel' || dropEl.closest('#servicePanel') || dropEl.closest('#activeList'))
    ) {
      await _ctx.withLock(() => _ctx.doSendToAtendimento(_savedDragId));
    } else if (dropEl && (dropEl.id === 'statusFooter' || dropEl.closest('#statusFooter'))) {
      setTimeout(() => _ctx.openSaida(_savedDragId), 50);
    } else {
      scheduleRender();
    }
  };

  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
}

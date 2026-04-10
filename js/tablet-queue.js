// ============================================
// MinhaVez — Queue Rendering & Drag-and-Drop
// renderQueue, drag desktop + touch
// ============================================

import { STATUS_CONFIG, SAIDA_COLORS, formatTime, initials, toast, escapeHtml } from '/js/utils.js';
import { renderFooter, invalidateFooter, showFooterDropLabel, hideFooterDropLabel } from '/js/tablet-footer.js';
import { COLD_SELLER_TIMEOUT, ATTENDANCE_DANGER_SECONDS, DRAG_THRESHOLD_QUEUE, DRAG_GHOST_Y_OFFSET, Z_DRAG_GHOST, TOAST_SHORT } from '/js/constants.js';

let _ctx = null;

// ─── Queue state (module-private) ───
let _lastQueueKey = '';
let draggedId = null;
let _dragDropInitialized = false;
let _itemObserver = null;
let _dragRectsCache = null;
let _dragRectsCacheTime = 0;

// Touch drag state
let touchDragEl = null;
let touchDragId = null;
let touchGhost = null;
let touchStartX = 0, touchStartY = 0;
let touchDragging = false;
let _ghostInitX = 0, _ghostInitY = 0;
let _dragRafId = null;
let _lastDropCheck = 0;

/**
 * Initialize queue module with shared dependencies.
 */
export function initQueue(ctx) {
  _ctx = ctx;

  // Expose to window for HTML onclick handlers
  window.onTouchDragStart = onTouchDragStart;
  window.sendToAtendimento = function(vendedorId) {
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
export function getDraggedId() { return draggedId; }
export function setDraggedId(v) { draggedId = v; }

/** Get touchDragging state */
export function isTouchDragging() { return touchDragging; }

/** Get touchGhost ref for ghost cleanup */
export function getTouchGhost() { return touchGhost; }
export function setTouchGhost(v) { touchGhost = v; }

/** Cleanup observer on page unload */
export function cleanupQueue() {
  if (_itemObserver) _itemObserver.disconnect();
}

/** Reset all drag state (call on visibilitychange) */
export function resetDragState() {
  if (touchGhost) { touchGhost.remove(); touchGhost = null; }
  if (touchDragEl) { touchDragEl.style.opacity = '1'; touchDragEl = null; }
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

export function renderQueue() {
  const list = _ctx.queueList;
  const allVendedores = _ctx.vendedores || [];
  const setorVendedores = allVendedores.filter(v => (v.setor || 'loja') === _ctx.currentSetor);
  const inQueue = setorVendedores.filter(v => v.status === 'disponivel' && v.posicao_fila != null).sort((a, b) => a.posicao_fila - b.posicao_fila);
  const pausa = setorVendedores.filter(v => v.status === 'pausa');

  document.getElementById('queueCount').textContent = inQueue.length + ' na fila';

  // Atualizar cold seller tracking
  const currentIds = new Set(inQueue.map(v => v.id));
  for (const [id] of _ctx.queueEntryTimes) {
    if (!currentIds.has(id)) _ctx.queueEntryTimes.delete(id);
  }
  inQueue.forEach(v => {
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
  const queueKey = (_ctx.currentTurno ? '1' : '0') + '|' + inQueue.map(v => {
    const cold = _ctx.queueEntryTimes.has(v.id) && (Date.now() - _ctx.queueEntryTimes.get(v.id).time > COLD_SELLER_TIMEOUT);
    return v.id + (cold ? ':C' : '');
  }).join(',') + '|' + pausa.map(v => v.id + ':' + (_ctx.saidaMotivos[v.id] || '')).join(',') + '|' + _nowMin;
  if (queueKey === _lastQueueKey) return;
  _lastQueueKey = queueKey;

  if (!_ctx.currentTurno) {
    list.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px"><i class="fa-solid fa-users-slash" style="font-size:24px;margin-bottom:8px;display:block;opacity:.3"></i>Abra o turno para iniciar</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  inQueue.forEach((v, i) => {
    const div = document.createElement('div');
    div.innerHTML = renderQueueItem(v, i + 1, false, true);
    frag.appendChild(div.firstElementChild);
  });
  if (inQueue.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px';
    empty.innerHTML = '<i class="fa-solid fa-arrow-up-from-bracket" style="display:block;font-size:24px;margin-bottom:10px;opacity:.4"></i><strong>Fila vazia</strong><br><span style="font-size:11px;opacity:.6;margin-top:4px;display:inline-block">Arraste vendedores do rodapé ou toque neles para adicionar</span>';
    frag.appendChild(empty);
  }

  if (pausa.length > 0) {
    const header = document.createElement('div');
    header.style.cssText = 'font-size:9px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;padding:10px 8px 4px;border-top:1px solid var(--border-subtle);margin-top:4px';
    header.innerHTML = '<i class="fa-solid fa-pause" style="margin-right:4px"></i>Em pausa';
    frag.appendChild(header);
    pausa.forEach(v => {
      const motivoKey = _ctx.saidaMotivos[v.id];
      const motivoColor = motivoKey ? (SAIDA_COLORS[motivoKey]?.color || STATUS_CONFIG.pausa.color) : STATUS_CONFIG.pausa.color;
      const motivoLabel = motivoKey ? (SAIDA_COLORS[motivoKey]?.label || 'Pausa') : 'Pausa';
      const div = document.createElement('div');
      div.innerHTML = `<div class="queue-item" data-id="${v.id}" data-action="return-pause" draggable="true" style="cursor:grab;opacity:.8;border-left:3px solid ${motivoColor}">
        <div class="queue-position" style="background:${motivoColor}20;color:${motivoColor}"><i class="fa-solid ${STATUS_CONFIG.pausa.icon}" style="font-size:11px"></i></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.apelido || v.nome)}</div>
          <div style="font-size:10px;color:${motivoColor};font-weight:600;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(motivoLabel)}</div>
        </div>
        <i class="fa-solid fa-arrow-rotate-left" style="color:var(--success);font-size:12px;opacity:.6" title="Voltar à fila"></i>
      </div>`;
      frag.appendChild(div.firstElementChild);
    });
  }

  list.innerHTML = '';
  list.appendChild(frag);
  initDragAndDrop();
}

function renderQueueItem(v, pos, isActive, draggable) {
  const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.fora;
  const ini = initials(v.apelido || v.nome);
  const dragAttr = draggable ? 'draggable="true"' : '';
  const dragStyle = draggable ? 'cursor:grab;' : '';
  const posHtml = pos ? `<div class="queue-position" style="background:${cfg.bg};color:${cfg.color}">${pos}</div>` : `<div class="queue-position" style="background:${cfg.bg};color:${cfg.color}"><i class="fa-solid ${cfg.icon}" style="font-size:11px"></i></div>`;

  let timerHtml = '';
  if (v.status === 'em_atendimento') {
    const atend = _ctx.activeAtendimentos.find(a => a.vendedor_id === v.id);
    if (atend && atend.inicio) {
      const startMs = new Date(atend.inicio).getTime();
      const elapsed = isNaN(startMs) ? 0 : (Date.now() - startMs) / 1000;
      const clr = elapsed > ATTENDANCE_DANGER_SECONDS ? 'var(--danger)' : 'var(--text-primary)';
      timerHtml = `<span data-sidebar-timer="${atend.id}" style="font-family:var(--font-mono);font-weight:700;font-size:11px;color:${clr};margin-left:auto;flex-shrink:0">${formatTime(elapsed)}</span>`;
    }
  }

  let actionHtml = '';
  if (draggable && _ctx.currentTurno) {
    actionHtml = `<button data-action="send-atend" data-vid="${v.id}" style="padding:8px 12px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--bg-hover);color:var(--info);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:var(--font-body);transition:all .15s;min-height:44px;min-width:44px;display:flex;align-items:center;justify-content:center" title="Enviar ao atendimento"><i class="fa-solid fa-arrow-right" style="font-size:12px"></i></button>`;
  }

  const isNext = draggable && pos === 1;
  const nextClass = isNext ? ' next-in-line' : '';
  const nextBadge = isNext ? '<span class="next-badge">PRÓXIMO</span>' : '';
  const coldClass = (draggable && _ctx.queueEntryTimes.has(v.id) && (Date.now() - _ctx.queueEntryTimes.get(v.id).time > COLD_SELLER_TIMEOUT)) ? ' cold-seller' : '';

  const atendCount = _ctx.vendorAtendCount[v.id] || 0;
  const countBadge = atendCount > 0 ? `<span class="atend-count-badge" title="${atendCount} atendimento${atendCount > 1 ? 's' : ''} no turno">${atendCount}</span>` : '';

  return `<div class="queue-item ${v.status}${isActive ? ' active' : ''}${nextClass}${coldClass}" data-id="${v.id}" ${dragAttr} style="${dragStyle};position:relative">
    ${nextBadge}
    ${draggable ? '<i class="fa-solid fa-grip-vertical" style="color:var(--text-muted);font-size:10px;opacity:.4;margin-right:2px"></i>' : ''}
    ${posHtml}
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.apelido || v.nome)}</span>
        ${countBadge}
      </div>
      <div style="font-size:10px;color:${cfg.color};font-weight:600;text-transform:uppercase;letter-spacing:.05em">${cfg.short}</div>
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

  dropzone.addEventListener('click', e => {
    const actionBtn = e.target.closest('[data-action="send-atend"]');
    if (actionBtn) { e.stopPropagation(); window.sendToAtendimento(actionBtn.dataset.vid); return; }
    const pauseItem = e.target.closest('[data-action="return-pause"]');
    if (pauseItem) { _ctx.returnFromPause(pauseItem.dataset.id); return; }
  });
  dropzone.addEventListener('dragstart', e => {
    const item = e.target.closest('.queue-item');
    if (!item) return;
    draggedId = item.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
  });
  dropzone.addEventListener('dragend', () => { draggedId = null; });
  dropzone.addEventListener('touchstart', e => {
    const item = e.target.closest('.queue-item');
    if (item) onTouchDragStart(e);
  }, { passive: true });

  let _cachedQueueItems = null;
  const getCachedItems = () => _cachedQueueItems || (_cachedQueueItems = [...dropzone.querySelectorAll('.queue-item')]);
  const clearDragIndicators = () => { getCachedItems().forEach(el => el.classList.remove('drag-above', 'drag-below')); };
  if (_itemObserver) _itemObserver.disconnect();
  _itemObserver = new MutationObserver(() => { _cachedQueueItems = null; });
  _itemObserver.observe(dropzone, { childList: true });

  let _prevDragAfter = null;
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('dragging');
    dropzone.style.background = 'rgba(34,197,94,.05)';
    const after = getDragAfterElement(dropzone, e.clientY);
    if (after !== _prevDragAfter) {
      clearDragIndicators();
      if (after) after.classList.add('drag-above');
      else { const items = getCachedItems(); if (items.length > 0) items[items.length-1].classList.add('drag-below'); }
      _prevDragAfter = after;
    }
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragging');
    dropzone.style.background = '';
    clearDragIndicators();
    _prevDragAfter = null;
  });
  dropzone.addEventListener('drop', async e => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
    dropzone.style.background = '';
    clearDragIndicators();
    _prevDragAfter = null;
    if (!draggedId) return;

    const v = _ctx.vendedores.find(x => x.id === draggedId);
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

function cacheDragRects(container) {
  const items = [...container.querySelectorAll('.queue-item:not([style*="opacity: 0.3"])')];
  _dragRectsCache = items.map(el => ({ el, rect: el.getBoundingClientRect() }));
  _dragRectsCacheTime = performance.now();
}

function getDragAfterElement(container, y) {
  if (!_dragRectsCache) cacheDragRects(container);
  return _dragRectsCache.reduce((closest, { el, rect }) => {
    const offset = y - rect.top - rect.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: el };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element || null;
}

// ─── Reorder / Add to queue ───

async function reorderInQueue(movedId, beforeId) {
  const moved = _ctx.vendedores.find(v => v.id === movedId);
  const setor = moved?.setor || 'loja';
  const inQueue = _ctx.vendedores.filter(v => (v.setor || 'loja') === setor && v.status === 'disponivel' && v.posicao_fila != null).sort((a, b) => a.posicao_fila - b.posicao_fila);
  const ordered = inQueue.filter(v => v.id !== movedId);
  const beforeIdx = beforeId ? ordered.findIndex(v => v.id === beforeId) : ordered.length;
  if (!moved) return;
  ordered.splice(beforeIdx >= 0 ? beforeIdx : ordered.length, 0, moved);

  const ids = ordered.map(v => v.id);

  _ctx.markLocal();
  ids.forEach((id, i) => {
    const vv = _ctx.vendedores.find(x => x.id === id);
    if (vv) vv.posicao_fila = i + 1;
  });
  _lastQueueKey = ''; invalidateFooter();
  scheduleRender();

  const { error } = await _ctx.sb.rpc('reordenar_fila', { p_ids: ids });
  if (error) { toast('Erro ao reordenar: ' + error.message, 'error'); await _ctx.loadVendedores(); }
}

async function addToQueueAt(vendedorId, beforeId) {
  delete _ctx.saidaMotivos[vendedorId];
  // Fechar pausa aberta ao voltar pra fila (drag-and-drop)
  try {
    await _ctx.sb.rpc('registrar_retorno', { p_vendedor_id: vendedorId });
  } catch (e) {
    console.warn('[registrar_retorno] falhou:', e?.message || e);
  }
  const target = _ctx.vendedores.find(x => x.id === vendedorId);
  const setor = target?.setor || 'loja';
  const inQueue = _ctx.vendedores.filter(v => (v.setor || 'loja') === setor && v.status === 'disponivel' && v.posicao_fila != null).sort((a, b) => a.posicao_fila - b.posicao_fila);
  const beforeIdx = beforeId ? inQueue.findIndex(v => v.id === beforeId) : inQueue.length;
  const insertAt = beforeIdx >= 0 ? beforeIdx : inQueue.length;

  const newOrder = [...inQueue];
  newOrder.splice(insertAt, 0, { id: vendedorId });
  const ids = newOrder.map(v => v.id);

  _ctx.markLocal();
  if (target) { target.status = 'disponivel'; }
  ids.forEach((id, i) => {
    const vv = _ctx.vendedores.find(x => x.id === id);
    if (vv) vv.posicao_fila = i + 1;
  });
  invalidateFooter();
  scheduleRender();
  toast((target?.apelido || target?.nome || 'Vendedor') + ' entrou na fila', 'success', TOAST_SHORT);

  const { error } = await _ctx.sb.rpc('reordenar_fila', { p_ids: ids });
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); await _ctx.loadVendedores(); }
}

// ─── Service panel drop zone (desktop) ───

function initServiceDrop() {
  const sp = document.getElementById('servicePanel');
  if (!sp) return;
  sp.addEventListener('dragover', e => { e.preventDefault(); sp.classList.add('drop-active'); });
  sp.addEventListener('dragleave', () => sp.classList.remove('drop-active'));
  sp.addEventListener('drop', async e => {
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
  const _clearTouchIndicators = () => {
    if (_markedEl) { _markedEl.classList.remove('drag-above', 'drag-below'); _markedEl = null; }
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

      touchGhost = item.cloneNode(true);
      touchGhost.style.cssText = `
        position:fixed;z-index:${Z_DRAG_GHOST};pointer-events:none;
        opacity:.9;will-change:transform;
        box-shadow:0 4px 16px rgba(0,0,0,.3);
        border:1px solid var(--success);border-radius:10px;
        background:var(--bg-card);
        width:${itemW}px;
        left:0;top:0;
        transform:translate3d(${_ghostInitX}px,${_ghostInitY}px,0) scale(1.05);
      `;
      document.body.appendChild(touchGhost);
    }

    if (touchDragging && touchGhost) {
      const gx = t.clientX - itemW / 2;
      const gy = t.clientY - DRAG_GHOST_Y_OFFSET;
      touchGhost.style.transform = `translate3d(${gx}px,${gy}px,0) scale(1.05)`;

      const now = performance.now();
      if (now - _lastDropCheck < 60) return;
      _lastDropCheck = now;

      const elUnder = document.elementFromPoint(t.clientX, t.clientY);

      if (elUnder && (elUnder.id === 'queueList' || elUnder.closest('#queueList'))) {
        queueList.style.background = 'rgba(34,197,94,.05)';
        footer?.classList.remove('drop-highlight'); hideFooterDropLabel();
        const after = getDragAfterElement(queueList, t.clientY);
        if (after !== _prevAfter) {
          _clearTouchIndicators();
          if (after) { after.classList.add('drag-above'); _markedEl = after; }
          _prevAfter = after;
        }
      } else if (elUnder && (elUnder.id === 'statusFooter' || elUnder.closest('#statusFooter'))) {
        footer?.classList.add('drop-highlight'); showFooterDropLabel();
        queueList.style.background = '';
        _clearTouchIndicators(); _prevAfter = null;
      } else {
        queueList.style.background = '';
        footer?.classList.remove('drop-highlight'); hideFooterDropLabel();
        _clearTouchIndicators(); _prevAfter = null;
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
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    if (touchDragEl) {
      touchDragEl.style.opacity = '1';
      const liveEl = queueList.querySelector('[data-id="' + (touchDragId || '') + '"]');
      if (liveEl && liveEl !== touchDragEl) liveEl.style.opacity = '1';
    }
    queueList.style.background = '';
    footer?.classList.remove('drop-highlight'); hideFooterDropLabel();

    if (!touchDragging) {
      touchDragId = null; touchDragEl = null;
      return;
    }

    const touch = ev.changedTouches ? ev.changedTouches[0] : null;

    const _savedDragId = touchDragId;
    touchDragId = null; touchDragEl = null; touchDragging = false;
    invalidateFooter();
    _lastQueueKey = '';

    if (!touch) {
      scheduleRender();
      return;
    }

    const dropEl = document.elementFromPoint(touch.clientX, touch.clientY);

    if (dropEl && (dropEl.id === 'queueList' || dropEl.closest('#queueList'))) {
      const v = _ctx.vendedores.find(x => x.id === _savedDragId);
      const isInQueue = v && v.status === 'disponivel' && v.posicao_fila != null;
      const afterEl = getDragAfterElement(queueList, touch.clientY);
      const afterId = afterEl?.dataset.id || null;
      if (isInQueue) { await reorderInQueue(_savedDragId, afterId); }
      else { await addToQueueAt(_savedDragId, afterId); }
    } else if (dropEl && (dropEl.id === 'servicePanel' || dropEl.closest('#servicePanel') || dropEl.closest('#activeList'))) {
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

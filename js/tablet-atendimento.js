// ============================================
// MinhaVez — Atendimento Module
// Origin channels, send to atendimento, outcome sheet,
// multi-client, troca, venda, motivos, finalize
// ============================================

import { toast, formatTime, initials, escapeHtml } from '/js/utils.js';
import { playSound } from '/js/sound.js';
import { createModal, currencyInputHTML, parseCurrency } from '/js/ui.js';
import { fireVendaCelebration, fireEpicTrocaAnimation } from '/js/tablet-celebrations.js';
import { invalidateQueue, scheduleRender, isTouchDragging, getTouchGhost, setTouchGhost } from '/js/tablet-queue.js';
import { invalidateFooter } from '/js/tablet-footer.js';
import {
  GHOST_CLEANUP_INTERVAL,
  OVERLAY_HIDE_DELAY,
  OUTCOME_OPEN_DELAY,
  INPUT_FOCUS_DELAY,
  ACTION_LOCK_RESET,
  ATTENDANCE_DANGER_SECONDS,
  DRAG_THRESHOLD_ATENDIMENTO,
  DRAG_GHOST_Y_OFFSET,
  Z_DRAG_GHOST,
  TROCA_PREMIUM_VALUE,
  TOAST_SHORT,
  TOAST_MEDIUM
} from '/js/constants.js';

let _ctx = null;

// ─── Module state ───
let _canaisOrigem = [];
let _pendingOriginVendedorId = null;
let _atendDragInit = false;
let _atendDragId = null;
let _atendDragGhost = null;
let _atendTouchDragging = false;
let _atendDragRafId = null;
let _outcomeAtendId = null;
let pendingOutcome = null;
let pendingAtendimentoId = null;
let _multiResults = [];
let _multiAtendId = null;
let _multiTotal = 0;
let _multiCurrent = 0;
let _continuarCallbacks = { onNo: null, onYes: null };
let _timerInterval = null;
let _timerRefs = new Map();
const _savedQueuePositions = new Map();

function _tickAtendTimers() {
  const now = Date.now();
  let allDetached = true;
  _timerRefs.forEach((ref, id) => {
    const elapsed = (now - ref.startMs) / 1000;
    const timeStr = formatTime(elapsed);
    if (timeStr === ref.lastText) {
      if (ref.main || ref.side) allDetached = false;
      return;
    }
    ref.lastText = timeStr;
    const isDanger = elapsed > ATTENDANCE_DANGER_SECONDS;
    if (ref.main && !ref.main.isConnected) ref.main = null;
    if (!ref.main) ref.main = document.getElementById('timer-' + id) || null;
    if (ref.main) {
      ref.main.textContent = timeStr;
      ref.main.className = 'atend-timer' + (isDanger ? ' danger' : '');
      allDetached = false;
    }
    if (ref.side && !ref.side.isConnected) ref.side = null;
    if (!ref.side) ref.side = document.querySelector(`[data-sidebar-timer="${id}"]`) || null;
    if (ref.side) {
      ref.side.textContent = timeStr;
      ref.side.style.color = isDanger ? 'var(--danger)' : 'var(--text-primary)';
      allDetached = false;
    }
  });
  if (allDetached && _timerRefs.size > 0) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
}

function _startAtendTimerLoop() {
  if (_timerInterval) return;
  if (_timerRefs.size === 0) return;
  _tickAtendTimers();
  _timerInterval = setInterval(_tickAtendTimers, 1000);
}

function _stopAtendTimerLoop() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
}

// Pausa o timer quando a aba esconde (economia de bateria/CPU) e retoma
// ao voltar, atualizando imediatamente pra não ficar defasado.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _stopAtendTimerLoop();
  } else if (_timerRefs.size > 0) {
    _startAtendTimerLoop();
  }
});

/**
 * Initialize atendimento module with shared dependencies.
 * @param {object} ctx - Context with state accessors and helpers
 */
export function initAtendimento(ctx) {
  _ctx = ctx;

  // Expose to window for onclick handlers in HTML
  window.confirmOrigin = confirmOrigin;
  window.closeOutcomeSheet = closeOutcomeSheet;
  window.selectOutcome = selectOutcome;
  window.handleProximoCliente = handleProximoCliente;
  window.cancelarAtendimento = cancelarAtendimento;
  window.handleOutcome = handleOutcome;
  window.multiPickOutcome = multiPickOutcome;
  window.multiSubmitVenda = multiSubmitVenda;
  window.multiSubmitTroca = multiSubmitTroca;
  window.showTrocaValor = showTrocaValor;
  window.submitTroca = submitTroca;
  window.submitValorVenda = submitValorVenda;
  window.finalize = finalize;
  window.askContinuar = askContinuar;
  window.showMultiAtend = showMultiAtend;
  window.answerContinuar = answerContinuar;
  window.closeMotivos = closeMotivos;
  window.selectMotivo = selectMotivo;
  window.confirmMotivo = confirmMotivo;

  // Ghost cleanup interval (cleans orphaned drag ghosts)
  setInterval(() => {
    if (!isTouchDragging() && !_atendTouchDragging) {
      const _tg = getTouchGhost();
      if (_tg) {
        _tg.remove();
        setTouchGhost(null);
      }
      if (_atendDragGhost) {
        _atendDragGhost.remove();
        _atendDragGhost = null;
      }
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
        _ctx.queuePanel?.style.setProperty('overflow', '');
        _ctx.servicePanel?.style.setProperty('overflow', '');
      }
    }
  }, GHOST_CLEANUP_INTERVAL);
}

// ─── Carregar canais de origem ───

export async function loadCanaisOrigem() {
  try {
    const { data } = await _ctx.sb
      .from('canais_origem')
      .select('*')
      .eq('tenant_id', _ctx.tenantId)
      .eq('ativo', true)
      .order('ordem');
    _canaisOrigem = data || [];
  } catch (e) {
    console.warn('[canais_origem] erro:', e.message);
    _canaisOrigem = [];
  }
}

// ─── Mostrar modal de canal de origem ───

function showOriginModal(vendedorId) {
  _pendingOriginVendedorId = vendedorId;
  const box = document.querySelector('.origin-box');
  const fixos = _canaisOrigem.filter((c) => c.tipo === 'fixo');
  const eventos = _canaisOrigem.filter((c) => c.tipo === 'evento');

  let content = '<div class="origin-title">Como o cliente chegou?</div>';
  content += '<div class="origin-grid">';
  fixos.forEach((c) => {
    content +=
      '<button class="origin-btn" data-canal-id="' +
      escapeHtml(c.id) +
      '">' +
      '<i class="' +
      escapeHtml(c.icone) +
      '"></i><span>' +
      escapeHtml(c.nome) +
      '</span></button>';
  });
  content += '</div>';

  if (eventos.length > 0) {
    content += '<div class="origin-sep">Eventos ativos</div>';
    content += '<div class="origin-grid">';
    eventos.forEach((c) => {
      content +=
        '<button class="origin-btn" data-canal-id="' +
        escapeHtml(c.id) +
        '">' +
        '<i class="' +
        escapeHtml(c.icone) +
        '"></i><span>' +
        escapeHtml(c.nome) +
        '</span></button>';
    });
    content += '</div>';
  }

  content += '<button class="origin-skip" data-canal-id="">Não informado</button>';
  box.innerHTML = content;

  // Event delegation instead of inline onclick
  box.onclick = (e) => {
    const btn = e.target.closest('[data-canal-id]');
    if (!btn) return;
    const canalId = btn.dataset.canalId || null;
    confirmOrigin(canalId);
  };

  const overlay = document.getElementById('originOverlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('show'));
}

// ─── Confirmar canal de origem e iniciar atendimento ───

async function confirmOrigin(canalId) {
  const overlay = document.getElementById('originOverlay');
  overlay.classList.remove('show');
  setTimeout(() => (overlay.style.display = 'none'), OVERLAY_HIDE_DELAY);

  if (!_pendingOriginVendedorId) return;
  const vendedorId = _pendingOriginVendedorId;
  _pendingOriginVendedorId = null;

  await _ctx.withLock(async () => {
    await _executeAtendimento(vendedorId, canalId);
  });
}

// ─── Enviar vendedor específico ao atendimento (click ou drag) ───

export async function doSendToAtendimento(vendedorId) {
  if (!_ctx.currentTurno) {
    toast('Abra o turno primeiro', 'warning');
    return;
  }
  let v = _ctx.vendedores.find((x) => x.id === vendedorId);
  if (!v) return;
  // Se vendedor está fora/pausa, colocar na fila primeiro
  if (v.status === 'fora' || v.status === 'pausa') {
    await _ctx.addToQueue(vendedorId);
    v = _ctx.vendedores.find((x) => x.id === vendedorId);
    if (!v || v.posicao_fila == null) return;
  }
  if (v.status !== 'disponivel' || v.posicao_fila == null) {
    toast((v.apelido || v.nome) + ' não está na fila (status: ' + v.status + ')', 'warning');
    return;
  }
  // Se há canais configurados, mostrar modal de origem
  if (_canaisOrigem.length > 0) {
    showOriginModal(vendedorId);
    return; // modal cuida do resto via confirmOrigin
  }
  // Sem canais configurados, vai direto
  await _executeAtendimento(vendedorId, null);
}

// ─── Executar atendimento (lógica real após escolha de canal) ───

async function _executeAtendimento(vendedorId, canalOrigemId) {
  if (!_ctx.currentTurno) {
    toast('Abra o turno primeiro', 'warning');
    return;
  }
  let v = _ctx.vendedores.find((x) => x.id === vendedorId);
  if (!v) return;
  // Se vendedor está fora/pausa, colocar na fila primeiro
  if (v.status === 'fora' || v.status === 'pausa') {
    await _ctx.addToQueue(vendedorId);
    v = _ctx.vendedores.find((x) => x.id === vendedorId);
    if (!v || v.posicao_fila == null) return;
  }
  if (v.status !== 'disponivel' || v.posicao_fila == null) {
    toast((v.apelido || v.nome) + ' não está na fila (status: ' + v.status + ')', 'warning');
    return;
  }
  // Se não é o primeiro da fila, é atendimento preferencial
  const setor = v.setor || 'loja';
  const fila = _ctx.vendedores
    .filter((x) => (x.setor || 'loja') === setor && x.status === 'disponivel' && x.posicao_fila != null)
    .sort((a, b) => a.posicao_fila - b.posicao_fila);
  const isPreferencial = fila.length > 0 && fila[0].id !== vendedorId;
  // Salvar posição original para restaurar se cancelar
  _savedQueuePositions.set(vendedorId, v.posicao_fila);
  try {
    _ctx.markLocal();
    const prefLabel = isPreferencial ? ' (preferencial)' : '';
    toast((v.apelido || v.nome) + ' iniciando atendimento' + prefLabel + '...', 'info', TOAST_SHORT);
    const { data, error } = await _ctx.sb.rpc('iniciar_atendimento_vendedor', {
      p_turno_id: _ctx.currentTurno.id,
      p_vendedor_id: vendedorId,
      p_preferencial: isPreferencial
    });
    if (error) throw error;
    // Se canal de origem foi selecionado, gravar no atendimento
    if (canalOrigemId && data) {
      await _ctx.sb.from('atendimentos').update({ canal_origem_id: canalOrigemId }).eq('id', data);
    }
    const { data: atend } = await _ctx.sb
      .from('atendimentos')
      .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
      .eq('id', data)
      .single();
    _ctx.activeAtendimentos.push(atend);
    renderActiveAtendimentos();
    await _ctx.loadVendedores();
    playSound('atendimento');
    if (navigator.vibrate) navigator.vibrate(200);
    _ctx.logPosition(v, 'atendimento', isPreferencial ? 'Preferencial' : 'Da vez');
    toast((v.apelido || v.nome) + ' em atendimento' + prefLabel, 'success', TOAST_MEDIUM);
  } catch (err) {
    toast('Erro: ' + (err.message || 'falha ao iniciar'), 'error');
    await _ctx.loadVendedores();
  }
}

// ─── Atendimento card drag → Outcome Sheet ───

function initAtendDrag() {
  const activeList = document.getElementById('activeList');
  if (!activeList || _atendDragInit) return;
  _atendDragInit = true;

  activeList.addEventListener(
    'touchstart',
    (e) => {
      if (_ctx.tvMode) return;
      const card = e.target.closest('.atend-card');
      if (!card) return;
      const atendId = card.dataset.atendId;
      if (!atendId) return;

      _atendDragId = atendId;
      _atendTouchDragging = false;
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const cardW = card.offsetWidth;

      const onMove = (ev) => {
        if (_atendTouchDragging) ev.preventDefault();
        const t = ev.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (!_atendTouchDragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_ATENDIMENTO) {
          _atendTouchDragging = true;
          card.style.opacity = '0.3';
          document.body.style.overflow = 'hidden';

          _atendDragGhost = card.cloneNode(true);
          _atendDragGhost.style.cssText = `
          position:fixed;z-index:${Z_DRAG_GHOST};pointer-events:none;
          opacity:.9;will-change:transform;
          box-shadow:0 4px 16px rgba(0,0,0,.3);
          border:1px solid var(--info);border-radius:10px;
          background:var(--bg-card);
          width:${cardW}px;
          left:0;top:0;
          transform:translate3d(${t.clientX - cardW / 2}px,${t.clientY - DRAG_GHOST_Y_OFFSET}px,0) scale(1.05);
        `;
          document.body.appendChild(_atendDragGhost);
        }

        if (_atendTouchDragging && _atendDragGhost) {
          if (_atendDragRafId) cancelAnimationFrame(_atendDragRafId);
          const gx = t.clientX - cardW / 2,
            gy = t.clientY - DRAG_GHOST_Y_OFFSET;
          _atendDragRafId = requestAnimationFrame(() => {
            if (_atendDragGhost) _atendDragGhost.style.transform = `translate3d(${gx}px,${gy}px,0) scale(1.05)`;
          });

          const elUnder = document.elementFromPoint(t.clientX, t.clientY);
          const queueList = _ctx.queueList;
          const overQueue =
            elUnder &&
            (elUnder.id === 'queueList' ||
              elUnder.closest('#queueList') ||
              elUnder.id === 'queuePanel' ||
              elUnder.closest('#queuePanel'));
          if (overQueue) {
            queueList.style.background = 'rgba(96,165,250,.06)';
          } else {
            queueList.style.background = '';
          }
        }
      };

      const onEnd = (ev) => {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.body.style.overflow = '';
        if (_atendDragRafId) {
          cancelAnimationFrame(_atendDragRafId);
          _atendDragRafId = null;
        }
        if (_atendDragGhost) {
          _atendDragGhost.remove();
          _atendDragGhost = null;
        }
        card.style.opacity = '1';
        _ctx.queueList.style.background = '';

        if (!_atendTouchDragging) {
          // Tap — open outcome sheet directly
          _atendDragId = null;
          openOutcomeSheet(atendId);
          return;
        }

        const touch2 = ev.changedTouches[0];
        const dropEl = document.elementFromPoint(touch2.clientX, touch2.clientY);
        const droppedOnQueue =
          dropEl &&
          (dropEl.id === 'queueList' ||
            dropEl.closest('#queueList') ||
            dropEl.id === 'queuePanel' ||
            dropEl.closest('#queuePanel'));

        if (droppedOnQueue) {
          setTimeout(() => openOutcomeSheet(atendId), OUTCOME_OPEN_DELAY);
        }
        // If not dropped on queue, snap back (do nothing)

        _atendDragId = null;
        _atendTouchDragging = false;
      };

      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    },
    { passive: true }
  );
}

// ─── Outcome Sheet logic ───

function openOutcomeSheet(atendId) {
  _outcomeAtendId = atendId;
  const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
  const nome = atend?.vendedores?.apelido || atend?.vendedores?.nome || 'Vendedor';
  document.getElementById('outcomeVendorName').textContent = nome;
  document.getElementById('outcomeOverlay').classList.add('open');
  document.getElementById('outcomeSheet').classList.add('open');
}

function closeOutcomeSheet() {
  document.getElementById('outcomeOverlay').classList.remove('open');
  document.getElementById('outcomeSheet').classList.remove('open');
  _outcomeAtendId = null;
}

function selectOutcome(resultado) {
  const atendId = _outcomeAtendId;
  closeOutcomeSheet();
  if (!atendId) return;
  if (resultado === 'cancelar') {
    cancelarAtendimento(atendId);
  } else {
    handleOutcome(resultado, atendId);
  }
}

// ─── Próximo cliente ───

async function handleProximoCliente() {
  if (!_ctx.currentTurno) return;
  try {
    const { data, error } = await _ctx.sb.rpc('proximo_cliente', {
      p_turno_id: _ctx.currentTurno.id,
      p_setor: _ctx.currentSetor
    });
    if (error) throw error;
    const { data: atend } = await _ctx.sb
      .from('atendimentos')
      .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
      .eq('id', data)
      .single();
    _ctx.activeAtendimentos.push(atend);
    renderActiveAtendimentos();
    await _ctx.loadVendedores();
  } catch (e) {
    toast(e.message || 'Nenhum vendedor disponível', 'warning');
  }
}

// ─── Render active atendimentos ───

export function renderActiveAtendimentos() {
  clearInterval(_timerInterval);
  _timerInterval = null;
  const list = document.getElementById('activeList');
  if (!list) return;

  const atendimentos = _ctx.activeAtendimentos;

  // Preservar activeLabel (é filho de activeList, não pode ser destruído pelo replaceChildren)
  let label = document.getElementById('activeLabel');
  list.replaceChildren(); // limpa todos os filhos de uma vez
  // Recriar activeLabel se foi destruído pelo replaceChildren
  if (!label || !label.isConnected) {
    label = document.createElement('p');
    label.id = 'activeLabel';
    label.style.cssText =
      'font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;display:none';
  }
  list.appendChild(label); // sempre reinserir no topo

  const countEl = document.getElementById('activeCount');
  if (countEl) countEl.textContent = atendimentos.length + ' ativo' + (atendimentos.length !== 1 ? 's' : '');

  if (atendimentos.length === 0) {
    label.style.display = 'none';
    const empty = document.createElement('div');
    empty.className = 'service-empty';
    empty.innerHTML =
      '<i class="fa-solid fa-arrow-left" style="font-size:24px;margin-bottom:8px;opacity:.3"></i>Arraste vendedores da fila para iniciar atendimento';
    list.appendChild(empty);
    return;
  }
  label.style.display = 'block';

  atendimentos.forEach((atend) => {
    const v = atend.vendedores;
    if (!v) return;
    const nome = v.apelido || v.nome;
    const card = document.createElement('div');
    card.className = 'atend-card';
    card.id = 'atend-' + atend.id;
    const prefBadge = atend.preferencial
      ? '<span style="display:inline-block;background:var(--warning);color:#060606;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:6px;text-transform:uppercase;letter-spacing:.04em;vertical-align:middle">PREF</span>'
      : '';
    const clientBadge =
      atend._clientCount && atend._clientCount > 1
        ? `<span style="display:inline-block;background:var(--info);color:#fff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:6px;text-transform:uppercase;letter-spacing:.04em;vertical-align:middle">${atend._clientCount} clientes</span>`
        : '';
    const canal = atend.canais_origem;
    const canalHtml =
      canal && canal.icone
        ? `<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:auto;padding:4px 8px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border-subtle)" title="${escapeHtml(canal.nome || 'Canal')}"><i class="${escapeHtml(canal.icone)}" style="font-size:14px;color:var(--accent)"></i><span style="font-size:10px;font-weight:600;color:var(--text-muted);max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(canal.nome)}</span></div>`
        : '';
    card.dataset.atendId = atend.id;
    card.innerHTML = `
      <div class="atend-avatar">${initials(nome)}</div>
      <div class="atend-info">
        <div class="atend-name">${escapeHtml(nome)}${prefBadge}${clientBadge}</div>
        <div class="atend-timer" id="timer-${atend.id}">${formatTime((Date.now() - new Date(atend.inicio).getTime()) / 1000)}</div>
      </div>
      ${canalHtml}
      <i class="fa-solid fa-grip-vertical" style="color:var(--text-muted);font-size:14px;opacity:.3;flex-shrink:0;${canalHtml ? 'margin-left:8px' : 'margin-left:auto'}"></i>`;
    list.appendChild(card);
  });

  // Timer global para todos os atendimentos (painel + sidebar)
  _stopAtendTimerLoop();
  _timerRefs = new Map();
  atendimentos.forEach((atend) => {
    _timerRefs.set(atend.id, {
      main: document.getElementById('timer-' + atend.id),
      side: document.querySelector(`[data-sidebar-timer="${atend.id}"]`),
      startMs: new Date(atend.inicio).getTime(),
      lastText: ''
    });
  });
  if (!document.hidden) _startAtendTimerLoop();

  initAtendDrag();
}

// ─── Remove atendimento ───

function removeAtendimento(atendId) {
  _ctx.activeAtendimentos = _ctx.activeAtendimentos.filter((a) => a.id !== atendId);
  const card = document.getElementById('atend-' + atendId);
  if (card) card.remove();
  if (_ctx.activeAtendimentos.length === 0) {
    clearInterval(_timerInterval);
    _timerInterval = null;
    const label = document.getElementById('activeLabel');
    if (label) label.style.display = 'none';
  }
}

// ─── Cancelar atendimento (voltar vendedor à posição original) ───

async function cancelarAtendimento(atendId) {
  if (_ctx.actionLock) return;
  _ctx.actionLock = true;
  try {
    const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
    if (!atend) {
      toast('Atendimento não encontrado', 'warning');
      return;
    }
    const vendedorId = atend.vendedor_id;
    const v = _ctx.vendedores.find((x) => x.id === vendedorId);
    if (!v) {
      toast('Vendedor não encontrado', 'warning');
      return;
    }

    // Deletar atendimento (foi engano, não conta)
    _ctx.markLocal();
    await _ctx.sb.from('atendimentos').delete().eq('id', atendId);

    // Devolver vendedor à posição original (ou 1º se não tiver salva)
    const setor = v.setor || 'loja';
    const savedPos = _savedQueuePositions.get(vendedorId) || 1;
    _savedQueuePositions.delete(vendedorId);
    const inQueue = _ctx.vendedores
      .filter((x) => (x.setor || 'loja') === setor && x.status === 'disponivel' && x.posicao_fila != null)
      .sort((a, b) => a.posicao_fila - b.posicao_fila);

    // Inserir na posição salva (ajustada ao tamanho atual da fila)
    const insertIdx = Math.min(savedPos - 1, inQueue.length);
    const before = inQueue.slice(0, insertIdx).map((x) => x.id);
    const after = inQueue.slice(insertIdx).map((x) => x.id);
    const newOrder = [...before, vendedorId, ...after];

    // Optimistic: update local state
    v.status = 'disponivel';
    v.posicao_fila = insertIdx + 1;
    after.forEach((id, i) => {
      const x = _ctx.vendedores.find((vx) => vx.id === id);
      if (x) x.posicao_fila = insertIdx + 2 + i;
    });

    removeAtendimento(atendId);
    invalidateQueue();
    invalidateFooter();
    scheduleRender();

    // Persist: set status + posição first, then reorder
    const { error: errUp } = await _ctx.sb
      .from('vendedores')
      .update({ status: 'disponivel', posicao_fila: insertIdx + 1 })
      .eq('id', vendedorId)
      .eq('tenant_id', _ctx.tenantId);
    if (errUp) {
      toast('Erro ao atualizar vendedor: ' + errUp.message, 'error');
    }
    const { error: errReo } = await _ctx.sb.rpc('reordenar_fila', { p_ids: newOrder });
    if (errReo) {
      toast('Erro ao reordenar: ' + errReo.message, 'error');
    }
    await _ctx.loadVendedores();
    _ctx.logPosition(v, 'cancelar', 'Voltou para #' + (insertIdx + 1));
    toast('Atendimento cancelado — vendedor voltou à posição #' + (insertIdx + 1), 'info');
  } catch (e) {
    toast('Erro ao cancelar: ' + e.message, 'error');
  } finally {
    _ctx.actionLock = false;
  }
}

// ─── Outcomes ───

function handleOutcome(resultado, atendId) {
  if (_ctx.actionLock) return;
  const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
  // Multi-client: abrir popup de resultado para cada cliente
  if (atend && atend._clientCount && atend._clientCount > 1) {
    openMultiOutcome(atendId, atend._clientCount);
    return;
  }
  pendingAtendimentoId = atendId;
  if (resultado === 'nao_convertido') {
    openMotivos();
    return;
  }
  if (resultado === 'venda') {
    openValorVenda(atendId);
    return;
  }
  if (resultado === 'troca') {
    openTrocaDiferenca(atendId);
    return;
  }
  finalize(resultado, null, null, null, atendId);
}

// ─── Multi-client outcome popup ───

function openMultiOutcome(atendId, total) {
  _multiAtendId = atendId;
  _multiTotal = total;
  _multiCurrent = 0;
  _multiResults = [];
  showMultiStep();
}

function showMultiStep() {
  document.getElementById('multiOutcomeOverlay')?.remove();
  _multiCurrent++;
  if (_multiCurrent > _multiTotal) {
    finalizeMultiOutcome();
    return;
  }
  createModal(
    'multiOutcomeOverlay',
    `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px">
      <span style="background:var(--info);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px">${_multiCurrent} de ${_multiTotal}</span>
    </div>
    <h3 style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-bottom:6px">Cliente ${_multiCurrent}</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Qual foi o resultado?</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <button onclick="multiPickOutcome('venda')" class="motivo-option" style="min-height:48px">
        <i class="fa-solid fa-check" style="color:var(--success);font-size:18px"></i><span style="font-weight:600;font-size:15px">Venda</span>
      </button>
      <button onclick="multiPickOutcome('nao_convertido')" class="motivo-option" style="min-height:48px">
        <i class="fa-solid fa-xmark" style="color:var(--danger);font-size:18px"></i><span style="font-weight:600;font-size:15px">Não converteu</span>
      </button>
      <button onclick="multiPickOutcome('troca')" class="motivo-option" style="min-height:48px">
        <i class="fa-solid fa-rotate" style="color:var(--warning);font-size:18px"></i><span style="font-weight:600;font-size:15px">Troca</span>
      </button>
    </div>
    <div id="multiDetailBox" style="display:none"></div>
  `,
    { zIndex: 1002, maxWidth: '400px' }
  );
}

function multiPickOutcome(resultado) {
  if (resultado === 'venda') {
    const box = document.getElementById('multiDetailBox');
    box.style.display = '';
    box.innerHTML = `
      <div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:4px">
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Valor da venda (opcional)</p>
        ${currencyInputHTML('multiValorInput')}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="multiSubmitVenda(true)" class="btn btn-ghost" style="flex:1;min-height:40px;font-size:12px">Pular</button>
          <button onclick="multiSubmitVenda(false)" class="btn btn-success" style="flex:1;min-height:40px;font-size:12px"><i class="fa-solid fa-check" style="margin-right:4px"></i>OK</button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('multiValorInput')?.focus(), INPUT_FOCUS_DELAY);
  } else if (resultado === 'nao_convertido') {
    _multiResults.push({ resultado: 'nao_convertido' });
    showMultiStep();
  } else if (resultado === 'troca') {
    const box = document.getElementById('multiDetailBox');
    box.style.display = '';
    box.innerHTML = `
      <div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:4px">
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Diferença de valor (opcional)</p>
        ${currencyInputHTML('multiTrocaInput')}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="multiSubmitTroca(true)" class="btn btn-ghost" style="flex:1;min-height:40px;font-size:12px">Sem diferença</button>
          <button onclick="multiSubmitTroca(false)" class="btn btn-warning" style="flex:1;min-height:40px;font-size:12px"><i class="fa-solid fa-check" style="margin-right:4px"></i>OK</button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('multiTrocaInput')?.focus(), INPUT_FOCUS_DELAY);
  }
}

function multiSubmitVenda(skip) {
  const valor = skip ? null : parseCurrency(document.getElementById('multiValorInput')?.value);
  _multiResults.push({ resultado: 'venda', valor });
  showMultiStep();
}

function multiSubmitTroca(skip) {
  const valor = skip ? null : parseCurrency(document.getElementById('multiTrocaInput')?.value);
  _multiResults.push({ resultado: 'troca', valor });
  showMultiStep();
}

async function finalizeMultiOutcome() {
  document.getElementById('multiOutcomeOverlay')?.remove();
  const atendId = _multiAtendId;
  const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
  const vendedorId = atend?.vendedor_id;
  if (vendedorId) _savedQueuePositions.delete(vendedorId);
  if (!atendId || _multiResults.length === 0) return;

  _ctx.markLocal();
  let vendaCount = 0,
    trocaCount = 0,
    naoCount = 0;
  try {
    // Primeiro resultado: finalizar o atendimento original
    const first = _multiResults[0];
    await _ctx.sb.rpc('finalizar_atendimento', {
      p_atendimento_id: atendId,
      p_resultado: first.resultado,
      p_motivo: first.motivo || null,
      p_motivo_detalhe: first.detalhe || null,
      p_produto_ruptura: first.produto || null,
      p_valor_venda: first.valor ?? null
    });
    if (first.resultado === 'venda') vendaCount++;
    else if (first.resultado === 'troca') trocaCount++;
    else naoCount++;

    // Demais resultados: criar e finalizar atendimentos adicionais
    for (let i = 1; i < _multiResults.length; i++) {
      const r = _multiResults[i];
      const { data: novoId } = await _ctx.sb
        .from('atendimentos')
        .insert({
          turno_id: _ctx.currentTurno.id,
          vendedor_id: vendedorId,
          inicio: atend.inicio,
          tenant_id: _ctx.tenantId
        })
        .select('id')
        .single();
      if (novoId) {
        await _ctx.sb.rpc('finalizar_atendimento', {
          p_atendimento_id: novoId.id,
          p_resultado: r.resultado,
          p_motivo: r.motivo || null,
          p_motivo_detalhe: r.detalhe || null,
          p_produto_ruptura: r.produto || null,
          p_valor_venda: r.valor ?? null
        });
      }
      if (r.resultado === 'venda') vendaCount++;
      else if (r.resultado === 'troca') trocaCount++;
      else naoCount++;
    }

    removeAtendimento(atendId);
    pendingAtendimentoId = null;

    // Resumo
    const parts = [];
    if (vendaCount) parts.push(vendaCount + ' venda' + (vendaCount > 1 ? 's' : ''));
    if (trocaCount) parts.push(trocaCount + ' troca' + (trocaCount > 1 ? 's' : ''));
    if (naoCount) parts.push(naoCount + ' não conv.');
    toast(parts.join(', ') || 'Finalizado', vendaCount > 0 ? 'success' : 'warning');

    if (vendaCount > 0) {
      playSound('venda');
      fireVendaCelebration();
    } else if (naoCount > 0) {
      playSound('fail');
    }

    // Perguntar se quer continuar
    askContinuar(
      atendId,
      async () => {
        await _ctx.loadVendedores();
      },
      async () => {
        if (vendedorId && _ctx.currentTurno) {
          await _ctx.sb
            .from('vendedores')
            .update({ status: 'em_atendimento', posicao_fila: null })
            .eq('id', vendedorId)
            .eq('tenant_id', _ctx.tenantId);
          const { data: novoAtend, error: errNovo } = await _ctx.sb
            .from('atendimentos')
            .insert({
              turno_id: _ctx.currentTurno.id,
              vendedor_id: vendedorId,
              inicio: new Date().toISOString(),
              tenant_id: _ctx.tenantId
            })
            .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
            .single();
          if (!errNovo && novoAtend) {
            _ctx.activeAtendimentos.push(novoAtend);
            renderActiveAtendimentos();
            toast('Novo atendimento iniciado', 'info', TOAST_SHORT);
          }
        }
        await _ctx.loadVendedores();
      }
    );
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
    await _ctx.loadVendedores();
  }
}

// ─── Troca com diferença ───

function openTrocaDiferenca(atendId) {
  createModal(
    'trocaOverlay',
    `
    <i class="fa-solid fa-rotate" style="font-size:28px;color:var(--warning);margin-bottom:12px"></i>
    <h3 style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-bottom:6px">Troca</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Houve diferença de valor na troca?</p>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn" style="flex:1;min-height:44px;background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);font-weight:700;cursor:pointer" onclick="submitTroca('${atendId}',false)">
        Sem diferença
      </button>
      <button class="btn" style="flex:1;min-height:44px;background:var(--warning);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer" onclick="showTrocaValor('${atendId}')">
        Com diferença
      </button>
    </div>
    <div id="trocaValorBox" style="display:none">
      ${currencyInputHTML('trocaValorInput')}
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Acima de R$ 1.000 o vendedor volta para o 1º da fila</p>
      <button class="btn" style="width:100%;min-height:44px;background:var(--success);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer" onclick="submitTroca('${atendId}',true)">
        <i class="fa-solid fa-check" style="margin-right:4px"></i>Confirmar
      </button>
    </div>
  `
  );
}

function showTrocaValor(_atendId) {
  document.getElementById('trocaValorBox').style.display = '';
  setTimeout(() => document.getElementById('trocaValorInput')?.focus(), INPUT_FOCUS_DELAY);
}

async function submitTroca(atendId, comDiferenca) {
  let valor = null;
  if (comDiferenca) {
    const input = document.getElementById('trocaValorInput');
    valor = input ? parseCurrency(input.value) || 0 : 0;
  }
  document.getElementById('trocaOverlay')?.remove();

  const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
  if (!atend) {
    toast('Atendimento não encontrado', 'warning');
    return;
  }
  const vendedorId = atend.vendedor_id;

  // Se diferença >= R$1.000, volta pro 1º da fila (sem perguntar continuar)
  if (comDiferenca && valor >= TROCA_PREMIUM_VALUE) {
    await finalize('troca', null, null, null, atendId, valor, false);
    if (vendedorId) {
      const v2 = _ctx.vendedores.find((v) => v.id === vendedorId);
      const setor = v2?.setor || 'loja';
      // Troca >= R$1.000 → vendedor volta pro 1º da fila (premiação)
      const inQueue = _ctx.vendedores
        .filter((v) => (v.setor || 'loja') === setor && v.status === 'disponivel' && v.posicao_fila != null)
        .sort((a, b) => a.posicao_fila - b.posicao_fila);
      const newOrder = [vendedorId, ...inQueue.filter((v) => v.id !== vendedorId).map((v) => v.id)];
      const { error: errReorder } = await _ctx.sb.rpc('reordenar_fila', { p_ids: newOrder });
      if (errReorder) {
        toast('Erro ao reordenar', 'error');
      }
      await _ctx.loadVendedores();
      // EPIC achievement animation!
      fireEpicTrocaAnimation(v2?.apelido || v2?.nome || 'Vendedor', valor);
    }
  } else {
    askContinuar(
      atendId,
      () => finalize('troca', null, null, null, atendId, valor, false),
      () => finalize('troca', null, null, null, atendId, valor, true)
    );
  }
}

// ─── Valor da venda ───

function openValorVenda(atendId) {
  createModal(
    'valorOverlay',
    `
    <i class="fa-solid fa-dollar-sign" style="font-size:28px;color:var(--success);margin-bottom:12px"></i>
    <h3 style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-bottom:6px">Valor da Venda</h3>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Opcional — deixe vazio se não souber</p>
    ${currencyInputHTML('valorVendaInput')}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1;min-height:44px" onclick="document.getElementById('valorOverlay').remove();askContinuar('${atendId}',()=>finalize('venda',null,null,null,'${atendId}',null,false),()=>finalize('venda',null,null,null,'${atendId}',null,true))">
        Pular
      </button>
      <button class="btn" style="flex:1;min-height:44px;background:var(--success);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;cursor:pointer" onclick="submitValorVenda('${atendId}')">
        <i class="fa-solid fa-check" style="margin-right:4px"></i>Confirmar
      </button>
    </div>
  `
  );
  setTimeout(() => document.getElementById('valorVendaInput')?.focus(), INPUT_FOCUS_DELAY);
}

function submitValorVenda(atendId) {
  const input = document.getElementById('valorVendaInput');
  const valor = input ? parseCurrency(input.value) : null;
  document.getElementById('valorOverlay')?.remove();
  askContinuar(
    atendId,
    () => finalize('venda', null, null, null, atendId, valor, false),
    () => finalize('venda', null, null, null, atendId, valor, true)
  );
}

// ─── Popup "Continuar atendendo?" ───

function askContinuar(atendId, onNo, onYes) {
  const atend = _ctx.activeAtendimentos.find((a) => a.id === atendId);
  const vendedorId = atend?.vendedor_id;
  const v = vendedorId ? _ctx.vendedores.find((x) => x.id === vendedorId) : atend?.vendedores || null;
  const nome = v ? v.apelido || v.nome : 'Vendedor';
  _continuarCallbacks = { onNo, onYes, atendId, vendedorId };

  createModal(
    'continuarOverlay',
    `
    <i class="fa-solid fa-rotate-right" style="font-size:28px;color:var(--info);margin-bottom:12px"></i>
    <h3 style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-bottom:6px">${nome}</h3>
    <p style="font-size:14px;color:var(--text-muted);margin-bottom:16px">Continuar atendendo?</p>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-ghost" style="flex:1;min-height:48px;font-size:15px;font-weight:700" onclick="answerContinuar(false)">
        <i class="fa-solid fa-list-ol" style="margin-right:4px"></i>Voltar à fila
      </button>
      <button class="btn btn-success" style="flex:1;min-height:48px;font-size:15px;font-weight:700" onclick="showMultiAtend()">
        <i class="fa-solid fa-arrow-right" style="margin-right:4px"></i>Continuar
      </button>
    </div>
    <div id="multiAtendBox" style="display:none">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;font-weight:600">Quantos atendimentos simultâneos?</p>
      <div style="display:flex;gap:6px;justify-content:center">
        ${[1, 2, 3, 4].map((n) => `<button onclick="answerContinuar(true,${n})" style="width:48px;height:48px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:var(--bg-elevated);color:var(--text-primary);font-family:var(--font-mono);font-size:18px;font-weight:800;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center" onmouseenter="this.style.background='var(--success)';this.style.color='#fff';this.style.transform='scale(1.1)';this.style.borderColor='var(--success)'" onmouseleave="this.style.background='var(--bg-elevated)';this.style.color='var(--text-primary)';this.style.transform='';this.style.borderColor='var(--border-subtle)'">${n}</button>`).join('')}
      </div>
    </div>
  `,
    { zIndex: 1001, maxWidth: '380px', onClose: () => answerContinuar(false) }
  );
}

function showMultiAtend() {
  const box = document.getElementById('multiAtendBox');
  if (box) {
    box.style.display = '';
    box.style.animation = 'slideUp .2s ease both';
  }
}

async function answerContinuar(continuar, count) {
  document.getElementById('continuarOverlay')?.remove();
  if (!continuar) {
    const cb = _continuarCallbacks.onNo;
    _continuarCallbacks = { onNo: null, onYes: null };
    if (cb) cb();
    return;
  }
  // Criar múltiplos atendimentos
  const vendedorId = _continuarCallbacks.vendedorId;
  const onYes = _continuarCallbacks.onYes;
  _continuarCallbacks = { onNo: null, onYes: null };
  if (onYes) await onYes();

  // Se count > 1, marcar o atendimento existente com a quantidade de clientes
  if (count && count > 1 && vendedorId) {
    const atend = _ctx.activeAtendimentos.find((a) => a.vendedor_id === vendedorId);
    if (atend) {
      atend._clientCount = count;
      renderActiveAtendimentos();
      toast(count + ' clientes simultâneos', 'info', TOAST_SHORT);
    }
  }
}

// ─── Finalize atendimento ───

async function finalize(resultado, motivo, detalhe, produto, atendId, valor, continuar) {
  const id = atendId || pendingAtendimentoId;
  if (!id || _ctx.actionLock) return;
  _ctx.actionLock = true;
  _ctx.markLocal();
  try {
    // Guardar info do vendedor antes de finalizar
    const atendInfo = _ctx.activeAtendimentos.find((a) => a.id === id);
    const vendedorId = atendInfo?.vendedor_id;
    if (vendedorId) _savedQueuePositions.delete(vendedorId);

    const { error } = await _ctx.sb.rpc('finalizar_atendimento', {
      p_atendimento_id: id,
      p_resultado: resultado,
      p_motivo: motivo || null,
      p_motivo_detalhe: detalhe || null,
      p_produto_ruptura: produto || null,
      p_valor_venda: valor ?? null
    });
    if (error) throw error;
    const msg =
      resultado === 'venda'
        ? 'Venda registrada!'
        : resultado === 'troca'
          ? 'Troca registrada.'
          : 'Não conversão registrada.';
    const type = resultado === 'venda' ? 'success' : 'warning';
    toast(msg, type);
    if (resultado === 'venda') {
      playSound('venda');
      fireVendaCelebration();
    } else if (resultado === 'nao_convertido') {
      playSound('fail');
    }
    const fv = vendedorId ? _ctx.vendedores.find((x) => x.id === vendedorId) : null;
    _ctx.logPosition(fv || atendInfo?.vendedores, 'finalizar', resultado + (valor ? ' R$' + valor : ''));
    removeAtendimento(id);
    pendingAtendimentoId = null;

    if (continuar && vendedorId && _ctx.currentTurno) {
      // Criar novo atendimento imediato para o mesmo vendedor
      await _ctx.sb
        .from('vendedores')
        .update({ status: 'em_atendimento', posicao_fila: null })
        .eq('id', vendedorId)
        .eq('tenant_id', _ctx.tenantId);
      const { data: novoAtend, error: errNovo } = await _ctx.sb
        .from('atendimentos')
        .insert({
          turno_id: _ctx.currentTurno.id,
          vendedor_id: vendedorId,
          inicio: new Date().toISOString(),
          tenant_id: _ctx.tenantId
        })
        .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
        .single();
      if (!errNovo && novoAtend) {
        _ctx.activeAtendimentos.push(novoAtend);
        renderActiveAtendimentos();
        toast('Novo atendimento iniciado', 'info', TOAST_SHORT);
      }
    }

    await _ctx.loadVendedores();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    setTimeout(() => {
      _ctx.actionLock = false;
    }, ACTION_LOCK_RESET);
  }
}

// ─── Motivos bottom sheet ───

function openMotivos() {
  document.getElementById('motivoOverlay').classList.add('open');
  document.getElementById('motivoSheet').classList.add('open');
  document
    .getElementById('motivoList')
    ?.querySelectorAll('.motivo-option')
    .forEach((o) => o.classList.remove('selected'));
  document.getElementById('rupturaField').style.display = 'none';
  document.getElementById('outroField').style.display = 'none';
  document.getElementById('btnConfirmMotivo').disabled = true;
  pendingOutcome = null;
}

function closeMotivos() {
  document.getElementById('motivoOverlay').classList.remove('open');
  document.getElementById('motivoSheet').classList.remove('open');
}

function selectMotivo(el) {
  document
    .getElementById('motivoList')
    ?.querySelectorAll('.motivo-option')
    .forEach((o) => o.classList.remove('selected'));
  el.classList.add('selected');
  pendingOutcome = el.dataset.motivo;
  document.getElementById('rupturaField').style.display = pendingOutcome === 'ruptura' ? 'block' : 'none';
  document.getElementById('outroField').style.display = pendingOutcome === 'outro' ? 'block' : 'none';
  document.getElementById('btnConfirmMotivo').disabled = false;
  if (pendingOutcome === 'ruptura') document.getElementById('rupturaInput').focus();
  if (pendingOutcome === 'outro') document.getElementById('outroInput').focus();
}

function confirmMotivo() {
  if (!pendingOutcome || !pendingAtendimentoId) return;
  const produto = pendingOutcome === 'ruptura' ? document.getElementById('rupturaInput').value.trim() : null;
  const detalhe = pendingOutcome === 'outro' ? document.getElementById('outroInput').value.trim() : null;
  const atendId = pendingAtendimentoId;
  closeMotivos();
  askContinuar(
    atendId,
    () => finalize('nao_convertido', pendingOutcome, detalhe, produto, atendId, null, false),
    () => finalize('nao_convertido', pendingOutcome, detalhe, produto, atendId, null, true)
  );
}

// ─── Check for active atendimentos ───

export async function checkActiveAtendimentos() {
  if (!_ctx.currentTurno) return;
  const { data } = await _ctx.sb
    .from('atendimentos')
    .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
    .eq('turno_id', _ctx.currentTurno.id)
    .eq('resultado', 'em_andamento')
    .order('inicio');
  _ctx.activeAtendimentos = data || [];
  renderActiveAtendimentos();
}

// ─── Utility exports for main page ───

/** Clear atendimento timers (call on page unload / visibility change) */
export function clearAtendTimers() {
  _stopAtendTimerLoop();
  _timerRefs.clear();
}

/** Check if atend touch drag is in progress */
export function isAtendTouchDragging() {
  return _atendTouchDragging;
}

/** Reset atend drag state (call on visibility change) */
export function resetAtendDragState() {
  _atendTouchDragging = false;
  if (_atendDragGhost) {
    _atendDragGhost.remove();
    _atendDragGhost = null;
  }
  if (_atendDragRafId) {
    cancelAnimationFrame(_atendDragRafId);
    _atendDragRafId = null;
  }
  _atendDragId = null;
}

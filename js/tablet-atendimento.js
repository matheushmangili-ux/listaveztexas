// ============================================
// MinhaVez — Atendimento Module
// Origin channels, send to atendimento, outcome sheet,
// multi-client, troca, venda, motivos, finalize
// ============================================

import { toast, formatTime, initials, escapeHtml, setoresMatch } from '/js/utils.js';
import { playSound } from '/js/sound.js';
import { createModal, currencyInputHTML, parseCurrency } from '/js/ui.js';
import {
  loadCatalog as loadRupturaCatalog,
  hasCatalog as hasRupturaCatalog,
  mountPicker as mountRupturaPicker,
  getSelection as getRupturaSelection,
  selectionToText as rupturaSelectionToText,
  resetSelection as resetRupturaSelection
} from '/js/tablet-ruptura.js';
import { fireVendaCelebration, fireEpicTrocaAnimation, animateValueToHeader } from '/js/tablet-celebrations.js';
import { animateFichaToAtendimento } from '/js/tablet-queue.js';
import { invalidateQueue, scheduleRender, isTouchDragging, getTouchGhost, setTouchGhost } from '/js/tablet-queue.js';
import { invalidateFooter } from '/js/tablet-footer.js';
import {
  GHOST_CLEANUP_INTERVAL,
  OVERLAY_HIDE_DELAY,
  OUTCOME_OPEN_DELAY,
  INPUT_FOCUS_DELAY,
  ACTION_LOCK_RESET,
  ATTENDANCE_DANGER_SECONDS,
  ATTENDANCE_WARNING_SECONDS,
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
const _timerRefs = new Map();
const _savedQueuePositions = new Map();
// Per-card state para diffing: id -> { key, node }
const _atendCardState = new Map();
let _atendEmptyNode = null;
let _ghostCleanupInterval = null;

function _tickAtendTimers() {
  const now = Date.now();
  let allDetached = true;
  _timerRefs.forEach((ref, id) => {
    const elapsed = (now - ref.startMs) / 1000;
    const timeStr = formatTime(elapsed);
    const isWarning = elapsed > ATTENDANCE_WARNING_SECONDS && elapsed <= ATTENDANCE_DANGER_SECONDS;
    const isDanger = elapsed > ATTENDANCE_DANGER_SECONDS;

    // Skip text update se nada mudou — mas SEMPRE re-aplica classes (defesa)
    if (timeStr === ref.lastText && ref.lastWarning === isWarning && ref.lastDanger === isDanger) {
      if (ref.main || ref.side) allDetached = false;
      return;
    }
    ref.lastText = timeStr;
    ref.lastWarning = isWarning;
    ref.lastDanger = isDanger;

    if (ref.main && !ref.main.isConnected) ref.main = null;
    if (!ref.main) ref.main = document.getElementById('timer-' + id) || null;
    if (ref.main) {
      ref.main.textContent = timeStr;
      ref.main.className = 'atend-timer' + (isDanger ? ' danger' : '');
      // Toggle is-warning/is-danger no card pai (Fase 6 — visual de criticidade)
      const card = ref.main.closest('.atend-card');
      if (card) {
        card.classList.toggle('is-warning', isWarning);
        card.classList.toggle('is-danger', isDanger);
      }
      allDetached = false;
    }
    if (ref.side && !ref.side.isConnected) ref.side = null;
    if (!ref.side) ref.side = document.querySelector(`[data-sidebar-timer="${id}"]`) || null;
    if (ref.side) {
      ref.side.textContent = timeStr;
      ref.side.style.color = isDanger
        ? 'var(--mv-status-error)'
        : isWarning
          ? 'var(--mv-status-paused)'
          : 'var(--mv-text)';
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
  if (_ghostCleanupInterval) clearInterval(_ghostCleanupInterval);
  _ghostCleanupInterval = setInterval(() => {
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
  // Vendedor já em atendimento: oferecer adicionar cliente paralelo.
  // Caso de uso: vendedora atendendo cliente A, cliente B chega, recepcionista
  // toca no card pra marcar V atendendo B em paralelo. Cada cliente vira seu
  // próprio atendimento (linha em atendimentos), finalizável independente.
  if (v.status === 'em_atendimento') {
    const nome = v.apelido || v.nome;
    if (!confirm(`${nome} já está em atendimento. Adicionar mais um cliente em paralelo?`)) return;
    await addParallelAtendimento(vendedorId);
    return;
  }
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
  // GSAP: shared-element flight da ficha pra o painel de atendimento
  animateFichaToAtendimento(vendedorId);
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
    .filter((x) => setoresMatch(x.setor, setor) && x.status === 'disponivel' && x.posicao_fila != null)
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
    try {
      window.minhavezAnalytics?.capture('tablet_atendimento_iniciado', {
        atendimento_id: data,
        vendedor_id: vendedorId,
        preferencial: !!isPreferencial,
        has_canal_origem: !!canalOrigemId
      });
    } catch (_e) {
      /* ignore */
    }
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

// ─── Atendimento paralelo (vendedor já em atendimento ganha mais um cliente) ───
// Bypassa iniciar_atendimento_vendedor (que provavelmente checa em_atendimento
// duplicado e rejeita) — INSERT direto no estilo do fluxo "continuar" do
// finalize. Vendor já é em_atendimento, então não mexe em status nem em fila.

async function addParallelAtendimento(vendedorId) {
  if (_ctx.actionLock) return;
  if (!_ctx.currentTurno) return;
  _ctx.actionLock = true;
  try {
    _ctx.markLocal();
    const v = _ctx.vendedores.find((x) => x.id === vendedorId);
    const nome = v?.apelido || v?.nome || 'Vendedor';
    const { data: novoAtend, error } = await _ctx.sb
      .from('atendimentos')
      .insert({
        turno_id: _ctx.currentTurno.id,
        vendedor_id: vendedorId,
        inicio: new Date().toISOString(),
        tenant_id: _ctx.tenantId
      })
      .select('*, vendedores(nome, apelido), canais_origem(nome, icone)')
      .single();
    if (error) {
      // 23505 = unique_violation: existe índice parcial bloqueando paralelo.
      // Se acontecer, o índice precisa ser revisto na schema (não esperado
      // hoje — sql/ não tem nenhum unique em atendimentos.vendedor_id).
      if (error.code === '23505') {
        toast('Conflito: índice no banco bloqueia atendimento paralelo', 'error');
      } else {
        toast('Erro ao adicionar cliente: ' + error.message, 'error');
      }
      return;
    }
    _ctx.activeAtendimentos.push(novoAtend);
    renderActiveAtendimentos();
    playSound('atendimento');
    if (navigator.vibrate) navigator.vibrate(200);
    _ctx.logPosition(v, 'atendimento', 'Paralelo');
    toast(`${nome}: cliente adicionado em paralelo`, 'success', TOAST_MEDIUM);
    try {
      window.minhavezAnalytics?.capture('tablet_atendimento_paralelo_iniciado', {
        atendimento_id: novoAtend.id,
        vendedor_id: vendedorId
      });
    } catch (_e) {
      /* ignore */
    }
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    setTimeout(() => {
      _ctx.actionLock = false;
    }, ACTION_LOCK_RESET);
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
            queueList.style.background = 'rgba(142, 165, 201,.06)';
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

/** Build per-card data + fingerprint for diffing. */
function buildAtendCardData(atend) {
  const v = atend.vendedores;
  if (!v) return null;
  const nome = v.apelido || v.nome;
  const canal = atend.canais_origem;
  const canalIcone = canal?.icone || '';
  const canalNome = canal?.nome || '';
  const clientCount = atend._clientCount && atend._clientCount > 1 ? atend._clientCount : 0;
  const key = [atend.id, nome, atend.preferencial ? 1 : 0, clientCount, canalIcone, canalNome].join('|');
  return {
    id: atend.id,
    key,
    nome,
    preferencial: !!atend.preferencial,
    clientCount,
    canalIcone,
    canalNome,
    startMs: new Date(atend.inicio).getTime()
  };
}

/** Create a fresh atend-card DOM node. */
function createAtendCardNode(cd) {
  const card = document.createElement('div');
  card.className = 'atend-card';
  card.id = 'atend-' + cd.id;
  card.dataset.atendId = cd.id;

  const avatar = document.createElement('div');
  avatar.className = 'atend-avatar';

  const info = document.createElement('div');
  info.className = 'atend-info';
  const name = document.createElement('div');
  name.className = 'atend-name';
  const timer = document.createElement('div');
  timer.className = 'atend-timer';
  timer.id = 'timer-' + cd.id;
  info.appendChild(name);
  info.appendChild(timer);

  const grip = document.createElement('i');
  grip.className = 'fa-solid fa-grip-vertical atend-grip';

  card.appendChild(avatar);
  card.appendChild(info);
  card.appendChild(grip);

  applyAtendCardData(card, cd);
  return card;
}

/** Update an existing atend-card node with new data (idempotent). */
function applyAtendCardData(card, cd) {
  const avatar = card.querySelector('.atend-avatar');
  const name = card.querySelector('.atend-name');

  // Avatar initials
  const ini = initials(cd.nome);
  if (avatar.textContent !== ini) avatar.textContent = ini;

  // Nome + badges — compact enough que innerHTML é aceitável (escapado)
  let nameHtml = escapeHtml(cd.nome);
  if (cd.preferencial) {
    nameHtml += '<span class="atend-badge atend-badge-pref">PREF</span>';
  }
  if (cd.clientCount) {
    nameHtml += `<span class="atend-badge atend-badge-clients">${cd.clientCount} clientes</span>`;
  }
  if (name.innerHTML !== nameHtml) name.innerHTML = nameHtml;

  // Canal badge (criado/atualizado/removido entre card.info e grip)
  let canalEl = card.querySelector(':scope > .atend-canal');
  if (cd.canalIcone) {
    if (!canalEl) {
      canalEl = document.createElement('div');
      canalEl.className = 'atend-canal';
      const ci = document.createElement('i');
      const cs = document.createElement('span');
      canalEl.appendChild(ci);
      canalEl.appendChild(cs);
      // Insere antes do grip (último filho)
      card.insertBefore(canalEl, card.lastChild);
    }
    canalEl.title = cd.canalNome || 'Canal';
    const ci = canalEl.firstChild;
    const cs = canalEl.lastChild;
    const iconCls = cd.canalIcone;
    if (ci.className !== iconCls) ci.className = iconCls;
    if (cs.textContent !== cd.canalNome) cs.textContent = cd.canalNome;
  } else if (canalEl) {
    canalEl.remove();
  }
}

export function renderActiveAtendimentos() {
  const list = document.getElementById('activeList');
  if (!list) return;

  const atendimentos = _ctx.activeAtendimentos;

  // Mantém activeLabel como primeiro filho
  let label = document.getElementById('activeLabel');
  if (!label || label.parentNode !== list) {
    label = document.createElement('p');
    label.id = 'activeLabel';
    label.className = 'active-label';
    list.insertBefore(label, list.firstChild);
  }

  const countEl = document.getElementById('activeCount');
  if (countEl) {
    const txt = atendimentos.length + ' ativo' + (atendimentos.length !== 1 ? 's' : '');
    if (countEl.textContent !== txt) countEl.textContent = txt;
  }

  // Empty state
  if (atendimentos.length === 0) {
    label.style.display = 'none';
    // Remove todos os cards cacheados
    for (const [, cached] of _atendCardState) {
      if (cached.node.parentNode) cached.node.remove();
    }
    _atendCardState.clear();
    _timerRefs.clear();
    _stopAtendTimerLoop();
    if (!_atendEmptyNode || !_atendEmptyNode.isConnected) {
      _atendEmptyNode = document.createElement('div');
      _atendEmptyNode.className = 'service-empty';
      _atendEmptyNode.innerHTML =
        '<span class="service-empty-icon"><i class="fa-solid fa-arrow-left"></i></span>' +
        '<strong>Nenhum atendimento ativo</strong>' +
        '<span>Arraste o próximo vendedor da fila ou toque na seta do card.</span>';
      list.appendChild(_atendEmptyNode);
    }
    initAtendDrag();
    return;
  }

  // Remove empty state se estava presente
  if (_atendEmptyNode && _atendEmptyNode.parentNode) {
    _atendEmptyNode.remove();
    _atendEmptyNode = null;
  }
  label.style.display = 'block';

  // Diff cards
  const seen = new Set();
  let prev = label;
  for (const atend of atendimentos) {
    const cd = buildAtendCardData(atend);
    if (!cd) continue;
    seen.add(cd.id);
    const cached = _atendCardState.get(cd.id);
    let node;
    if (cached && cached.node.parentNode === list) {
      node = cached.node;
      if (cached.key !== cd.key) {
        applyAtendCardData(node, cd);
        cached.key = cd.key;
      }
    } else {
      node = createAtendCardNode(cd);
      _atendCardState.set(cd.id, { key: cd.key, node });
    }
    if (prev.nextSibling !== node) list.insertBefore(node, prev.nextSibling);
    prev = node;
  }

  // Remove cards órfãos e timerRefs correspondentes
  for (const [id, cached] of _atendCardState) {
    if (!seen.has(id)) {
      if (cached.node.parentNode) cached.node.remove();
      _atendCardState.delete(id);
      _timerRefs.delete(id);
    }
  }

  // Atualiza timerRefs (reutiliza refs existentes quando possível)
  _stopAtendTimerLoop();
  for (const atend of atendimentos) {
    const cached = _atendCardState.get(atend.id);
    if (!cached) continue;
    const mainEl = cached.node.querySelector('.atend-timer');
    const startMs = new Date(atend.inicio).getTime();
    const existing = _timerRefs.get(atend.id);
    if (existing) {
      existing.main = mainEl;
      existing.side = document.querySelector(`[data-sidebar-timer="${atend.id}"]`);
      existing.startMs = startMs;
      // lastText preservado — evita rewrite do textContent se não mudou
    } else {
      _timerRefs.set(atend.id, {
        main: mainEl,
        side: document.querySelector(`[data-sidebar-timer="${atend.id}"]`),
        startMs,
        lastText: ''
      });
    }
  }
  if (!document.hidden) _startAtendTimerLoop();

  initAtendDrag();
}

// ─── Remove atendimento ───

function removeAtendimento(atendId) {
  _ctx.activeAtendimentos = _ctx.activeAtendimentos.filter((a) => a.id !== atendId);
  const cached = _atendCardState.get(atendId);
  if (cached && cached.node.parentNode) cached.node.remove();
  _atendCardState.delete(atendId);
  _timerRefs.delete(atendId);
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

    // Se vendedor ainda tem outro atendimento paralelo aberto, NÃO devolve
    // pra fila — só remove esse card. Devolver à fila quebraria os paralelos
    // restantes (vendedor sairia de em_atendimento e os outros cards ficariam
    // órfãos com vendor disponivel + posicao_fila).
    const temParalelo = _ctx.activeAtendimentos.some((a) => a.vendedor_id === vendedorId && a.id !== atendId);
    if (temParalelo) {
      removeAtendimento(atendId);
      invalidateQueue();
      invalidateFooter();
      scheduleRender();
      _ctx.logPosition(v, 'cancelar', 'Paralelo cancelado');
      toast(`${v.apelido || v.nome}: cliente cancelado (mantém atendimento paralelo)`, 'info');
      return;
    }

    // Devolver vendedor à posição original (ou 1º se não tiver salva)
    const setor = v.setor || 'loja';
    const savedPos = _savedQueuePositions.get(vendedorId) || 1;
    _savedQueuePositions.delete(vendedorId);
    const inQueue = _ctx.vendedores
      .filter((x) => setoresMatch(x.setor, setor) && x.status === 'disponivel' && x.posicao_fila != null)
      .sort((a, b) => a.posicao_fila - b.posicao_fila);

    // Inserir na posição salva (ajustada ao tamanho atual da fila)
    const insertIdx = Math.min(savedPos - 1, inQueue.length);
    const before = inQueue.slice(0, insertIdx).map((x) => x.id);
    const after = inQueue.slice(insertIdx).map((x) => x.id);
    // Dedupe: se realtime já flipou o vendedor pra 'disponivel' antes desse cancel
    // chegar no inQueue, ele aparece em before/after e em vendedorId — duplicar no
    // p_ids quebra reordenar_fila (toast de erro + cards duplicados na render).
    const newOrder = [...new Set([...before, vendedorId, ...after])];

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
      const totalValor = _multiResults.reduce((s, r) => s + (r.resultado === 'venda' ? Number(r.valor) || 0 : 0), 0);
      const cardEl = document.querySelector(`[data-atend-id="${atendId}"]`);
      fireVendaCelebration({ valor: totalValor || null, originEl: cardEl });
      if (totalValor > 0) setTimeout(() => animateValueToHeader(totalValor, cardEl), 700);
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
        .filter((v) => setoresMatch(v.setor, setor) && v.status === 'disponivel' && v.posicao_fila != null)
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

async function finalize(resultado, motivo, detalhe, produto, atendId, valor, continuar, rupturaSel) {
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
      p_valor_venda: valor ?? null,
      p_ruptura_tipo_id: rupturaSel?.tipo_id || null,
      p_ruptura_marca_id: rupturaSel?.marca_id || null,
      p_ruptura_cor_id: rupturaSel?.cor_id || null,
      p_ruptura_tamanho: rupturaSel?.tamanho || null
    });
    if (error) throw error;

    try {
      // Calcula duracao do atendimento pra metrica de tempo medio no PostHog.
      const duracaoSeg = atendInfo?.inicio
        ? Math.max(0, Math.round((Date.now() - new Date(atendInfo.inicio).getTime()) / 1000))
        : null;
      window.minhavezAnalytics?.capture('tablet_atendimento_finalizado', {
        atendimento_id: id,
        vendedor_id: vendedorId,
        resultado,
        motivo: motivo || null,
        has_valor: valor != null,
        duracao_segundos: duracaoSeg
      });
      // Evento separado pra ruptura com props quebradas — casa com o card
      // de rupturas especificas no dashboard e permite analise por marca/tipo.
      if (rupturaSel && (rupturaSel.tipo_id || rupturaSel.marca_id)) {
        window.minhavezAnalytics?.capture('tablet_ruptura_reportada', {
          atendimento_id: id,
          tipo_id: rupturaSel.tipo_id || null,
          marca_id: rupturaSel.marca_id || null,
          cor_id: rupturaSel.cor_id || null,
          tamanho: rupturaSel.tamanho || null
        });
      }
    } catch (_e) {
      /* ignore */
    }

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
      const cardEl = document.querySelector(`[data-atend-id="${id}"]`);
      fireVendaCelebration({ valor: valor || null, originEl: cardEl });
      if (valor) setTimeout(() => animateValueToHeader(valor, cardEl), 700);
    } else if (resultado === 'nao_convertido') {
      playSound('fail');
    }
    const fv = vendedorId ? _ctx.vendedores.find((x) => x.id === vendedorId) : null;
    _ctx.logPosition(fv || atendInfo?.vendedores, 'finalizar', resultado + (valor ? ' R$' + valor : ''));
    removeAtendimento(id);
    pendingAtendimentoId = null;

    // Vendor ainda tem atendimento paralelo aberto? RPC finalizar_atendimento
    // já mexeu com vendor.status (disponivel) e posicao_fila (back-of-queue).
    // Re-marca em_atendimento pra não ficar órfão com paralelos remanescentes.
    // (Caminho continuar=true já trata logo abaixo, então só corrige aqui se
    // !continuar.)
    const temParalelo = vendedorId && _ctx.activeAtendimentos.some((a) => a.vendedor_id === vendedorId);
    if (!continuar && temParalelo) {
      await _ctx.sb
        .from('vendedores')
        .update({ status: 'em_atendimento', posicao_fila: null })
        .eq('id', vendedorId)
        .eq('tenant_id', _ctx.tenantId);
    }

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
  resetRupturaSelection();
}

function closeMotivos() {
  document.getElementById('motivoOverlay').classList.remove('open');
  document.getElementById('motivoSheet').classList.remove('open');
}

async function selectMotivo(el) {
  document
    .getElementById('motivoList')
    ?.querySelectorAll('.motivo-option')
    .forEach((o) => o.classList.remove('selected'));
  el.classList.add('selected');
  pendingOutcome = el.dataset.motivo;
  document.getElementById('rupturaField').style.display = pendingOutcome === 'ruptura' ? 'block' : 'none';
  document.getElementById('outroField').style.display = pendingOutcome === 'outro' ? 'block' : 'none';
  document.getElementById('btnConfirmMotivo').disabled = false;

  if (pendingOutcome === 'ruptura') {
    // Lazy-load catálogo e decide entre picker estruturado (elite/seeded) ou input fallback
    try {
      await loadRupturaCatalog(_ctx.sb);
    } catch (_) {
      /* falha silenciosa: cai no fallback */
    }
    const pickerEl = document.getElementById('rupturaPicker');
    const inputWrap = document.getElementById('rupturaInputWrap');
    if (hasRupturaCatalog() && pickerEl) {
      if (inputWrap) inputWrap.style.display = 'none';
      pickerEl.style.display = 'block';
      mountRupturaPicker(pickerEl);
    } else {
      if (pickerEl) pickerEl.style.display = 'none';
      if (inputWrap) inputWrap.style.display = 'block';
      document.getElementById('rupturaInput')?.focus();
    }
  }
  if (pendingOutcome === 'outro') document.getElementById('outroInput').focus();
}

function confirmMotivo() {
  if (!pendingOutcome || !pendingAtendimentoId) return;
  let produto = null;
  let rupturaSel = null;
  if (pendingOutcome === 'ruptura') {
    if (hasRupturaCatalog()) {
      rupturaSel = getRupturaSelection();
      produto = rupturaSelectionToText(); // representação legível (backward compat com produto_ruptura TEXT)
    } else {
      produto = document.getElementById('rupturaInput').value.trim() || null;
    }
  }
  const detalhe = pendingOutcome === 'outro' ? document.getElementById('outroInput').value.trim() : null;
  const atendId = pendingAtendimentoId;
  const motivoSnap = pendingOutcome;
  closeMotivos();
  askContinuar(
    atendId,
    () => finalize('nao_convertido', motivoSnap, detalhe, produto, atendId, null, false, rupturaSel),
    () => finalize('nao_convertido', motivoSnap, detalhe, produto, atendId, null, true, rupturaSel)
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

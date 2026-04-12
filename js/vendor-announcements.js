// ============================================
// minhavez Vendedor — Comunicados/Corridas (Fase 1)
// Módulo isolado que renderiza o card de comunicados no home,
// abre o sheet de detalhe e marca como lido.
// ============================================

let _sb = null;
let _tenantId = null;
let _announcements = [];
let _channel = null;
let _countdownTimer = null;

const TYPE_META = {
  comunicado:  { icon: 'fa-bullhorn',     label: 'Comunicado', color: '#8ea5c9' },
  corrida:     { icon: 'fa-flag-checkered', label: 'Corrida',  color: '#d4a373' },
  evento:      { icon: 'fa-calendar-day', label: 'Evento',     color: '#aaeec4' },
  treinamento: { icon: 'fa-graduation-cap', label: 'Treino',   color: '#b8a8d4' }
};

export async function initAnnouncements(sb, ctx) {
  _sb = sb;
  _tenantId = ctx.tenant_id;
  bindSheet();
  await loadAndRender();
  subscribeRealtime();
}

export function unmountAnnouncements() {
  if (_channel) {
    _sb?.removeChannel(_channel);
    _channel = null;
  }
  if (_countdownTimer) {
    clearInterval(_countdownTimer);
    _countdownTimer = null;
  }
}

async function loadAndRender() {
  const { data, error } = await _sb.rpc('list_announcements', { p_limit: 20 });
  if (error) {
    console.warn('[announcements] load falhou:', error);
    _announcements = [];
  } else {
    _announcements = data || [];
  }
  renderCard();
  if (window._vendorCounts) {
    window._vendorCounts.announcements = _announcements.filter(a => !a.read_at).length;
    window._vendorUpdateBadges?.();
  }
}

function renderCard() {
  const wrap = document.getElementById('announcementsWrap');
  if (!wrap) return;

  wrap.classList.remove('hidden');

  if (_announcements.length === 0) {
    wrap.classList.add('empty');
    wrap.innerHTML = `
      <div class="vendor-ann-header">
        <span class="vendor-ann-title">
          <i class="fa-solid fa-bullhorn"></i> Comunicados
        </span>
      </div>
      <div class="vendor-ann-empty">
        <i class="fa-regular fa-face-smile"></i>
        Nada novo por aqui ainda.
      </div>
    `;
    return;
  }

  wrap.classList.remove('empty');
  const unread = _announcements.filter((a) => !a.is_read).length;
  const top3 = _announcements.slice(0, 3);

  wrap.innerHTML = `
    <div class="vendor-ann-header">
      <span class="vendor-ann-title">
        <i class="fa-solid fa-bullhorn"></i> Comunicados
      </span>
      ${unread > 0 ? `<span class="vendor-ann-badge">${unread} novo${unread > 1 ? 's' : ''}</span>` : ''}
    </div>
    <div class="vendor-ann-list">
      ${top3.map((a) => renderItem(a)).join('')}
    </div>
    ${_announcements.length > 3 ? `<button class="vendor-ann-more" type="button">Ver todos (${_announcements.length})</button>` : ''}
  `;

  wrap.querySelectorAll('[data-ann-id]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.annId;
      const ann = _announcements.find((x) => x.id === id);
      if (ann) openSheet(ann);
    });
  });
  const btnMore = wrap.querySelector('.vendor-ann-more');
  if (btnMore) btnMore.addEventListener('click', () => openList());
}

function renderItem(a) {
  const meta = TYPE_META[a.type] || TYPE_META.comunicado;
  const iconHtml = a.icon && !a.icon.startsWith('fa-')
    ? `<span class="vendor-ann-emoji">${escapeHtml(a.icon)}</span>`
    : `<i class="fa-solid ${escapeHtml(a.icon || meta.icon)}"></i>`;
  const color = a.color || meta.color;
  const isCorrida = a.type === 'corrida';
  const subline = isCorrida
    ? renderCorridaSubline(a)
    : escapeHtml(a.body || meta.label).slice(0, 80);
  return `
    <button class="vendor-ann-item ${a.is_read ? '' : 'unread'} ${isCorrida ? 'corrida' : ''}" data-ann-id="${a.id}" type="button">
      <span class="vendor-ann-icon" style="color:${escapeHtml(color)}">${iconHtml}</span>
      <span class="vendor-ann-text">
        <strong>${escapeHtml(a.title)}</strong>
        <span>${subline}</span>
      </span>
      ${!a.is_read ? '<span class="vendor-ann-dot"></span>' : ''}
    </button>
  `;
}

function renderCorridaSubline(a) {
  const end = a.metadata?.end_date;
  if (!end) return escapeHtml(a.body || 'Corrida ativa').slice(0, 80);
  const diffMs = new Date(end).getTime() - Date.now();
  if (diffMs <= 0) return 'Encerrada';
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  if (days >= 1) return `${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}`;
  return `${hours}h restante${hours !== 1 ? 's' : ''}`;
}

// ─── Sheet de detalhe ───
function bindSheet() {
  const overlay = document.getElementById('annOverlay');
  if (overlay) {
    overlay.addEventListener('click', closeSheet);
  }
}

function openSheet(ann) {
  const overlay = document.getElementById('annOverlay');
  const sheet = document.getElementById('annSheet');
  const body = document.getElementById('annSheetBody');
  if (!overlay || !sheet || !body) return;

  const meta = TYPE_META[ann.type] || TYPE_META.comunicado;
  const color = ann.color || meta.color;
  const isCorrida = ann.type === 'corrida';
  const iconHtml = ann.icon && !ann.icon.startsWith('fa-')
    ? `<span class="vendor-ann-emoji">${escapeHtml(ann.icon)}</span>`
    : `<i class="fa-solid ${escapeHtml(ann.icon || meta.icon)}"></i>`;

  body.innerHTML = `
    <div class="vendor-ann-sheet-head" style="--ann-color:${escapeHtml(color)}">
      <div class="vendor-ann-sheet-icon">${iconHtml}</div>
      <div class="vendor-ann-sheet-type">${escapeHtml(meta.label)}</div>
      <h3 class="vendor-ann-sheet-title">${escapeHtml(ann.title)}</h3>
      ${isCorrida ? renderCorridaBlock(ann) : ''}
    </div>
    <div class="vendor-ann-sheet-body">${renderBody(ann.body)}</div>
  `;

  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');

  // Se é corrida, roda timer de countdown
  if (isCorrida) startCountdown(ann);

  // Marca como lido
  if (!ann.is_read) {
    _sb.rpc('mark_announcement_read', { p_id: ann.id }).then(({ error }) => {
      if (!error) {
        ann.is_read = true;
        renderCard();
      }
    });
  }
}

function renderCorridaBlock(ann) {
  const m = ann.metadata || {};
  const endDate = m.end_date;
  const prize = m.prize;
  return `
    <div class="vendor-corrida-block">
      ${prize ? `<div class="vendor-corrida-prize"><i class="fa-solid fa-trophy"></i> ${escapeHtml(prize)}</div>` : ''}
      ${endDate ? `<div class="vendor-corrida-countdown" id="annCountdown">—</div>` : ''}
    </div>
  `;
}

function startCountdown(ann) {
  if (_countdownTimer) clearInterval(_countdownTimer);
  const end = ann.metadata?.end_date;
  if (!end) return;
  const endMs = new Date(end).getTime();
  const tick = () => {
    const node = document.getElementById('annCountdown');
    if (!node) return;
    const diff = endMs - Date.now();
    if (diff <= 0) {
      node.textContent = 'Encerrada';
      clearInterval(_countdownTimer);
      _countdownTimer = null;
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const mi = Math.floor((diff % 3600000) / 60000);
    node.textContent = d > 0 ? `${d}d ${h}h ${mi}m` : `${h}h ${mi}m`;
  };
  tick();
  _countdownTimer = setInterval(tick, 60000);
}

// Expose for drawer
window._vendorAnnOpen = openList;

function openList() {
  // Versão simples: reusa o sheet com uma lista completa. Futuro: screen dedicada.
  const overlay = document.getElementById('annOverlay');
  const sheet = document.getElementById('annSheet');
  const body = document.getElementById('annSheetBody');
  if (!overlay || !sheet || !body) return;

  body.innerHTML = `
    <h3 class="vendor-sheet-title">Todos os comunicados</h3>
    <div class="vendor-ann-list full">
      ${_announcements.map((a) => renderItem(a)).join('')}
    </div>
  `;
  body.querySelectorAll('[data-ann-id]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.annId;
      const ann = _announcements.find((x) => x.id === id);
      if (ann) openSheet(ann);
    });
  });

  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
}

function closeSheet() {
  const overlay = document.getElementById('annOverlay');
  const sheet = document.getElementById('annSheet');
  overlay?.classList.add('hidden');
  sheet?.classList.add('hidden');
  if (_countdownTimer) {
    clearInterval(_countdownTimer);
    _countdownTimer = null;
  }
}

// ─── Realtime ───
function subscribeRealtime() {
  if (_channel) _sb.removeChannel(_channel);
  _channel = _sb
    .channel('announcements-' + _tenantId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tenant_announcements',
      filter: 'tenant_id=eq.' + _tenantId
    }, async () => {
      await loadAndRender();
    })
    .subscribe();
}

// ─── Utils ───
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBody(body) {
  // Markdown muito leve: quebras de linha + **negrito** + links http
  const esc = escapeHtml(body || '');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

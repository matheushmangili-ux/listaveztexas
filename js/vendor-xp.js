// ============================================
// minhavez Vendedor — Sistema de XP (Fase 2)
// Barra compacta no header + toast de ganho + sheet "Minha jornada"
// ============================================

const EVENT_META = {
  atendimento_concluido: { icon: 'fa-handshake',       label: 'Atendimento concluído' },
  venda_realizada:       { icon: 'fa-bag-shopping',    label: 'Venda realizada'       },
  troca_realizada:       { icon: 'fa-arrow-right-arrow-left', label: 'Troca realizada' },
  conversao_bonus:       { icon: 'fa-chart-line',      label: 'Conversão acima da média' }
};

let _sb = null;
let _last = null; // último snapshot { total_xp, level, next_level_xp, progress_pct }

export async function initXp(sb) {
  _sb = sb;
  bindSheet();
  await refresh();
}

export function unmountXp() {
  _sb = null;
  _last = null;
}

// Chamado após finalizar atendimento pra disparar toast/level up
export async function refreshAfterAtendimento() {
  const prev = _last;
  await refresh();
  if (!prev || !_last) return;
  const delta = _last.total_xp - prev.total_xp;
  if (delta > 0) showXpToast(delta);
  if (_last.level > prev.level) showLevelUp(_last.level);
}

async function refresh() {
  try {
    const { data, error } = await _sb.rpc('get_my_xp');
    if (error) throw error;
    if (!data || data.length === 0) { render(null); return; }
    _last = data[0];
    render(_last);
  } catch (err) {
    console.warn('[xp] refresh falhou:', err);
    render(null);
  }
}

function render(xp) {
  const strip = document.getElementById('xpStrip');
  if (!strip) return;
  if (!xp) {
    strip.classList.add('hidden');
    return;
  }
  strip.classList.remove('hidden');
  const pct = Math.max(0, Math.min(100, Number(xp.progress_pct) || 0));
  const levelXp  = Number(xp.level_xp) || 0;
  const nextXp   = Number(xp.next_level_xp) || 0;
  const intoLevel = Math.max(0, xp.total_xp - levelXp);
  const span      = Math.max(1, nextXp - levelXp);
  strip.innerHTML = `
    <button type="button" class="xp-strip-btn" aria-label="Minha jornada">
      <span class="xp-level mono">Nv ${xp.level}</span>
      <span class="xp-bar"><span class="xp-bar-fill" style="width:${pct}%"></span></span>
      <span class="xp-nums mono">${intoLevel}/${span}</span>
    </button>
  `;
  strip.querySelector('.xp-strip-btn').addEventListener('click', openSheet);
}

// ─── Toast de ganho ───
function showXpToast(delta) {
  const toast = document.createElement('div');
  toast.className = 'xp-gain-toast';
  toast.innerHTML = `<i class="fa-solid fa-bolt"></i> +${delta} XP`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2400);
}

function showLevelUp(newLevel) {
  const box = document.createElement('div');
  box.className = 'xp-levelup';
  box.innerHTML = `
    <div class="xp-levelup-card">
      <i class="fa-solid fa-crown"></i>
      <div class="xp-levelup-title">Nível ${newLevel}!</div>
      <div class="xp-levelup-sub">Você subiu de nível</div>
    </div>
  `;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add('show'), 10);
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => box.remove(), 400);
  }, 3000);
  // vibra se suportar
  if (navigator.vibrate) navigator.vibrate([100, 60, 160]);
}

// ─── Sheet "Minha jornada" ───
function bindSheet() {
  const overlay = document.getElementById('xpOverlay');
  overlay?.addEventListener('click', closeSheet);
}

async function openSheet() {
  const overlay = document.getElementById('xpOverlay');
  const sheet   = document.getElementById('xpSheet');
  const body    = document.getElementById('xpSheetBody');
  if (!overlay || !sheet || !body) return;

  body.innerHTML = renderSheetHeader(_last) +
    '<div class="xp-breakdown-title">Últimos 30 dias</div>' +
    renderBreakdown(_last) +
    '<div class="xp-history-title">Últimos eventos</div>' +
    '<div class="xp-history" id="xpHistory"><div class="xp-loading">Carregando...</div></div>';

  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');

  // Lazy load do histórico
  try {
    const { data, error } = await _sb.rpc('list_my_xp_events', { p_limit: 20 });
    if (error) throw error;
    renderHistory(data || []);
  } catch (err) {
    const h = document.getElementById('xpHistory');
    if (h) h.innerHTML = `<div class="xp-loading">Erro: ${escapeHtml(err?.message || String(err))}</div>`;
  }
}

function closeSheet() {
  document.getElementById('xpOverlay')?.classList.add('hidden');
  document.getElementById('xpSheet')?.classList.add('hidden');
}

function renderSheetHeader(xp) {
  if (!xp) return '<div class="xp-loading">Sem dados ainda</div>';
  const pct = Math.max(0, Math.min(100, Number(xp.progress_pct) || 0));
  const intoLevel = Math.max(0, xp.total_xp - xp.level_xp);
  const span      = Math.max(1, xp.next_level_xp - xp.level_xp);
  return `
    <div class="xp-sheet-hero">
      <div class="xp-sheet-level">Nível ${xp.level}</div>
      <div class="xp-sheet-total mono">${xp.total_xp} XP</div>
      <div class="xp-sheet-bar"><span class="xp-sheet-bar-fill" style="width:${pct}%"></span></div>
      <div class="xp-sheet-progress mono">${intoLevel} / ${span} pra Nv ${xp.level + 1}</div>
    </div>
  `;
}

function renderBreakdown(xp) {
  const bd = xp?.breakdown || {};
  const keys = Object.keys(bd);
  if (keys.length === 0) {
    return '<div class="xp-breakdown-empty">Nenhum XP nos últimos 30 dias.</div>';
  }
  return '<div class="xp-breakdown">' + keys.map((k) => {
    const meta = EVENT_META[k] || { icon: 'fa-star', label: k };
    return `
      <div class="xp-breakdown-row">
        <i class="fa-solid ${meta.icon}"></i>
        <span class="xp-breakdown-label">${escapeHtml(meta.label)}</span>
        <span class="xp-breakdown-pts mono">+${bd[k]}</span>
      </div>
    `;
  }).join('') + '</div>';
}

function renderHistory(events) {
  const box = document.getElementById('xpHistory');
  if (!box) return;
  if (events.length === 0) {
    box.innerHTML = '<div class="xp-loading">Nenhum evento ainda. Finalize um atendimento pra começar.</div>';
    return;
  }
  box.innerHTML = events.map((e) => {
    const meta = EVENT_META[e.event_type] || { icon: 'fa-star', label: e.event_type };
    const when = formatRelative(e.created_at);
    return `
      <div class="xp-history-row">
        <i class="fa-solid ${meta.icon}"></i>
        <div class="xp-history-text">
          <strong>${escapeHtml(meta.label)}</strong>
          <span>${when}</span>
        </div>
        <span class="xp-history-pts mono">+${e.points}</span>
      </div>
    `;
  }).join('');
}

// ─── Utils ───
function formatRelative(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60000) return 'agora mesmo';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} dia${d > 1 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

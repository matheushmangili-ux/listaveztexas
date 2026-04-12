// ============================================
// minhavez Vendedor — Missões Diárias (Fase 3)
// Card no home com até 3 missões do dia + sheet "Missões" completa.
// ============================================

let _sb = null;
let _missions = [];
let _prevCompletedIds = new Set();

const GOAL_LABEL = {
  atendimentos_count:   { unit: 'atendimento(s)',  fmt: (v) => Math.floor(v) },
  vendas_count:         { unit: 'venda(s)',        fmt: (v) => Math.floor(v) },
  vendas_canal_count:   { unit: 'venda(s)',        fmt: (v) => Math.floor(v) },
  valor_vendido_total:  { unit: 'em vendas',       fmt: (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',') }
};

export async function initMissions(sb) {
  _sb = sb;
  bindSheet();
  await refresh();
}

export function unmountMissions() {
  _sb = null;
  _missions = [];
  _prevCompletedIds = new Set();
}

export async function refreshMissionsAfterAtendimento() {
  const prevCompleted = new Set(_prevCompletedIds);
  await refresh();
  const newlyCompleted = _missions.filter((m) => m.completed && !prevCompleted.has(m.template_id));
  for (const m of newlyCompleted) {
    showMissionCompleted(m);
  }
}

async function refresh() {
  try {
    const { data, error } = await _sb.rpc('get_my_missions_today');
    if (error) throw error;
    _missions = data || [];
    _prevCompletedIds = new Set(_missions.filter((m) => m.completed).map((m) => m.template_id));
    render();
  } catch (err) {
    console.warn('[missions] refresh falhou:', err);
    _missions = [];
    render();
  }
}

function render() {
  const wrap = document.getElementById('missionsCard');
  if (!wrap) return;

  if (_missions.length === 0) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  const visible = _missions.slice(0, 3);
  const completedCount = _missions.filter((m) => m.completed).length;

  wrap.innerHTML = `
    <button type="button" class="missions-card-btn" aria-label="Ver todas as missões do dia">
      <div class="missions-header">
        <span class="missions-title">
          <i class="fa-solid fa-bullseye"></i> Missões do dia
        </span>
        <span class="missions-count">${completedCount}/${_missions.length}</span>
      </div>
      <div class="missions-list">
        ${visible.map(renderRow).join('')}
      </div>
    </button>
  `;
  wrap.querySelector('.missions-card-btn').addEventListener('click', openSheet);
}

function renderRow(m) {
  const pct = Math.max(0, Math.min(100, Number(m.progress_pct) || 0));
  const fmt = (GOAL_LABEL[m.goal_type] || { fmt: (v) => v }).fmt;
  const progressText = m.goal_type === 'valor_vendido_total'
    ? `${fmt(m.progress)} / ${fmt(m.goal_value)}`
    : `${fmt(m.progress)}/${fmt(m.goal_value)}`;
  return `
    <div class="mission-row ${m.completed ? 'completed' : ''}">
      <i class="fa-solid ${esc(m.icon || 'fa-bullseye')}"></i>
      <div class="mission-text">
        <span class="mission-title">${esc(m.title)}</span>
        <div class="mission-bar"><span class="mission-bar-fill" style="width:${pct}%"></span></div>
      </div>
      <span class="mission-nums mono">${progressText}${m.completed ? ' ✓' : ''}</span>
    </div>
  `;
}

function bindSheet() {
  document.getElementById('missionsOverlay')?.addEventListener('click', closeSheet);
}

function openSheet() {
  const overlay = document.getElementById('missionsOverlay');
  const sheet   = document.getElementById('missionsSheet');
  const body    = document.getElementById('missionsSheetBody');
  if (!overlay || !sheet || !body) return;

  body.innerHTML = _missions.length === 0
    ? '<div class="missions-empty">Nenhuma missão ativa pra hoje.</div>'
    : _missions.map(renderSheetRow).join('');

  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
}

function closeSheet() {
  document.getElementById('missionsOverlay')?.classList.add('hidden');
  document.getElementById('missionsSheet')?.classList.add('hidden');
}

function renderSheetRow(m) {
  const pct = Math.max(0, Math.min(100, Number(m.progress_pct) || 0));
  const fmt = (GOAL_LABEL[m.goal_type] || { fmt: (v) => v }).fmt;
  const progressText = `${fmt(m.progress)} / ${fmt(m.goal_value)}`;
  return `
    <div class="mission-sheet-row ${m.completed ? 'completed' : ''}">
      <div class="mission-sheet-icon"><i class="fa-solid ${esc(m.icon || 'fa-bullseye')}"></i></div>
      <div class="mission-sheet-body">
        <strong>${esc(m.title)}</strong>
        ${m.description ? `<span class="mission-sheet-desc">${esc(m.description)}</span>` : ''}
        <div class="mission-sheet-bar"><span class="mission-sheet-bar-fill" style="width:${pct}%"></span></div>
        <div class="mission-sheet-foot">
          <span class="mono">${progressText}</span>
          <span class="mission-reward"><i class="fa-solid fa-bolt"></i> ${m.reward_xp} XP</span>
        </div>
      </div>
      ${m.completed ? '<i class="fa-solid fa-circle-check mission-done-check"></i>' : ''}
    </div>
  `;
}

function showMissionCompleted(m) {
  const box = document.createElement('div');
  box.className = 'mission-complete-toast';
  box.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    <div class="mission-complete-text">
      <strong>Missão cumprida!</strong>
      <span>${esc(m.title)}</span>
    </div>
    <span class="mission-complete-reward mono">+${m.reward_xp} XP</span>
  `;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add('show'), 10);
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => box.remove(), 400);
  }, 3500);
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

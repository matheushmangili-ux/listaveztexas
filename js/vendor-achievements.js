// ============================================
// minhavez Vendedor — Conquistas / Badges (Fase 4)
// Tela de conquistas acessível via ícone no header + toast ao desbloquear.
// ============================================

import { playSound } from './sound.js';

let _sb = null;
let _achievements = [];
let _prevUnlockedCodes = new Set();

const TIER_COLORS = {
  bronze:   { bg: 'rgba(180,83,9,0.12)',  border: 'rgba(180,83,9,0.3)',  text: '#d97706' },
  prata:    { bg: 'rgba(226,232,240,0.08)', border: 'rgba(226,232,240,0.2)', text: '#e2e8f0' },
  ouro:     { bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.3)', text: '#facc15' },
  lendario: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', text: '#f97316' }
};

export async function initAchievements(sb) {
  _sb = sb;
  bindSheet();
  wireHeaderBtn();
  await refresh();
}

export function unmountAchievements() {
  _sb = null;
  _achievements = [];
  _prevUnlockedCodes = new Set();
}

export async function refreshAchievementsAfterAtendimento() {
  const prev = new Set(_prevUnlockedCodes);
  await refresh();
  const newlyUnlocked = _achievements.filter((a) => a.unlocked && !prev.has(a.code));
  for (const a of newlyUnlocked) {
    showAchievementUnlocked(a);
  }
}

async function refresh() {
  try {
    const { data, error } = await _sb.rpc('get_my_achievements');
    if (error) throw error;
    _achievements = data || [];
    _prevUnlockedCodes = new Set(_achievements.filter((a) => a.unlocked).map((a) => a.code));
    updateBadgeCount();
  } catch (err) {
    console.warn('[achievements] refresh falhou:', err);
    _achievements = [];
  }
}

function updateBadgeCount() {
  const btn = document.getElementById('btnAchievements');
  if (!btn) return;
  const unlocked = _achievements.filter((a) => a.unlocked).length;
  const badge = btn.querySelector('.achievements-badge');
  if (badge) badge.textContent = String(unlocked);
}

function wireHeaderBtn() {
  const btn = document.getElementById('btnAchievements');
  if (btn) btn.addEventListener('click', openSheet);
}

// ─── Sheet ───
function bindSheet() {
  document.getElementById('achievementsOverlay')?.addEventListener('click', closeSheet);
}

function openSheet() {
  const overlay = document.getElementById('achievementsOverlay');
  const sheet   = document.getElementById('achievementsSheet');
  const body    = document.getElementById('achievementsSheetBody');
  if (!overlay || !sheet || !body) return;

  refresh().then(() => {
    if (_achievements.length === 0) {
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--vendor-text-muted);font-size:12px;font-style:italic">Nenhuma conquista disponível.</div>';
    } else {
      const unlocked = _achievements.filter((a) => a.unlocked);
      const locked   = _achievements.filter((a) => !a.unlocked);
      body.innerHTML =
        (unlocked.length > 0 ? '<div class="ach-section-label">Desbloqueadas</div>' + renderGrid(unlocked) : '') +
        (locked.length > 0 ? '<div class="ach-section-label">Em progresso</div>' + renderGrid(locked) : '');
    }
    overlay.classList.remove('hidden');
    sheet.classList.remove('hidden');
  });
}

function closeSheet() {
  document.getElementById('achievementsOverlay')?.classList.add('hidden');
  document.getElementById('achievementsSheet')?.classList.add('hidden');
}

function renderGrid(items) {
  return '<div class="ach-grid">' + items.map(renderCard).join('') + '</div>';
}

function renderCard(a) {
  const tc = TIER_COLORS[a.tier] || TIER_COLORS.bronze;
  const pct = Number(a.progress_pct) || 0;
  return `
    <div class="ach-card ${a.unlocked ? 'unlocked' : 'locked'}" style="--ach-bg:${tc.bg};--ach-border:${tc.border};--ach-text:${tc.text}">
      <div class="ach-icon"><i class="fa-solid ${esc(a.icon)}"></i></div>
      <div class="ach-title">${esc(a.title)}</div>
      <div class="ach-desc">${esc(a.description)}</div>
      ${!a.unlocked ? `<div class="ach-progress"><div class="ach-progress-fill" style="width:${pct}%"></div></div><div class="ach-pct mono">${Math.floor(pct)}%</div>` : '<div class="ach-check"><i class="fa-solid fa-circle-check"></i></div>'}
    </div>
  `;
}

// ─── Toast de conquista desbloqueada ───
function showAchievementUnlocked(a) {
  const tc = TIER_COLORS[a.tier] || TIER_COLORS.bronze;
  const box = document.createElement('div');
  box.className = 'ach-unlock-toast';
  box.style.setProperty('--ach-text', tc.text);
  box.innerHTML = `
    <div class="ach-unlock-icon"><i class="fa-solid ${esc(a.icon)}"></i></div>
    <div class="ach-unlock-text">
      <strong>Conquista desbloqueada!</strong>
      <span>${esc(a.title)}</span>
    </div>
  `;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add('show'), 10);
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => box.remove(), 400);
  }, 4000);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120, 40, 200]);
  try { playSound('tierup'); } catch { /* ignore */ }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

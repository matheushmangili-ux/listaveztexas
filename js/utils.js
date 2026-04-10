// ============================================
// MinhaVez — Shared Utilities
// ============================================

export const MOTIVOS = {
  preco: { label: 'Preço', icon: 'fa-tag', color: '#F59E0B' },
  ruptura: { label: 'Ruptura', icon: 'fa-box-open', color: '#EF4444' },
  indecisao: { label: 'Indecisão', icon: 'fa-face-meh', color: '#8B5CF6' },
  so_olhando: { label: 'Só olhando', icon: 'fa-eye', color: '#6B7280' },
  outro: { label: 'Outro', icon: 'fa-ellipsis', color: '#94A3B8' }
};

export const STATUS_CONFIG = {
  disponivel: {
    label: 'Disponível',
    short: 'LIVRE',
    color: '#34D399',
    bg: 'rgba(52,211,153,.1)',
    icon: 'fa-circle-check'
  },
  em_atendimento: {
    label: 'Em atendimento',
    short: 'ATENDENDO',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,.1)',
    icon: 'fa-comments'
  },
  pausa: { label: 'Em pausa', short: 'PAUSA', color: '#FBBF24', bg: 'rgba(251,191,36,.1)', icon: 'fa-mug-hot' },
  fora: { label: 'Fora', short: 'FORA', color: '#71717A', bg: 'rgba(113,113,122,.1)', icon: 'fa-door-open' }
};

export const SAIDA_COLORS = {
  almoco: { color: '#FBBF24', label: 'Almoço', labelFull: 'Em almoço' },
  banheiro: { color: '#60A5FA', label: 'Banheiro', labelFull: 'Banheiro' },
  reuniao: { color: '#A1A1AA', label: 'Reunião', labelFull: 'Em reunião' },
  operacional: { color: '#8b5cf6', label: 'Operacional', labelFull: 'Operacional' },
  finalizar: { color: '#F87171', label: 'Finalizou', labelFull: 'Encerrou' },
  outro: { color: '#71717A', label: 'Fora', labelFull: 'Fora' }
};

export const PAUSE_LIMITS = { almoco: 60, banheiro: 15, reuniao: 30, operacional: 45 }; // minutos

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0min 0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
  return m + 'min ' + s + 's';
}

export function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function yesterdayRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function initials(name) {
  if (!name) return '??';
  const letters = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return letters ? letters.toUpperCase() : '??';
}

// Theme toggle (light/dark)
export function initTheme() {
  const saved = localStorage.getItem('lv-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lv-theme', next);
  return next;
}

// Toast notification
export function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const styles = {
    success: { border: 'rgba(34,197,94,.3)', bg: '#052e16', text: '#86efac' },
    error: { border: 'rgba(239,68,68,.3)', bg: '#450a0a', text: '#fca5a5' },
    warning: { border: 'rgba(245,158,11,.3)', bg: '#451a03', text: '#fcd34d' },
    info: { border: 'rgba(96,165,250,.3)', bg: '#172554', text: '#93c5fd' }
  };
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  const s = styles[type] || styles.info;
  const el = document.createElement('div');
  el.style.cssText = `display:flex;align-items:center;gap:14px;padding:16px 20px;border-radius:12px;border:1px solid ${s.border};background:${s.bg};color:${s.text};font-size:15px;font-weight:600;font-family:var(--font-body);box-shadow:0 4px 16px rgba(0,0,0,.35);animation:toastIn .25s ease forwards;min-width:300px;max-width:460px`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" style="font-size:18px;flex-shrink:0"></i><span>${escapeHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

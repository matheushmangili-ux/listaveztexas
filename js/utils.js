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
  const saved = localStorage.getItem('lv-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}
export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lv-theme', next);
  return next;
}

// Toast notification — estilo Linear/Arc minimalista
export function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const tone = {
    success: { accent: '#22c55e', iconBg: 'rgba(34,197,94,.14)' },
    error:   { accent: '#ef4444', iconBg: 'rgba(239,68,68,.14)' },
    warning: { accent: '#f59e0b', iconBg: 'rgba(245,158,11,.14)' },
    info:    { accent: '#3b82f6', iconBg: 'rgba(59,130,246,.14)' }
  };
  const icons = {
    success: 'fa-check',
    error: 'fa-xmark',
    warning: 'fa-exclamation',
    info: 'fa-info'
  };
  const t = tone[type] || tone.info;
  const el = document.createElement('div');
  el.style.cssText = `
    display:flex;align-items:center;gap:12px;
    padding:12px 16px 12px 12px;
    border-radius:12px;
    background:var(--bg-card);
    border:1px solid var(--border-subtle);
    color:var(--text-primary);
    font-size:13px;font-weight:500;
    font-family:'Inter Tight',system-ui,sans-serif;
    letter-spacing:-0.005em;
    box-shadow:0 8px 24px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.06);
    animation:toastIn .22s cubic-bezier(.16,1,.3,1) forwards;
    min-width:260px;max-width:420px;
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  `;
  el.innerHTML = `
    <span style="width:28px;height:28px;border-radius:8px;background:${t.iconBg};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
      <i class="fa-solid ${icons[type] || icons.info}" style="font-size:13px;color:${t.accent}"></i>
    </span>
    <span style="line-height:1.4">${escapeHtml(msg)}</span>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .28s cubic-bezier(.4,0,1,1) forwards';
    setTimeout(() => el.remove(), 280);
  }, duration);
}

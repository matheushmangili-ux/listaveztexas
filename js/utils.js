// ============================================
// MinhaVez — Shared Utilities
// ============================================

export const MOTIVOS = {
  preco: { label: 'Preço', icon: 'fa-tag', color: '#e2506f' },
  ruptura: { label: 'Ruptura', icon: 'fa-box-open', color: '#c43d5a' },
  indecisao: { label: 'Indecisão', icon: 'fa-face-meh', color: '#f0758e' },
  so_olhando: { label: 'Só olhando', icon: 'fa-eye', color: '#D4D4D8' },
  outro: { label: 'Outro', icon: 'fa-ellipsis', color: '#A1A1AA' }
};

export const STATUS_CONFIG = {
  disponivel: { label: 'Disponível', short: 'LIVRE', color: '#34D399', bg: 'rgba(52,211,153,.1)', icon: 'fa-circle-check' },
  em_atendimento: { label: 'Em atendimento', short: 'ATENDENDO', color: '#60A5FA', bg: 'rgba(96,165,250,.1)', icon: 'fa-comments' },
  pausa: { label: 'Em pausa', short: 'PAUSA', color: '#FBBF24', bg: 'rgba(251,191,36,.1)', icon: 'fa-mug-hot' },
  fora: { label: 'Fora', short: 'FORA', color: '#71717A', bg: 'rgba(113,113,122,.1)', icon: 'fa-door-open' }
};

export function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0min 0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
  return m + 'min ' + s + 's';
}

export function formatTimeLong(seconds) {
  if (!seconds || !isFinite(seconds)) return '0min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'min';
  return m + 'min';
}

export function formatDateBR(d) {
  const dt = new Date(d);
  return String(dt.getDate()).padStart(2, '0') + '/' +
    String(dt.getMonth() + 1).padStart(2, '0') + '/' +
    dt.getFullYear();
}

export function formatHora(d) {
  const dt = new Date(d);
  return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
}

export function elapsedSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / 1000;
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
  return (name || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
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

// Debounce for button protection
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Texas Flag Loader HTML
export function texasLoaderHTML(text) {
  return `<div class="texas-loader">
    <svg viewBox="0 0 64 44">
      <rect class="flag-outline" x="1" y="1" width="62" height="42" rx="3"/>
      <line class="flag-lines" x1="20" y1="1" x2="20" y2="43"/>
      <line class="flag-lines" x1="20" y1="22" x2="63" y2="22"/>
      <polygon class="flag-star" points="10,14 11.8,19.5 17.5,19.5 12.8,23 14.7,28.5 10,25 5.3,28.5 7.2,23 2.5,19.5 8.2,19.5"/>
    </svg>
    ${text ? '<span class="texas-loader-text">' + text + '</span>' : ''}
  </div>`;
}

// Toast notification
export function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const styles = {
    success: { border: 'rgba(34,197,94,.3)', bg: '#052e16', text: '#86efac' },
    error:   { border: 'rgba(239,68,68,.3)', bg: '#450a0a', text: '#fca5a5' },
    warning: { border: 'rgba(245,158,11,.3)', bg: '#451a03', text: '#fcd34d' },
    info:    { border: 'rgba(96,165,250,.3)', bg: '#172554', text: '#93c5fd' }
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
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" style="font-size:18px;flex-shrink:0"></i><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

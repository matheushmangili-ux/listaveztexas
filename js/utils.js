// ============================================
// ListaVez Texas — Shared Utilities
// ============================================

export const MOTIVOS = {
  preco: { label: 'Preço', icon: 'fa-tag', color: '#f59e0b' },
  ruptura: { label: 'Ruptura', icon: 'fa-box-open', color: '#ef4444' },
  indecisao: { label: 'Indecisão', icon: 'fa-face-meh', color: '#8b5cf6' },
  so_olhando: { label: 'Só olhando', icon: 'fa-eye', color: '#6b7280' },
  outro: { label: 'Outro', icon: 'fa-ellipsis', color: '#374151' }
};

export const STATUS_CONFIG = {
  disponivel: { label: 'Disponível', short: 'LIVRE', color: '#22c55e', bg: 'rgba(34,197,94,.12)', icon: 'fa-circle-check' },
  em_atendimento: { label: 'Em atendimento', short: 'ATENDENDO', color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: 'fa-comments' },
  pausa: { label: 'Em pausa', short: 'PAUSA', color: '#f59e0b', bg: 'rgba(245,158,11,.12)', icon: 'fa-mug-hot' },
  fora: { label: 'Fora', short: 'FORA', color: '#6b7280', bg: 'rgba(107,114,128,.12)', icon: 'fa-door-open' }
};

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function formatTimeLong(seconds) {
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

// Debounce for button protection
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
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
  el.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;border:1px solid ${s.border};background:${s.bg};color:${s.text};font-size:13px;font-weight:600;font-family:var(--font-body);box-shadow:0 8px 32px rgba(0,0,0,.4);animation:toastIn .35s cubic-bezier(.16,1,.3,1) forwards;min-width:260px;max-width:400px`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

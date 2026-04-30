// ============================================
// MinhaVez — Shared Utilities
// ============================================

export const MOTIVOS = {
  preco: { label: 'Preço', icon: 'fa-tag', color: '#d4a373' },
  ruptura: { label: 'Ruptura', icon: 'fa-box-open', color: '#e89b8a' },
  indecisao: { label: 'Indecisão', icon: 'fa-face-meh', color: '#b8a8d4' },
  so_olhando: { label: 'Só olhando', icon: 'fa-eye', color: '#6B7280' },
  outro: { label: 'Outro', icon: 'fa-ellipsis', color: '#94A3B8' }
};

export const STATUS_CONFIG = {
  disponivel: {
    label: 'Disponível',
    short: 'LIVRE',
    color: '#a78bfa',
    bg: 'rgba(167, 139, 250,.1)',
    icon: 'fa-circle-check'
  },
  em_atendimento: {
    label: 'Em atendimento',
    short: 'ATENDENDO',
    color: '#8ea5c9',
    bg: 'rgba(142,165,201,.1)',
    icon: 'fa-comments'
  },
  pausa: { label: 'Em pausa', short: 'PAUSA', color: '#d4a373', bg: 'rgba(212,163,115,.1)', icon: 'fa-mug-hot' },
  fora: { label: 'Fora', short: 'FORA', color: '#71717A', bg: 'rgba(113,113,122,.1)', icon: 'fa-door-open' }
};

export const SAIDA_COLORS = {
  almoco: { color: '#d4a373', label: 'Almoço', labelFull: 'Em almoço' },
  banheiro: { color: '#8ea5c9', label: 'Banheiro', labelFull: 'Banheiro' },
  reuniao: { color: '#A1A1AA', label: 'Reunião', labelFull: 'Em reunião' },
  operacional: { color: '#9488b8', label: 'Operacional', labelFull: 'Operacional' },
  finalizar: { color: '#e89b8a', label: 'Finalizou', labelFull: 'Encerrou' },
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

/**
 * Normaliza chave de setor para comparação robusta entre tabs/UI e dados.
 *
 * Bug-fix histórico (2026-04-30): Texas Center reportou que vendedores de
 * selaria/chapelaria/vestuário não apareciam pra entrar na fila. Causa raiz:
 * filtros usavam comparação `===` exata de string. Tenants configuram
 * `tenant.setores = ['loja', 'chapelaria', 'selaria', 'vestuario']` (lowercase
 * sem acento) mas dados em `vendedores.setor` podem estar com acento e
 * capitalização diferentes ('Vestuário', 'Chapelaria', etc) — herança de
 * cadastros manuais ou imports antigos.
 *
 * Esta função normaliza ambos os lados antes de comparar:
 * - lowercase
 * - remove acentos (NFD + replace combining marks)
 * - trim espaços
 * - fallback para 'loja' quando null/undefined/empty
 *
 * Uso: `setoresMatch(v.setor, currentSetor)` em vez de `(v.setor||'loja')===currentSetor`.
 */
export function normalizeSetor(s) {
  const raw = String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return raw === '' ? 'loja' : raw;
}

export function setoresMatch(a, b) {
  return normalizeSetor(a) === normalizeSetor(b);
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
    success: { accent: '#8b5cf6', iconBg: 'rgba(167, 139, 250,.18)' },
    error: { accent: '#d47a68', iconBg: 'rgba(232,155,138,.18)' },
    warning: { accent: '#b8875a', iconBg: 'rgba(212,163,115,.18)' },
    info: { accent: '#6d85ac', iconBg: 'rgba(142,165,201,.18)' }
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

// ============================================
// Color helpers — derivam paleta de acento a partir de um hex base
// Usado pelo white-label Elite (applyBranding → --accent e variantes)
// ============================================

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = (x) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hk = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(hk + 1 / 3) * 255, g: hue(hk) * 255, b: hue(hk - 1 / 3) * 255 };
}

function shift(hex, deltaL) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(1, l + deltaL));
  const out = hslToRgb(h, s, newL);
  return rgbToHex(out.r, out.g, out.b);
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/**
 * Deriva { base, bright, dim, ink } a partir de um hex base.
 * - bright: +12% luminosidade (hover/destaques)
 * - dim:    −15% luminosidade (pressed/muted)
 * - ink:    preto ou branco conforme contraste WCAG sobre base
 */
export function deriveAccentVariants(hex) {
  if (!/^#[0-9a-fA-F]{3,6}$/.test(hex)) return null;
  const base =
    hex.length === 4
      ? '#' +
        hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.toLowerCase();
  return {
    base,
    bright: shift(base, 0.12),
    dim: shift(base, -0.15),
    ink: relativeLuminance(base) > 0.5 ? '#0d0d0d' : '#ffffff'
  };
}

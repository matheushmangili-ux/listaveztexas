// ============================================
// MinhaVez — UI Utilities
// Shared modal, currency input helpers
// ============================================

import { escapeHtml } from '/js/utils.js';

/**
 * Render a consistent empty/loading/error state for a list container.
 * @param {HTMLElement|string} target - Element or its id
 * @param {'loading'|'empty'|'error'} kind
 * @param {object} [opts]
 * @param {string} [opts.icon] - FontAwesome class (ex: 'fa-inbox')
 * @param {string} [opts.title]
 * @param {string} [opts.hint]
 * @param {string} [opts.retryLabel]
 * @param {function} [opts.onRetry]
 */
export function renderState(target, kind, opts = {}) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  const icon =
    opts.icon ||
    (kind === 'error' ? 'fa-triangle-exclamation' : kind === 'loading' ? 'fa-spinner fa-spin' : 'fa-inbox');
  const color = kind === 'error' ? 'var(--danger)' : 'var(--text-muted)';
  const title =
    opts.title || (kind === 'loading' ? 'Carregando…' : kind === 'error' ? 'Erro ao carregar' : 'Nada por aqui ainda');
  const hint = opts.hint || '';
  const retryBtn =
    kind === 'error' && typeof opts.onRetry === 'function'
      ? `<button type="button" class="state-retry-btn" style="margin-top:12px;padding:8px 14px;border:1px solid var(--border-medium);border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;font-size:12px">${escapeHtml(opts.retryLabel || 'Tentar de novo')}</button>`
      : '';
  el.innerHTML = `
    <div style="text-align:center;padding:32px 16px;color:${color};font-size:13px" role="${kind === 'error' ? 'alert' : 'status'}">
      <i class="fa-solid ${escapeHtml(icon)}" style="font-size:22px;display:block;margin-bottom:10px;opacity:.7" aria-hidden="true"></i>
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>
      ${hint ? `<div style="opacity:.85">${escapeHtml(hint)}</div>` : ''}
      ${retryBtn}
    </div>`;
  if (retryBtn) {
    const btn = el.querySelector('.state-retry-btn');
    if (btn) btn.addEventListener('click', opts.onRetry);
  }
}

/**
 * Create a modal overlay with content.
 * @param {string} id - Unique ID for the modal
 * @param {string} content - HTML content
 * @param {object} [opts]
 * @param {number} [opts.zIndex=1000]
 * @param {string} [opts.maxWidth='360px']
 * @param {function} [opts.onClose]
 * @returns {HTMLElement} The overlay element
 */
export function createModal(id, content, { zIndex = 1000, maxWidth = '360px', onClose } = {}) {
  const existing = document.getElementById(id);
  if (existing) {
    if (typeof existing._cleanup === 'function') existing._cleanup();
    existing.remove();
  }
  const previouslyFocused = document.activeElement;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (zIndex !== 1000) overlay.style.zIndex = zIndex;

  const closeFn = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus();
      } catch {
        /* ignore */
      }
    }
    if (onClose) onClose();
  };

  const getFocusable = () =>
    overlay.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFn();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = getFocusable();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFn();
  });
  overlay.innerHTML = `<div class="modal-box" style="max-width:${maxWidth}">
    <button class="modal-close" data-modal-close type="button" aria-label="Fechar modal" title="Fechar">&times;</button>
    ${content}
  </div>`;
  const _closeBtn = overlay.querySelector('[data-modal-close]');
  if (_closeBtn) _closeBtn.addEventListener('click', closeFn);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  overlay._cleanup = () => document.removeEventListener('keydown', onKey);
  const focusables = getFocusable();
  if (focusables.length > 1) focusables[1].focus();
  else if (focusables.length) focusables[0].focus();
  return overlay;
}

/**
 * Generate HTML for a currency input with R$ prefix.
 * @param {string} id - Input element ID
 * @param {string} [placeholder='0,00']
 * @returns {string} HTML string
 */
export function currencyInputHTML(id, placeholder = '0,00') {
  return `<div class="currency-wrap">
    <span class="currency-prefix">R$</span>
    <input id="${id}" type="text" inputmode="decimal" placeholder="${placeholder}" oninput="formatCurrencyInput(this)">
  </div>`;
}

/**
 * Format input value as Brazilian currency (1.234,56).
 * Attached to window for onclick compatibility.
 * @param {HTMLInputElement} input
 */
export function formatCurrencyInput(input) {
  const cursorPos = input.selectionStart;
  const oldLen = input.value.length;
  let v = input.value.replace(/[^\d,.]/g, '');
  const parts = v.split(',');
  if (parts.length > 2) {
    v = parts.slice(0, -1).join('') + ',' + parts[parts.length - 1];
  }
  const [intRaw, dec] = v.split(',');
  const intClean = (intRaw || '').replace(/\./g, '');
  const intFormatted = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  input.value = dec !== undefined ? intFormatted + ',' + dec.substring(0, 2) : intFormatted;
  const diff = input.value.length - oldLen;
  input.setSelectionRange(cursorPos + diff, cursorPos + diff);
}

/**
 * Parse Brazilian currency string to float.
 * "1.234,56" → 1234.56
 * @param {string} str
 * @returns {number|null}
 */
export function parseCurrency(str) {
  if (!str) return null;
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

// Expose formatCurrencyInput to window for inline oninput handlers
window.formatCurrencyInput = formatCurrencyInput;

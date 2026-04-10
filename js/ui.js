// ============================================
// MinhaVez — UI Utilities
// Shared modal, currency input helpers
// ============================================

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
  document.getElementById(id)?.remove();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'modal-overlay';
  if (zIndex !== 1000) overlay.style.zIndex = zIndex;
  const closeFn = () => {
    overlay.remove();
    if (onClose) onClose();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFn();
  });
  overlay.innerHTML = `<div class="modal-box" style="max-width:${maxWidth}">
    <button class="modal-close" data-modal-close title="Fechar">&times;</button>
    ${content}
  </div>`;
  const _closeBtn = overlay.querySelector('[data-modal-close]');
  if (_closeBtn) _closeBtn.addEventListener('click', closeFn);
  document.body.appendChild(overlay);
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

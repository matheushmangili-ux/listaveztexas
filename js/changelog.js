// ============================================
// MinhaVez — Changelog Popup
// Shared changelog display logic
// ============================================

/**
 * Show changelog popup if user hasn't seen the latest version.
 *
 * @param {Array} changelog - Array of { version, date, items: [{ icon, text }] }
 * @param {string} storagePrefix - localStorage key prefix (e.g. 'minhavez_update_seen_')
 * @param {object} [opts]
 * @param {function} [opts.createModal] - Optional createModal(id, html, config) function (tablet uses this)
 */
export function showChangelog(changelog, storagePrefix, opts) {
  const latest = changelog[0];
  if (!latest) return;

  const storageKey = storagePrefix + latest.version;
  if (localStorage.getItem(storageKey)) return;

  const listHtml = latest.items.map(c =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
      <i class="fa-solid ${c.icon}" style="font-size:14px;color:var(--accent);width:20px;text-align:center;flex-shrink:0"></i>
      <span style="font-size:13px;color:var(--text-secondary);line-height:1.3">${c.text}</span>
    </div>`
  ).join('');

  const dateStr = latest.date
    ? new Date(latest.date + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const contentHtml = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:28px;margin-bottom:8px">🎉</div>
      <h3 style="font-family:var(--font-mono);font-size:18px;font-weight:700;margin:0 0 4px">Novidades v${latest.version}</h3>
      <p style="font-size:12px;color:var(--text-muted);margin:0">Minha Vez foi atualizado!${dateStr ? ' — ' + dateStr : ''}</p>
    </div>
    <div style="margin-bottom:20px">${listHtml}</div>
    <button id="btnCloseChangelog" class="btn" style="width:100%;padding:12px;font-size:14px;font-weight:700;background:var(--accent);color:#060606;border:none;border-radius:var(--radius-sm);cursor:pointer">
      Entendi, vamos lá!
    </button>
  `;

  const closeFn = () => {
    localStorage.setItem(storageKey, '1');
    document.getElementById('changelogPopup')?.remove();
  };

  if (opts && opts.createModal) {
    // Tablet path: use existing createModal utility
    opts.createModal('changelogPopup', contentHtml, {
      zIndex: 1003,
      maxWidth: '400px',
      onClose: closeFn
    });
  } else {
    // Dashboard path: create overlay directly
    const overlay = document.createElement('div');
    overlay.id = 'changelogPopup';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1003;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
    overlay.innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius);padding:24px;max-width:400px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.4)">${contentHtml}</div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeFn(); });
    document.body.appendChild(overlay);
  }

  document.getElementById('btnCloseChangelog')?.addEventListener('click', closeFn);
}

/**
 * Set version text in header element.
 *
 * @param {Array} changelog - Same changelog array
 * @param {string} elementId - ID of the version display element
 */
export function setVersionLabel(changelog, elementId) {
  if (changelog[0]) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = 'v' + changelog[0].version;
  }
}

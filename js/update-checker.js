// ============================================
// MinhaVez — Update Checker
// Service worker registration + HTML hash polling
// Shared between tablet.html and dashboard.html
// ============================================

/**
 * Initialize service worker + HTML hash update detection.
 * Must be called from a regular <script> (not module) because
 * the SW registration needs to run early before DOM is ready.
 *
 * @param {string} pageUrl - The page to poll for changes (e.g. '/tablet.html')
 * @param {object} [opts]
 * @param {string} [opts.bannerText] - Banner CTA text
 */
function initUpdateChecker(pageUrl, opts) {
  const bannerText = (opts && opts.bannerText) || 'Atualização disponível — clique para atualizar';

  // ─── Service Worker ───
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (reg.waiting) window._showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) window._showUpdateBanner();
        });
      });
      setInterval(() => { reg.update().catch((err) => console.warn('[sw] update failed:', err)); }, 5 * 60 * 1000);
    }).catch((err) => console.warn('[sw] register failed:', err));
  }

  // ─── HTML Hash Polling ───
  let _pageHash = null;
  function checkForUpdate() {
    fetch(pageUrl, { cache: 'no-store', headers: { 'Range': 'bytes=0-512' } })
      .then((res) => res.text())
      .then((text) => {
        const hash = text.length + '|' + text.slice(0, 200);
        if (_pageHash === null) { _pageHash = hash; return; }
        if (hash !== _pageHash) window._showUpdateBanner();
      })
      .catch((err) => console.warn('[update-checker] poll failed:', err));
  }
  setTimeout(checkForUpdate, 3000);
  setInterval(checkForUpdate, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(checkForUpdate, 1000);
  });

  // ─── Banner ───
  window._showUpdateBanner = function() {
    if (document.getElementById('updateBanner')) return;
    const lastUpdate = sessionStorage.getItem('_updateClickedAt');
    if (lastUpdate && (Date.now() - parseInt(lastUpdate, 10)) < 10000) return;
    const banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.style.cssText = 'position:fixed;bottom:calc(16px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:90;background:var(--mv-primary,#1e40af);color:#fff;padding:10px 20px;border-radius:999px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(30,64,175,.35);cursor:pointer;animation:slideUpBanner .3s ease;max-width:calc(100vw - 32px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    banner.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> ' + bannerText;
    banner.addEventListener('click', () => {
      sessionStorage.setItem('_updateClickedAt', String(Date.now()));
      banner.textContent = 'Atualizando...';
      location.reload();
    });
    document.body.appendChild(banner);
    if (!document.getElementById('_updateBannerStyle')) {
      const style = document.createElement('style');
      style.id = '_updateBannerStyle';
      style.textContent = '@keyframes slideUpBanner{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(style);
    }
  };
}

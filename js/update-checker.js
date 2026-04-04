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
  var bannerText = (opts && opts.bannerText) || 'Atualização disponível — clique para atualizar';

  // ─── Service Worker ───
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      if (reg.waiting) window._showUpdateBanner();
      reg.addEventListener('updatefound', function() {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function() {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) window._showUpdateBanner();
        });
      });
      setInterval(function() { reg.update(); }, 5 * 60 * 1000);
    }).catch(function() {});
  }

  // ─── HTML Hash Polling ───
  var _pageHash = null;
  function checkForUpdate() {
    fetch(pageUrl, { cache: 'no-store', headers: { 'Range': 'bytes=0-512' } })
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var hash = text.length + '|' + text.slice(0, 200);
        if (_pageHash === null) { _pageHash = hash; return; }
        if (hash !== _pageHash) window._showUpdateBanner();
      })
      .catch(function() {});
  }
  setTimeout(checkForUpdate, 3000);
  setInterval(checkForUpdate, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) setTimeout(checkForUpdate, 1000);
  });

  // ─── Banner ───
  window._showUpdateBanner = function() {
    if (document.getElementById('updateBanner')) return;
    var lastUpdate = sessionStorage.getItem('_updateClickedAt');
    if (lastUpdate && (Date.now() - parseInt(lastUpdate)) < 10000) return;
    var banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--accent,#facc15);color:#060606;padding:12px 20px;border-radius:12px;font-family:Satoshi,sans-serif;font-size:14px;font-weight:600;display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,.3);cursor:pointer;animation:slideUpBanner .3s ease';
    banner.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> ' + bannerText;
    banner.addEventListener('click', function() {
      sessionStorage.setItem('_updateClickedAt', String(Date.now()));
      banner.textContent = 'Atualizando...';
      location.reload();
    });
    document.body.appendChild(banner);
    if (!document.getElementById('_updateBannerStyle')) {
      var style = document.createElement('style');
      style.id = '_updateBannerStyle';
      style.textContent = '@keyframes slideUpBanner{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(style);
    }
  };
}

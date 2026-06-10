// ============================================
// <mv-sidebar> — sidebar única dos 3 dashboards
// ============================================
// Uso (idêntico nos 3 dashboards; só muda o active-view):
//   <mv-sidebar active-view="overview"></mv-sidebar>     → dashboard.html
//   <mv-sidebar active-view="vendedor"></mv-sidebar>     → dashboard-vendedor.html
//   <mv-sidebar active-view="operacional"></mv-sidebar>  → dashboard-operacional.html
//
// Se `active-view` faltar/for inválido, detecta pela URL (mesma lógica do
// dashboard-init.js). Renderiza o <aside class="dash-sidebar" id="dashSidebar">
// REAL e se substitui (replaceWith) — o DOM final fica idêntico ao inline antigo,
// então dashboard-init.js (collapse, dropdown, auto-collapse, hrefs de
// linkTablet/linkSettings, logo white-label) e o CSS seguem funcionando sem
// nenhuma mudança.
//
// IMPORTANTE: carregar como <script defer> no <head> DEPOIS de mv-logo.js. Assim
// o componente é definido e materializa o aside (sincronamente, no upgrade) antes
// dos <script type="module"> do fim do <body> (dashboard-init.js) consultarem o DOM.

(function () {
  if (typeof customElements === 'undefined') return;
  if (customElements.get('mv-sidebar')) return;

  const VIEWS = ['overview', 'vendedor', 'operacional'];

  function detectView() {
    const path = (location.pathname || '').toLowerCase();
    if (path.includes('dashboard-vendedor')) return 'vendedor';
    if (path.includes('dashboard-operacional')) return 'operacional';
    return 'overview';
  }

  function sublink(view, href, label, active) {
    const cls = 'sidebar-sublink' + (active ? ' sidebar-sublink--active' : '');
    return `<a data-view="${view}" class="${cls}" href="${href}"><span class="sublink-dot"></span>${label}</a>`;
  }

  function template(activeView) {
    return `
      <!-- Brand -->
      <div class="sidebar-brand">
        <div class="dash-header-logo" id="headerLogo">
          <mv-logo size="M" wordmark></mv-logo>
        </div>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav">
        <span class="sidebar-section-label">Menu</span>
        <!-- Dashboard dropdown: Overview / Por Vendedor / Operacional -->
        <div class="sidebar-dropdown open" id="dashDropdown">
          <button
            type="button"
            class="sidebar-link sidebar-dropdown-trigger sidebar-link--active"
            data-tip="Dashboard"
            aria-expanded="true"
            onclick="window.toggleDashDropdown && window.toggleDashDropdown()"
          >
            <i class="fa-solid fa-chart-pie"></i>
            <span>Dashboard</span>
            <i class="fa-solid fa-chevron-down sidebar-chev"></i>
          </button>
          <div class="sidebar-dropdown-items">
            ${sublink('overview', 'dashboard.html', 'Visão Geral', activeView === 'overview')}
            ${sublink('vendedor', 'dashboard-vendedor.html', 'Por Vendedor', activeView === 'vendedor')}
            ${sublink('operacional', 'dashboard-operacional.html', 'Operacional', activeView === 'operacional')}
          </div>
        </div>
        <a id="linkTablet" href="#" class="sidebar-link" data-tip="Tablet">
          <i class="fa-solid fa-tablet-screen-button"></i>
          <span>Tablet</span>
        </a>
        <a
          id="linkAnnouncements" data-tip="Comunicados"
          href="#"
          class="sidebar-link"
          onclick="event.preventDefault(); window._dashAnnouncementsOpen && window._dashAnnouncementsOpen();"
        >
          <i class="fa-solid fa-bullhorn"></i>
          <span>Comunicados</span>
        </a>
        <a
          id="linkXpConfig" data-tip="Gamificação"
          href="#"
          class="sidebar-link"
          onclick="event.preventDefault(); window._dashXpConfigOpen && window._dashXpConfigOpen();"
        >
          <i class="fa-solid fa-bolt"></i>
          <span>Gamificação</span>
        </a>
        <a
          id="linkMissions" data-tip="Missões"
          href="#"
          class="sidebar-link"
          onclick="event.preventDefault(); window._dashMissionsOpen && window._dashMissionsOpen();"
        >
          <i class="fa-solid fa-bullseye"></i>
          <span>Missões</span>
        </a>
        <a
          id="linkVm" data-tip="VM Photos"
          href="#"
          class="sidebar-link"
          onclick="event.preventDefault(); window._dashVmOpen && window._dashVmOpen();"
        >
          <i class="fa-solid fa-camera-retro"></i>
          <span>VM Photos</span>
        </a>
        <a
          id="linkAi" data-tip="IA Assist"
          href="#"
          class="sidebar-link"
          onclick="event.preventDefault(); window._dashAiOpen && window._dashAiOpen();"
        >
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>IA Assist</span>
        </a>
        <a id="linkSettings" href="#" class="sidebar-link" data-tip="Configurações">
          <i class="fa-solid fa-gear"></i>
          <span>Configurações</span>
        </a>
      </nav>

      <div class="sidebar-spacer"></div>

      <!-- Footer -->
      <div class="sidebar-footer">
        <button
          class="sidebar-link sidebar-collapse-btn"
          data-tip="Expandir/Recolher"
          type="button"
          onclick="window.toggleSidebarCollapse && window.toggleSidebarCollapse()"
          aria-label="Recolher menu"
          title="Recolher menu"
        >
          <i class="fa-solid fa-angles-left"></i>
          <span>Recolher</span>
        </button>
        <button class="sidebar-link" data-tip="Rever tour" onclick="window.minhavezTour?.start('dashboard')" aria-label="Rever tour">
          <i class="fa-solid fa-circle-question"></i>
          <span>Rever tour</span>
        </button>
        <button class="sidebar-link sidebar-link--danger" data-tip="Sair" onclick="handleLogout()" aria-label="Sair">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>Sair</span>
        </button>
      </div>
    `;
  }

  class MvSidebar extends HTMLElement {
    connectedCallback() {
      if (this._rendered) return; // idempotente (evita duplicar em reconexão)
      this._rendered = true;

      let activeView = (this.getAttribute('active-view') || '').toLowerCase();
      if (!VIEWS.includes(activeView)) activeView = detectView();

      const aside = document.createElement('aside');
      aside.className = 'dash-sidebar';
      aside.id = 'dashSidebar';
      aside.innerHTML = template(activeView);

      // Substitui o <mv-sidebar> pelo <aside> real: DOM final idêntico ao inline
      // antigo, sem wrapper que quebraria o flex do .dash-layout.
      this.replaceWith(aside);

      // Drawer mobile (D4): backdrop fecha no clique fora; ESC também. O
      // backdrop é inerte fora do breakpoint (CSS só o ativa em <=768px).
      const backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      backdrop.addEventListener('click', () => aside.classList.remove('open'));
      aside.insertAdjacentElement('afterend', backdrop);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') aside.classList.remove('open');
      });
    }
  }

  customElements.define('mv-sidebar', MvSidebar);
})();

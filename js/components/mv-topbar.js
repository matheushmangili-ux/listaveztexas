// ============================================
// <mv-topbar> — topbar único dos 3 dashboards (B2 do design-audit)
// ============================================
// Uso (só muda o título):
//   <mv-topbar page-title="Visão Geral"></mv-topbar>     → dashboard.html
//   <mv-topbar page-title="Por Vendedor"></mv-topbar>    → dashboard-vendedor.html
//   <mv-topbar page-title="Operacional"></mv-topbar>     → dashboard-operacional.html
//
// Renderiza os 4 blocos REAIS (topbar-stripe, topbar-subhead, calendarPopover,
// topbar-filter-card) e se substitui por eles (replaceWith) — DOM final idêntico
// ao markup que era colado 3×, então dashboard-init.js (setPeriod, calendário,
// filtros, export, _ensureCalExtras, _positionCalPopover) e o CSS seguem
// funcionando sem mudança. Ids preservados: periodTabs, topbarSubhead,
// subheadTenant/City/Updated, customRangeLabel, calendarPopover, calMonthLabel,
// calGrid, calSelectionHint, filterSetor, filterVendedor, filterClearBtn,
// exportDropdown, exportMenu.
//
// Eventos via addEventListener (não onclick=) — os globals de dashboard-init.js
// são resolvidos NO CLIQUE (window.x?.()), porque o componente upgradeia antes
// dos <script type="module"> rodarem.
//
// Carregar como <script defer> no <head>, junto de mv-sidebar.js.

(function () {
  if (typeof customElements === 'undefined') return;
  if (customElements.get('mv-topbar')) return;

  function template(pageTitle) {
    return `
      <!-- Topbar Stripe: título + period chips -->
      <div class="topbar-stripe">
        <h1 class="topbar-title">${pageTitle}</h1>
        <div class="topbar-actions">
          <div class="period-tabs" id="periodTabs" role="tablist">
            <button data-period="hoje" class="active" type="button">Hoje</button>
            <button data-period="ontem" type="button">Ontem</button>
            <button data-period="semana" type="button">Semana</button>
            <button data-period="mes" type="button">Mês</button>
            <button data-period="custom" type="button" title="Período personalizado" style="position: relative">
              <i class="fa-solid fa-calendar-days icon-sm"></i>
            </button>
          </div>
        </div>
      </div>
      <!-- Subhead: tenant + cidade + atualizado há -->
      <div class="topbar-subhead" id="topbarSubhead">
        <span id="subheadTenant">—</span>
        <span class="sub-sep">·</span>
        <span id="subheadCity"><i class="fa-solid fa-location-dot"></i> —</span>
        <span class="sub-sep">·</span>
        <span>Atualizado há <span id="subheadUpdated">--</span></span>
        <span id="customRangeLabel" style="display: none; margin-left: 12px; color: var(--accent); font-weight: 600"></span>
      </div>
      <!-- Calendar Popover (posicionado via JS, ancorado no chip custom) -->
      <div id="calendarPopover" class="cal-popover" style="display: none">
        <div class="cal-header">
          <button class="cal-nav" data-cal-nav="-1" aria-label="Mês anterior" type="button">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span id="calMonthLabel" class="cal-month-label"></span>
          <button class="cal-nav" data-cal-nav="1" aria-label="Próximo mês" type="button">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        <div class="cal-weekdays">
          <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="cal-footer">
          <span id="calSelectionHint" class="cal-hint">Clique no dia inicial</span>
          <button class="cal-clear" type="button">Limpar</button>
        </div>
      </div>
      <!-- Filtros: Setor + Vendedor + Export -->
      <div class="topbar-filter-card">
        <div class="filter-bar">
          <label>Setor:</label>
          <select id="filterSetor">
            <option value="">Todos os setores</option>
          </select>
          <label>Vendedor:</label>
          <select id="filterVendedor">
            <option value="">Todos os vendedores</option>
          </select>
          <button class="filter-apply-btn" data-action="apply" type="button" title="Aplicar filtros">
            <i class="fa-solid fa-filter"></i> Aplicar
          </button>
          <button
            class="filter-clear-btn"
            id="filterClearBtn"
            data-action="clear"
            type="button"
            title="Limpar filtros"
            style="display: none"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="export-dropdown" id="exportDropdown">
          <button class="filter-apply-btn" data-action="export-toggle" type="button" title="Exportar dados">
            <i class="fa-solid fa-file-export"></i> Exportar
          </button>
          <div id="exportMenu" class="export-menu">
            <button data-action="export-csv" type="button">
              <i class="fa-solid fa-file-csv icon-success"></i> CSV
            </button>
            <button data-action="export-pdf" type="button">
              <i class="fa-solid fa-file-pdf icon-danger"></i> PDF
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function wire(nodes) {
    // Casa o próprio nó de topo OU um descendente (calendarPopover e
    // topbar-filter-card SÃO nós de topo — querySelector puro não os acharia).
    const $ = (sel) => {
      for (const n of nodes) {
        if (n.matches && n.matches(sel)) return n;
        const hit = n.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    };
    const closeExport = () => document.getElementById('exportMenu')?.classList.remove('open');

    // Período: chips fixos chamam setPeriod; o chip custom abre o calendário.
    $('#periodTabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      if (btn.dataset.period === 'custom') window.toggleCalendar?.(e);
      else window.setPeriod?.(btn.dataset.period);
    });

    // Calendário: navegação de mês + limpar.
    $('#calendarPopover')?.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-cal-nav]');
      if (nav) return window.calNav?.(Number(nav.dataset.calNav));
      if (e.target.closest('.cal-clear')) window.calClear?.();
    });

    $('#filterSetor')?.addEventListener('change', () => window.onSetorChange?.());

    // Filtros + export (delegado no card inteiro).
    $('.topbar-filter-card')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'apply':
          window.applyFilters?.();
          break;
        case 'clear':
          window.clearFilters?.();
          break;
        case 'export-toggle':
          document.getElementById('exportMenu')?.classList.toggle('open');
          break;
        case 'export-csv':
          window.exportCSV?.();
          closeExport();
          break;
        case 'export-pdf':
          window.exportPDF?.();
          closeExport();
          break;
      }
    });
  }

  class MvTopbar extends HTMLElement {
    connectedCallback() {
      if (this._rendered) return;
      this._rendered = true;

      const pageTitle = this.getAttribute('page-title') || document.title.split('—')[0].trim() || 'Dashboard';
      const tmp = document.createElement('div');
      tmp.innerHTML = template(pageTitle);
      const nodes = Array.from(tmp.children);
      wire(nodes);
      // Substitui pelo conjunto de blocos irmãos (sem wrapper, que quebraria o
      // layout do .dash-main — mesmo racional do replaceWith no mv-sidebar).
      this.replaceWith(...nodes);
    }
  }

  customElements.define('mv-topbar', MvTopbar);
})();

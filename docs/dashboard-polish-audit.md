# Dashboard UI — auditoria + plano de polish arquitetural

## Context

Após merge do PR #15 + 3 PRs de fix rápido (sidebar 404, hero labels, syntax ai-assist), user pediu análise completa da interface pra encontrar melhorias visuais, estéticas e de arquitetura. Auditoria cobriu [dashboard.html](../dashboard.html), [dashboard-vendedor.html](../dashboard-vendedor.html), [dashboard-operacional.html](../dashboard-operacional.html), [css/dashboard.v52.css](../css/dashboard.v52.css), [js/dashboard-init.js](../js/dashboard-init.js), [js/dashboard-charts.js](../js/dashboard-charts.js), [js/dashboard-vm.js](../js/dashboard-vm.js).

**Total: 28 problemas** — 8 críticos, 12 importantes, 8 nice-to-have.

---

## CRÍTICOS (arquitetura + limpeza)

### C1 — 6 modais com header duplicado

`dashboard.html:558-575, 587-604, 616-633, 870-887, 1059-1076, 1308-1325`

Seis modais (IA Assist, VM Photos, Missões, XP Config, Announcements, Missões VM) têm o **mesmo bloco de ~18 linhas** pro header com close button inline-styled. Total: ~108 linhas de duplicação.

**Fix:** criar classe `.modal-header` + `.modal-close-btn` em `css/dashboard.v52.css` e reduzir cada modal a:

```html
<div class="modal-header">
  <h3><i class="fa-solid fa-..."></i>Título</h3>
  <button class="modal-close-btn" onclick="..."><i class="fa-solid fa-xmark"></i></button>
</div>
```

### C2 — Modal widths hardcoded inline

`dashboard.html:558, 587, 616, 870, 1059, 1308`

6 modais com `style="max-width: 480px|540px|640px|720px"` inline.

**Fix:** classes utility `.modal-box--sm` (480), `.modal-box--md` (540), `.modal-box--lg` (640), `.modal-box--xl` (720). Remover inline styles.

### C3 — Status Marquee com 12 blocos de inline style

`dashboard.html:300-352`

Marquee "On Time + eventos" tem position, gradient, animation, color, font-size, padding — tudo inline. 52 linhas de markup pra algo que deveria ser 6.

**Fix:** extrair pra `.status-marquee`, `.marquee-label`, `.marquee-indicator`, `.marquee-track` em CSS. Keyframes `pulseGlow` e `marqueeHeader` já existem em `css/dashboard.v52.css:1465, 1482`.

### C4 — Legacy kpiCmp divs mortos no DOM

`dashboard.html:404-409, 423, 434, 445`

6 `<div id="kpiXxxCmp">` com `display:none` que eram compat pre-redesign. Ninguém lê mais.

**Fix:** remover do HTML + remover referências `renderCompare(...)` em `js/dashboard-charts.js:492-499`. Se `renderCompare` ficar órfã, deletar também.

### C5 — Form labels repetidos (missions + XP config)

`dashboard.html:681-821, 896-980`

Cada `<label>` no mission form tem ~15 linhas de inline style idênticas (gap, font-size, color, flex-direction). 15+ repetições.

**Fix:** promover o padrão `.vm-field` + `.vm-field-label` + `.vm-input` (já existe pro VM Photos) pra um sistema genérico `.form-field` e aplicar em missions + XP config.

### C6 — Inline color/size/display em ícones

`dashboard.html:199, 286, 294, 457, 481, 492, 501, 561, 590, 619, ...`

~20 ocorrências de `style="font-size: 10px"`, `style="color: var(--success)"`, `style="margin-right: 6px; color: var(--accent-dim)"`.

**Fix:** classes utility `.icon-sm`, `.icon-accent`, `.icon-success`, `.icon-danger`, `.icon-info`, `.chart-header-icon` (combina margem + cor).

### C7 — 28 `!important` em dashboard.v52.css

Principais ofensores: `.cal-day.range-start`, `.chart-card-body.collapsed`, `.sidebar-dropdown-trigger`. Débito de specificity.

**Fix:** auditoria — reduzir de 28 pra ~14. Manter só onde realmente precisa sobrescrever cascade externa.

### C8 — Export menu inline positioning

`dashboard.html:271-297`

Wrapper com `style="position: relative; display: inline-block"`, menu usa `.open` class toggle mas wrapper não tem classe.

**Fix:** `.export-dropdown` wrapper + `.export-dropdown__menu` (BEM-ish). Remove inline.

---

## IMPORTANTES (polish + consistência)

### I1 — Sub-pages sem paridade visual

`dashboard-vendedor.html:186`, `dashboard-operacional.html:186`

"Por Vendedor" e "Operacional" têm topbar igual mas **sem KPI hero** nem cards resumo. Sentem vazias comparadas à Visão Geral.

**Fix:** adicionar mini-KPI hero específico por sub-page (vendedor: top performer + delta vs média; operacional: maior gargalo + duração média).

### I2 — Empty states inconsistentes

Sub-pages (operacional) têm texto hardcoded "Nenhuma ruptura..." em vez de usar `.chart-empty-state`.

**Fix:** padronizar `.chart-empty-state` nas 3 páginas.

### I3 — Loading states ausentes

Charts populam de vazio → dado sem skeleton. "Content jump" desagradável.

**Fix:** adicionar `.hero-card--loading`, `.chart-box--loading` com shimmer (mv-loader component existe).

### I4 — Responsive gap 1200px→900px

`css/dashboard.v52.css:301-312`

`.hero-kpi` é 3 cols desktop, 1 col <768px. Entre 768-1200px fica **comprimido** (3 cols esmagados).

**Fix:** `@media (max-width: 1200px) { .hero-kpi { grid-template-columns: repeat(2, 1fr); } }`.

### I5 — Filter bar quebra em mobile

`.topbar-filter-card` usa `flex-wrap: wrap` sem breakpoint < 640px.

**Fix:** media query `max-width: 640px` com stack vertical.

### I6 — Refresh countdown visualmente competindo

`css/dashboard.v52.css:2259-2272`

`.refresh-countdown` com `color: var(--accent)` full opacity concorre com KPIs.

**Fix:** `color: var(--text-muted)` ou opacity 0.6.

### I7 — Sidebar dropdown state não persiste

Recarrega página → dropdown fecha mesmo que user tinha aberto.

**Fix:** salvar em `sessionStorage['mv-sidebar-dropdown-open']` no toggle; restaurar no init.

### I8 — Chart icon colors inconsistentes

Alguns `--accent-dim`, outros `--accent`, outros `--danger`/`--info` sem padrão semântico.

**Fix:** convenção — `--accent` pra primários, `--accent-dim` pra secundários, `--danger` pra motivos de perda, `--info` pra origem/canais.

### I9 — Modal backdrop opacity hardcoded

`css/dashboard.v52.css:1267` — `rgba(0, 0, 0, 0.55)` fixo.

**Fix:** token `--modal-backdrop` no :root.

### I10 — Topbar subhead fragil <480px

Metadata separada por `·` quebra mal em 320-480px.

**Fix:** stack vertical + esconder separadores.

### I11 — Missions form triplicado

`dashboard.html:637-692` e idêntico nas 2 sub-pages.

**Fix:** extrair via `<template id="missionsFormTpl">` clonado em runtime. Evita drift.

### I12 — Tour selectors guard nas sub-pages

Steps podem referenciar elementos que não existem em vendedor/operacional.

**Fix:** guard `if (document.querySelector(step.element)) steps.push(step)` em `js/tour.js`.

---

## NICE-TO-HAVE (micro-polish)

### N1 — "On Time" marquee label hardcoded

Texto fixo. Deveria refletir estado real de sync.

### N2 — Period tabs sem underline active

Active só background — pouco claro. Adicionar `border-bottom: 2px solid var(--accent)`.

### N3 — Sidebar chevron easing bounce

`cubic-bezier(0.16, 1, 0.3, 1)` — trocar pra `cubic-bezier(0.4, 0, 0.2, 1)`.

### N4 — Topbar title font-size mágico (26px)

Token `--size-h1`.

### N5 — Empty state icon opacity 0.25 → invisível no light

Aumentar pra 0.45.

### N6 — Marquee padding-left 120px hardcoded

CSS var ou flexbox sem padding mágico.

### N7 — Export icons CSV/PDF com cor inline

Classes `.icon-csv`, `.icon-pdf`.

### N8 — Sidebar "Rever tour" mal posicionado

Considerar mover pra settings ou badge "?" no topbar.

---

## Plano de execução (ordem sugerida)

**Leva 1 — Arquitetura core** (~2h)

- C1 + C2 (modais header unificado + max-width classes) — remove ~120 linhas
- C3 (marquee refactor) — 50 linhas → 8
- C4 (kpiCmp cleanup) — delete legacy
- **Commit único.** HTML perde ~200 linhas.

**Leva 2 — Utility classes + clean inline** (~1.5h)

- C5 (form-field system)
- C6 (icon utility classes)
- C8 (export dropdown classes)
- **Commit único.** dashboard.html perde ~80 linhas inline.

**Leva 3 — CSS health** (~2h)

- C7 (!important audit: 28→~14)
- I8 (chart icon colors — convenção semântica)
- I9 (backdrop token)
- N3, N4, N5 (easing, size, opacity)
- **Commit único.**

**Leva 4 — Responsividade** (~1.5h)

- I4 (2-col tablet hero-kpi)
- I5 (filter mobile stack)
- I10 (subhead mobile)
- I6 (countdown soften)
- **Commit único.** Dashboard ok em 320-1920px.

**Leva 5 — Empty/loading + sub-page parity** (~2h)

- I2 (empty states padrão)
- I3 (skeleton loading)
- I1 (mini-KPI hero sub-pages)
- I11 (missions template partial)
- I12 (tour selectors guard)
- **Commit único.**

**Leva 6 — Micro-polish** (~1h)

- I7 (dropdown persist)
- N1, N2, N6, N7, N8 (micro fixes)
- **Commit único.**

**Total: ~10h** em 6 commits shippable independentemente.

---

## Risco

- **Baixo** pra levas 1-4: CSS/HTML refactor com comportamento idêntico.
- **Médio** pra leva 5: adicionar elementos novos nas sub-pages requer decisão de produto ("qual KPI mostrar em Por Vendedor como hero?").
- **Baixo** pra leva 6.

Reverter qualquer leva = `git revert <hash>`.

## Verificação por leva

Cada commit push → Vercel 1min redeploy → testar em janela anônima:

1. **Leva 1:** 6 modais abrem/fecham, visual idêntico. Marquee roda suave.
2. **Leva 2:** Forms Missions e XP Config renderizam ok. Export menu funciona.
3. **Leva 3:** Visual igual, só CSS interno mudou. Testar dark + light.
4. **Leva 4:** Redimensionar 1920→320px sem quebras.
5. **Leva 5:** Sub-pages com hero KPI, empty states consistentes, skeleton na primeira carga.
6. **Leva 6:** Dropdown state restaura após reload. Period tabs active visualmente claro.

# Polish Plan — Final Version (app inteiro)

## Context

Auditoria de polimento de front-end cobrindo as **4 surfaces** rumo a uma "final version":

- **Dashboard** — [dashboard.html](../dashboard.html), [dashboard-vendedor.html](../dashboard-vendedor.html), [dashboard-operacional.html](../dashboard-operacional.html), [css/dashboard.v52.css](../css/dashboard.v52.css)
- **Vendor** (mobile) — [vendor.html](../vendor.html), [css/vendor.v52.css](../css/vendor.v52.css), `js/vendor-*.js`
- **Tablet** (kiosk) — [tablet.html](../tablet.html), [css/tablet.v52.css](../css/tablet.v52.css), `js/tablet-*.js`
- **Landing/Auth** — [landing.html](../landing.html), [index.html](../index.html), [setup.html](../setup.html), [settings.html](../settings.html)
- Base compartilhada — [css/styles.v52.css](../css/styles.v52.css), [css/tokens.css](../css/tokens.css)

Sucessor do [dashboard-polish-audit.md](./dashboard-polish-audit.md) (escopo só dashboard, **majoritariamente já shipado** — `.modal-header`, `.chart-empty-state`, sistema de skeleton e `.form-field` já existem no código). Este doc cobre o que falta no app todo.

## Diagnóstico

A fundação é **madura**: tokens bem estruturados ([tokens.css](../css/tokens.css)), paleta roxa, paridade dark/light, grid 8pt, cores semânticas, e já existe infra de a11y/estado parcial (bloco `:focus-visible` em [styles.v52.css:885](../css/styles.v52.css), `.empty-state` + `.skeleton-*` em [styles.v52.css:907](../css/styles.v52.css)). **A distância até a final version não é redesign — é acabamento e consistência.** Três padrões se repetem nas 4 surfaces:

1. **Cores hardcoded furando os tokens** — pior caso: `color: #060606` em botões/CTAs, que quebra contraste no light mode.
2. **`:focus-visible` incompleto** — o bloco global cobre `button`/`a`/`.btn`/`.vendor-*`, mas **não** alcança componentes custom de tablet/vendor que são `<div>` interativos (sem `tabindex`, nem focáveis).
3. **Estados incompletos** — `disabled` só com opacity, e a infra de empty/skeleton existe mas é pouco aplicada.

Mais os pontos específicos de mobile, kiosk, charts e formulários.

---

## A — Acessibilidade

### A1 — Formulários de auth sem associação label/erro `[landing/auth]`

[index.html](../index.html) — PIN inputs sem `aria-label`; labels de email/senha sem `for`; `#loginError` sem `role="alert"`; cores de label hardcoded `#71717a` (fraco no light).

**Fix:** `aria-label` por dígito de PIN + `role="group"`; `for`/`id` nos labels; `role="alert"` no erro; `aria-invalid` nos inputs ao errar; label color → `var(--text-secondary)`. _(parcialmente iniciado — PIN/erro já editados)_

### A2 — `:focus-visible` não cobre componentes custom `[tablet, vendor, dashboard]`

[styles.v52.css:885](../css/styles.v52.css) lista `button`/`a`/`.btn`/`.vendor-*`, mas faltam `.setor-tab`, `.queue-item`, `.footer-card`, `.atend-card`, `.outcome-option`, `.rp-chip`, `.vendor-tab`, `.vendor-outcome-btn`, `.vendor-pausa-btn`, `.vendor-canal-btn`, `.vendor-more-item`, `.period-tabs button`, `.filter-apply-btn`.

**Fix:** estender a lista de seletores `:focus-visible`. Para os que são `<div>` interativos (ex: `.queue-item`, `.outcome-option`), adicionar `tabindex="0"` + `role="button"` no markup — senão nem são focáveis por teclado.

### A3 — Estado `disabled` fraco demais `[base, todas]`

[styles.v52.css:248](../css/styles.v52.css) — `.btn:disabled { opacity: 0.4 }`. No tablet/kiosk sob luz forte, 0.4 some; usuário toca botão "desabilitado".

**Fix:** além de opacity, dessaturar + borda (`filter: grayscale(0.4)`, `border: 1px solid var(--border-medium)`), e subir opacity p/ ~0.55. Override por surface se necessário.

### A4 — Link de contraste insuficiente no light `[landing/auth]`

[index.html:282](../index.html) — `a, .cta-link { color: #a78bfa }` (purple-400) → ~2.7:1 sobre card branco, falha AA.

**Fix:** `var(--accent)` (theme-aware) ou `var(--accent-dim)` no light.

---

## T — Tokens & paridade light/dark

### T1 — `color: #060606` em botões e CTAs `[todas]`

[styles.v52.css:255,263,271,279](../css/styles.v52.css) (`.btn-primary/success/danger/warning`), [vendor.v52.css](../css/vendor.v52.css) ~`452,541,1728,1772`, tablet `650,864,1252`. Preto fixo vira "preto sobre escuro" no light.

**Fix:** `var(--accent-ink)` nos botões accent. **Atenção:** para success/warning/danger, `--accent-ink` é branco no light e pode reduzir contraste sobre verde/amarelo — avaliar token de ink próprio por cor (ou manter escuro nesses casos). Não é um find-and-replace cego.

### T2 — Overlays de modal/bottom-sheet sem override light `[tablet]`

[tablet.v52.css:2071](../css/tablet.v52.css) — `rgba(0,0,0,0.4)` funciona no dark; no brilho da loja some.

**Fix:** `[data-theme='light'] .bottom-sheet-overlay, .modal-overlay { background: rgba(0,0,0,0.25) }`.

### T3 — Sombras `inset` brancas invisíveis no light `[tablet, base]`

`inset 0 1px 0 rgba(255,255,255,…)` em cards/hover (tablet ~2200, tokens dark). No light vira branco-sobre-branco.

**Fix:** override light com `inset 0 1px 0 rgba(0,0,0,0.03)`.

### T4 — Cores hardcoded soltas `[todas]`

Footer `#a1a1aa` (dashboard) → `--text-muted`; `.dash-main #1a1a1a` ([dashboard.v52.css:207](../css/dashboard.v52.css)) → `--bg-deep`; badges `#e89b8a` (vendor 333); tooltips de chart `#1e1e2e/#262638` → `--bg-card`/`--bg-elevated`; avatares/deltas hardcoded na landing.

**Fix:** sweep → tokens. **Guarda-chuva:** regra de lint barrando hex cru em CSS pra não regredir.

---

## E — Estados (loading / empty / feedback)

### E1 — Charts sem skeleton/empty `[dashboard]`

Só "Motivos de Perda" tem empty state. Os demais charts populam do vazio (content jump).

**Fix:** aplicar `.skeleton-block` (já existe, [styles.v52.css:984](../css/styles.v52.css)) + `.empty-state` nos charts restantes (Hourly, Trend, Scatter, Tempo).

### E2 — Upload de VM sem progresso `[vendor]`

`submitExecution()` ([js/vendor-vm.js](../js/vendor-vm.js) ~447) só troca texto p/ "Enviando…". Foto até 12MB em 3G = usuário acha que travou.

**Fix:** barra/spinner de progresso por foto; estado de erro com retry.

### E3 — Empty states sem skeleton no cold start `[vendor, tablet]`

Missões/fotos (vendor) e fila vazia (tablet) somem sem distinguir "carregando" de "vazio".

**Fix:** skeleton durante fetch; empty-queue do tablet com hierarquia + CTA ("abra o turno").

---

## M — Ergonomia mobile & kiosk

### M1 — Touch targets < 48px `[vendor]`

[vendor.v52.css](../css/vendor.v52.css) — `.vendor-icon-btn` 38×38 (~304), `.vendor-icon-btn-pref` 40×40 (~485). Abaixo de `--touch-min:48px`.

**Fix:** subir p/ 48px (ou área de toque via padding).

### M2 — Sem `:active` (feedback de toque) `[vendor]`

`.vendor-outcome-btn`, `.vendor-pausa-btn`, `.vendor-canal-btn` ([vendor.v52.css:754-819](../css/vendor.v52.css)) sem `:active`.

**Fix:** `:active { transform: scale(0.97) }` coerente com `.btn`.

### M3 — Safe-area: último card sob a tabbar `[vendor]`

`.vendor-main` ([vendor.v52.css:350](../css/vendor.v52.css)) sem `padding-bottom` que conte a altura da tabbar fixa + `env(safe-area-inset-bottom)`.

**Fix:** `padding-bottom: calc(20px + 52px + env(safe-area-inset-bottom))`.

### M4 — Ação destrutiva sem confirmação `[tablet]`

`.footer-end-all` ([tablet.v52.css:613](../css/tablet.v52.css)) encerra todos os atendimentos em 1 toque.

**Fix:** passo de confirmação (2-step ou press-and-hold).

### M5 — Chips de ruptura pequenos + sidebar do dashboard esmaga `[tablet, dashboard]`

`.rp-chip` 36px (tablet ~44); sidebar fixa `232px` ([dashboard.v52.css:16](../css/dashboard.v52.css)) sem breakpoint <1024px.

**Fix:** chips ≥44–48px; breakpoint que colapsa sidebar em notebook/tablet.

---

## D — Movimento & delight

### D1 — Animações de XP/tier "flat" `[vendor]`

`showXpToast`/`showLevelUp`/`showTierUp` ([js/vendor-xp.js:140-207](../js/vendor-xp.js)) só fade; tier-up (milestone grande) sem escala/pulse.

**Fix:** entrada com scale/bounce, pulse no ícone de tier; manter som/vibração existentes.

### D2 — Transições faltando + reduce-motion `[todas]`

Ícone de tema troca instantâneo; vários hover/active sem `--transition`. Sem `prefers-reduced-motion`.

**Fix:** transição no toggle de tema; aplicar `--transition` onde falta; bloco `@media (prefers-reduced-motion: reduce)` neutralizando animações.

---

## R — Refactor / débito

### R1 — Dashboard 3-HTML ~95% idêntico `[dashboard]`

~2.100 linhas duplicadas (sidebar + modais) entre as 3 páginas.

**Fix:** extrair sidebar + modais p/ render JS ou web component compartilhado (padrão `mv-logo`/`mv-loader` já existe). Reduz bug de dessincronia.

### R2 — Cache bust v52 → v53 `[infra]`

Após mudanças de CSS, bump de versão nos nomes + refs nos HTMLs + service worker (convenção do repo, CLAUDE.md).

---

## Plano de execução (Levas)

**Leva 1 — Acessibilidade** (~2h) · `A1 A2 A3 A4`
Foco visível completo + formulários de auth + disabled forte + contraste de link. Base de tudo, maior impacto. **Commit único.**

**Leva 2 — Tokens & paridade light/dark** (~2.5h) · `T1 T2 T3 T4`
Sweep de cores hardcoded → tokens, overrides light que faltam, lint anti-hex. **Commit único.** Risco de contraste em T1 — testar dark + light.

**Leva 3 — Estados** (~2h) · `E1 E2 E3`
Skeleton/empty nos charts, progresso de upload, cold-start states. **Commit único.**

**Leva 4 — Ergonomia mobile/kiosk** (~2h) · `M1 M2 M3 M4 M5`
Touch targets, `:active`, safe-area, confirmação destrutiva, breakpoints. **Commit único.**

**Leva 5 — Movimento & delight** (~1.5h) · `D1 D2`
Animações de XP/tier, transições, `prefers-reduced-motion`. **Commit único.**

**Leva 6 — Refactor & cache bust** (~2.5h) · `R1 R2`
Consolidar dashboard 3-HTML, bump v52→v53. **Commit único.** Maior risco estrutural — fazer por último.

**Total: ~12.5h** em 6 commits revertíveis independentemente.

## Risco

- **Baixo:** Levas 1, 3, 5 (aditivo / estados / motion).
- **Médio:** Leva 2 (contraste do ink em success/warning/danger) e Leva 4 (markup com `tabindex`/`role` pode mudar foco/tab order).
- **Médio-alto:** Leva 6 (refactor estrutural do dashboard — testar as 3 páginas).

Reverter qualquer leva = `git revert <hash>`.

## Verificação por leva

Push → Vercel ~1min → testar em janela anônima (SW cacheia agressivo — hard refresh):

1. **Leva 1:** Tab navega com anel visível em todas as surfaces; leitor de tela anuncia erro de login; botões disabled claramente inertes; teclado opera fila/outcome do tablet.
2. **Leva 2:** Visual idêntico, **dark + light**; nenhum texto/ícone some no light; overlays visíveis sob luz.
3. **Leva 3:** Primeira carga mostra skeleton; charts/listas vazias com empty state; upload de foto mostra progresso e trata erro.
4. **Leva 4:** Alvos ≥48px no celular; feedback de toque; último card não fica sob a tabbar; "encerrar todos" pede confirmação; 320→1920px sem quebras.
5. **Leva 5:** XP/level/tier com animação; toggle de tema transiciona; `prefers-reduced-motion` neutraliza.
6. **Leva 6:** 3 páginas do dashboard idênticas e em sincronia; nova versão de CSS carrega (sem servir cache velho).

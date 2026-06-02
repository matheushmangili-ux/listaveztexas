# Plano de refatoração — itens pesados (pra fazer com calma)

> Data: 2026-06-02. Base: auditoria com 3 agentes (código morto, duplicação,
> qualidade) + verificação manual. **Feito nesta passada** (commit "refactor"):
> consolidação de `escapeHtml`/`toast` duplicados nos 3 módulos de dashboard +
> remoção de CSS morto (`.sidebar-info*`, `.kpi-head/main/main-left/spark*`).
>
> Este doc lista o que **NÃO** foi feito por ser arriscado/grande perto do
> launch — fazer depois, com calma e verificação.

---

## Importante: o que NÃO mexer (verificado, falso-positivo dos agentes)

- **Tokens `--*-deep`** (`--danger-deep`, `--warning-deep`, `--info-deep`): são
  lidos em runtime no `dashboard-charts.js` via `_cssVar()`. `--success-deep` é
  escrito pelo `tenant.js` (white-label). NÃO remover — não aparecem como
  `var(--x)` literal, mas estão em uso.
- Lição: todo "não usado" precisa de grep próprio incluindo leitura dinâmica
  (`_cssVar`, `setProperty`, classes adicionadas via JS, `onclick` em HTML).

---

## P1 — Médio valor, médio risco (próxima sessão de refactor)

### R1 · Consolidar os 3 dashboards HTML (sidebar duplicada)

- **Problema:** `dashboard.html`, `dashboard-vendedor.html`,
  `dashboard-operacional.html` têm a sidebar ~95% idêntica (~128 linhas × 3) e o
  `<head>` ~96% idêntico (~43 × 3). Só muda o item ativo (`data-view` +
  `--active`) e o `<title>`.
- **Proposta:** Web Component `<mv-sidebar active-view="vendedor">` (como o
  `<mv-logo>`). Move ~256 linhas pra 1 lugar; marca o ativo via atributo.
- **Risco:** MÉDIO — se o componente falhar no load, a navegação some. Precisa
  de fallback + teste nas 3 páginas (dark/light, colapsado/expandido). O
  `dashboard-init.js` (sidebar collapse, auto-collapse) precisa continuar
  achando os elementos.
- **Head:** aceitar como está (sem bundler, extrair fica feio). Documentar:
  "mudou o head de um dashboard? replicar nos 3".

### R2 · `showError` genérico em `ui.js`

- **Problema:** `showError(msg)` quase idêntico em `dashboard-announcements.js`
  e `dashboard-missions.js` (difere só no id da box: `annError`/`missionError`).
- **Proposta:** `setErrorBox(elementId, msg)` em `ui.js`; chamar
  `setErrorBox('annError', e?.message)`. ~20 linhas economizadas.
- **Risco:** BAIXO. Não foi feito agora só pra limitar escopo.

### R3 · Extrair CSS de componentes (KPI, sidebar base) p/ arquivos modulares

- **Problema:** `.kpi-*`, `.sidebar-link` definidos/re-tocados em
  `styles.v52.css` + `dashboard.v52.css` + camadas "modernization v2/v3" que
  re-tocam os MESMOS seletores várias vezes (ex.: `.t-header-kpi-value` em 3
  blocos no `tablet.v52.css`).
- **Proposta:** consolidar as camadas (merge dos overrides repetidos no seletor
  base) e/ou `components-kpi.css` via `@import`. ~80–120 linhas mais enxutas.
- **Risco:** MÉDIO — cascata CSS é traiçoeira; precisa render before/after
  (harness) nas 4 superfícies. Fazer um seletor por vez, verificando.

---

## P2 — Baixo valor / cosmético (quando sobrar tempo)

- **R4 · Magic numbers → `constants.js`**: vários `setTimeout(...,3500)`,
  `setInterval(...,10000)` etc. espalhados. Centralizar é organização, mas
  ADICIONA linhas (não deixa "mais leve") — baixa prioridade.
- **R5 · Comentar os `catch (_) {}` silenciosos** sem comentário (charts, init)
  explicando por que é seguro ignorar.
- **R6 · `console.log` → `console.info`** onde é info pura (ex.:
  `vendor-home.js` push não suportado).
- **R7 · Rampa `--accent-50..950`**: passos não usados hoje. Manter (é um design
  ramp; remover é debatível) ou podar — baixo impacto.
- **R8 · Funções gigantes** (`finalize` 107L, `initAtendDrag` 116L em
  `tablet-atendimento.js`; `loadAll` em charts). Coesas; quebrar só com testes
  cobrindo — risco médio, ROI baixo sem suíte. NÃO fazer perto do launch.

---

## Higiene de infra

- **R9 · `vendor-onboard` (drift): ✅ RESOLVIDO (2026-06-02).** Era uma função
  deployada solta em produção (`v5`) que **não existia no repo**, com metadados
  divergentes do `create-vendor-auth` (criava o auth user **sem** `user_role` e
  **sem** `tenant_users` → logins de vendedor quebrados). Verificado por grep:
  **nenhuma UI a chamava** (o único caminho é `create-vendor-auth` em
  `settings.html`). Como o MCP não tem `delete_edge_function`, a decisão foi
  **versionar + neutralizar**: criado `supabase/functions/vendor-onboard/index.ts`
  como tombstone que responde **410 Gone** (`code: DEPRECATED`) e redeploy via MCP
  (`v6`). Confirmado por curl: `410`. Footgun eliminado e função deixou de ser
  fantasma. Caminho oficial segue `create-vendor-auth`.

---

## Regra de ouro deste refactor

Perto do launch, em código de UI sem testes: **só mexer no verificável**
(código morto comprovado por grep próprio, duplicação de função pura,
helpers compartilhados). Reestruturação grande (3 HTMLs, cascata CSS, quebrar
funções) fica documentada aqui pra fazer com calma + verificação visual.

# Plano — Qualidade dos gráficos, indicadores, hovers e sidebar (dashboard)

> Data: 2026-06-10. Pedido: "melhorar a qualidade da construção dos gráficos e
> indicadores, hovers, sidebar e etc". Diagnóstico feito no código (não em
> impressão) — o que existe, o que falta, e a ordem de ataque em levas.

---

## 0. O que JÁ é bom (e fica)

- `renderChart` com **fast-path de update** (sem flicker ao trocar período) +
  fallback destroy/recreate + `showChartError`.
- **Modal de expand** por card (`expandChart`) com botão injetado no hover.
- `buildTooltip` custom (HTML próprio, on-brand) — usado em **8 dos 13** charts.
- Skeleton shimmer nos **KPIs** (`.skeleton-kpi-*`).
- Deltas dos KPIs calculados com **scalars reais** (loadKPIs), countUp suave.
- Paleta via tokens (`--chart-1..7`, arco frio) lida em runtime → dark/light ok.

## 1. Diagnóstico — onde falta acabamento

| #   | Problema                                    | Evidência                                                                                                                                                               | Efeito visível                                                                                                                  |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Preset global magro**                     | `applyChartDefaults` só seta fonte+toolbar+animação; grid, eixos, tooltip theme, states (hover/active), stroke e legend são re-declarados (ou esquecidos) chart a chart | cada gráfico tem grid/eixo/legenda ligeiramente diferente — "colagem"                                                           |
| 2   | **5/13 charts com tooltip default** do Apex | `buildTooltip` em 8 de 13 `renderChart(`                                                                                                                                | tooltip branco padrão briga com o dark e destoa dos 8 custom                                                                    |
| 3   | **Animação re-dispara a cada update**       | `updateOptions(options, false, **true**, true)` + animations 600ms sempre                                                                                               | gráficos "dançam" a cada refresh/realtime; ignora `prefers-reduced-motion` (o reset CSS global não alcança animação JS do Apex) |
| 4   | **Sem skeleton nos charts**                 | skeleton só em KPI; cards montam vazios e o gráfico "puxa" depois                                                                                                       | pop/salto de layout no load e na troca de período                                                                               |
| 5   | **`chart-card:hover` duplicado**            | dashboard.v52.css linhas ~398 e ~3080 (+ variantes dark)                                                                                                                | duas fontes de verdade pro mesmo hover = drift garantido                                                                        |
| 6   | **Sidebar colapsada cega**                  | `.sidebar-collapsed` esconde labels; nenhum tooltip nos ícones                                                                                                          | usuário colapsa e perde a navegação                                                                                             |
| 7   | **Hovers de lista crus**                    | `.rupture-item` (Demanda/Leads/Rupturas) sem estado de hover                                                                                                            | listas interativas não respondem ao mouse                                                                                       |
| 8   | **Charts sem a11y**                         | containers sem `role="img"`/`aria-label`                                                                                                                                | leitor de tela pula os gráficos                                                                                                 |
| 9   | Empty-state de chart irregular              | `chartOrigemEmpty` é padrão próprio; outros charts somem ou ficam 0px                                                                                                   | inconsistência (G5 cobriu listas, não charts)                                                                                   |

## 2. As levas (D = dashboard polish)

### D1 — Fundação dos charts (o maior ROI)

- **Preset global rico** em `applyChartDefaults`: grid (`--chart-grid`, strokeDash),
  eixos (labels `--text-2xs`, cor `--chart-axis`, sem bordas duplas), legend
  (posição/fonte/markers padrão), `states.hover/active` (filtro sutil em vez do
  darken default), stroke padrão por tipo, `tooltip.theme` único.
- **Animação certa**: anima só na PRIMEIRA render (`updateOptions(..., animate:false)`
  nos updates); `speed` 400; **desligar tudo se `prefers-reduced-motion`**
  (checagem JS — o CSS global não alcança o Apex).
- **Skeleton de chart**: shimmer no `.chart-box` enquanto o loader roda
  (classe `.chart-box.is-loading::after` + remover no primeiro paint do chart).
- Consolidar o **`chart-card:hover` duplicado** numa regra só (elevação
  `--shadow-md` + borda `--border-medium`, dark/light via token).

### D2 — Tooltips & hovers 100%

- `buildTooltip` nos **13/13** charts, com formatos padronizados: moeda
  `fmtBRL`, percentual com 1 casa, tempo `formatTempo`, data pt-BR.
- Crosshair/marker padrão (linha `--border-strong`, marker com halo accent).
- **Hover de linha de lista**: `.rupture-item:hover` (bg `--bg-hover`, transição
  150ms) — Demanda/Leads/Rupturas/Pausas respondem ao mouse.
- Hover dos botões de ação (já existem nos leads) revisados pra mesma curva.

### D3 — Indicadores (KPIs)

- Delta com **seta + cor semântica** consistente nos 6 KPIs (↑ verde / ↓ vermelho,
  invertido onde queda é bom — ex.: tempo médio, não convertidos).
- `font-feature-settings 'tnum'` garantido nos valores (sem "dança" de dígito
  no countUp).
- Skeleton também nos **secondary KPIs** (hoje só nos hero).
- Tooltip nato nos deltas ("vs. período anterior: X → Y") via `title`/data-attr.

### D4 — Sidebar de gente grande

- **Tooltip no modo colapsado** (CSS-only: `data-tip` + `::after` posicionado;
  zero JS novo) pra cada item.
- `:focus-visible` nos links/botões (paridade com a leva A2 do app).
- **Transição suave** da largura no collapse (width + opacity dos labels,
  respeitando reduced-motion).
- Mobile: overlay escurecido atrás do drawer + fechar no clique fora/ESC.
- Revisar active-state do dropdown (sublink ativo + trigger destacado).

### D5 — A11y + extras (fecho)

- `role="img"` + `aria-label` descritivo em cada `.chart-box` ("Gráfico de
  evolução diária de atendimentos e vendas").
- Empty-state padrão de **chart** (reusar `.empty-state` do G5 dentro do
  chart-box, como o `chartOrigemEmpty` já faz — virar regra).
- Expand modal: botão **"Baixar PNG"** (Apex `dataURI()` — barato e útil pra
  lojista mandar no WhatsApp).
- (Opcional, medir antes) Lazy-render de charts below-the-fold via
  IntersectionObserver se o load do operacional pesar.

## 3. Ordem e esforço

| Leva   | Esforço | Resultado visível                                            |
| ------ | ------- | ------------------------------------------------------------ |
| **D1** | M       | todos os charts com a mesma cara; sem dança; sem pop de load |
| **D2** | M       | tooltip único e bonito em tudo; listas respondem ao mouse    |
| **D3** | S       | KPIs com leitura instantânea (seta/cor/contexto)             |
| **D4** | S/M     | sidebar colapsável de produto (tooltip + transição + mobile) |
| **D5** | S       | a11y + PNG export + empty-states de chart                    |

Cada leva: eslint + 102 testes + verificação no harness (fixtures/geometria,
screenshot quando o renderer colaborar) + bump SW + push autorizado.

## 4. Status

- [x] D1 — fundação dos charts (2026-06-10: preset rico aditivo c/
      reduced-motion, animate só na 1ª render, skeleton de chart, hover
      consolidado — CSSOM confirma 1 light + 1 dark + a regra do expand-btn)
- [x] D2 — tooltips & hovers (2026-06-10). Escopo HONESTO após reler as
      configs: trend/hourly/heros já tinham tooltips bem pensados (shared c/
      formatter por série; hero fixed topRight) — o que faltava neles era o
      theme, que a D1 resolveu no preset. Entregue de fato: hover nas listas
      (.rupture-item — pause-log já tinha), tooltip do tempoMeta em formatTempo
      ("1h 30min"), e a unificação de theme via D1. Crosshair global descartado
      (deep-merge em xaxis arriscaria clobber das configs por chart).
- [x] D3 — KPIs (2026-06-10): inversão semântica nos deltas (não convertidos e
      tempo médio caindo agora ficam VERDES — antes subiam verdes, errado) +
      tooltip "vs. período anterior: X → Y" nos 6. tnum já era global (body) e
      o skeleton de KPI era CSS morto (não aplicado nem nos heros) — countUp já
      suaviza; não implantado.
- [x] D4 — sidebar (2026-06-10): tooltip CSS-only no rail colapsado (11 itens,
      hover E foco), :focus-visible nos links, backdrop do drawer mobile com
      fecho por clique-fora e ESC (injetado pelo componente, inerte no desktop).
      Transição de largura já existia (grid 0.22s) — verificado, não refeito.
- [x] D5 — a11y + extras (2026-06-10): role="img" + aria-label automático em
      todo chart-box (via renderChart, sem editar 3 HTMLs), showChartError no
      padrão .empty-state (+ modificador --error), botão "Baixar PNG" no modal
      de expand (dataURI scale 2 — lojista manda no WhatsApp). Lazy-render
      deferido (medir antes).

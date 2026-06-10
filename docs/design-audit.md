# Auditoria UI/UX + Arquitetura de Layout — "tirar a cara de vibecoded"

> Data: 2026-06-10 (Fable 5). Levantamento com evidência numérica do repo, não
> impressão. Objetivo: o que falta pro produto parecer **desenhado por um time
> de produto**, não montado por prompts — priorizado por impacto visível.

---

## 1. Mapa do produto (superfícies)

| Superfície       | Arquivo(s)                                                         | Papel                                          | Estado                              |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------- |
| **Login**        | `index.html` (715 l)                                               | porta de entrada, spotlight + partículas       | bom (rebrand ok)                    |
| **Dashboard**    | `dashboard.html` (1088), `-vendedor` (1034), `-operacional` (1133) | gerência: KPIs, gráficos, demanda, leads       | funcional, **maior débito visual**  |
| **Settings**     | `settings.html` (2303)                                             | loja, equipe, canais, conta                    | monólito (CSS+JS inline)            |
| **Vendor (PWA)** | `vendor.html` (502) + `vendor-home.js` (1272)                      | celular do vendedor — **carro-chefe da etapa** | **a superfície mais limpa**         |
| **Tablet**       | `tablet.html` (429)                                                | recepção (kiosk)                               | **sendo descontinuado** nesta etapa |
| **Landing**      | `landing.html` (2923)                                              | marketing                                      | monólito, baixa prioridade          |
| Auth aux         | `forgot/reset/setup/termos/privacidade`                            | suporte                                        | ok                                  |

**Arquitetura de layout por superfície:**

- Dashboards: shell `dash-layout` = `<mv-sidebar>` (componente ✅) + `dash-main`
  (topbar stripe → subhead → filtros → grid de cards). **Topbar/calendário/filtros
  são markup colado 3×** (confirmei `periodTabs` + `calendarPopover` nos 3).
- Vendor: header (avatar+XP) → card de estado (fila/atendendo/pausa) → stats →
  tab bar inferior + **bottom sheets** pra tudo (padrão consistente e mobile-certo).
- Settings: tabs (geral/equipe/canais/conta) com seções `settings-section`.

## 2. O que já é sólido (não mexer)

- **`tokens.css` (229 l) é de gente grande**: rampa periwinkle completa, neutros
  slate, semânticos, paleta de chart fria documentada, 8pt grid, radius/shadow
  scale, `tnum`, `prefers-reduced-motion` global. A fundação EXISTE.
- Web components `<mv-logo>`/`<mv-sidebar>`/`<mv-loader>` — o caminho certo, já provado.
- Dark-first coerente com a marca grafite; paridade light pronta nos tokens.
- A11y recente (focus-visible, touch ≥48px, contraste) — feito nas levas A/M.
- `vendor.html` com **3** `style=` e **1** `onclick=` — prova que o time já sabe
  fazer limpo; o débito é legado, não cultura.

## 3. Diagnóstico — onde mora a "cara de vibecoded" (com números)

| Sintoma                     | Evidência                                                                                                 | Por que entrega "vibecoded"                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Estilo inline em massa**  | `style=`: operacional **111**, settings **106**, vendedor **102**, dashboard **91**                       | cada card é um one-off; hierarquia visual deriva entre telas                |
| **JS dentro do HTML**       | `onclick=`: **~126** nos dashboards+settings+tablet, com multi-statement dentro de atributo               | cheiro de protótipo; quebra CSP; intestável                                 |
| **Sem escala tipográfica**  | **447** `font-size: Npx` crus nos CSS (vendor 177, dashboard 155); 10/11/12/13/14/15/16/17px todos em uso | o olho percebe: títulos/labels mudam de peso e tamanho entre cards "iguais" |
| **Markup triplicado**       | topbar + calendário + filtros idênticos nos 3 dashboards                                                  | qualquer ajuste sai diferente em cada tela (e já saiu)                      |
| **Hex cru fora do tokens**  | **143** ocorrências (vendor 86, dashboard 27)                                                             | o roxo "voltar" foi exatamente isso; cor fora do sistema                    |
| **CDN não-pinado**          | `apexcharts@latest` nos **3** dashboards                                                                  | um release do Apex muda o visual do produto da noite pro dia                |
| **Monólitos**               | settings.html 2303 l (~500 de `<style>` + script gigante inline); `dashboard-charts.js` 1992 l            | atrito de manutenção → polish não acontece                                  |
| **Emoji em UI persistente** | 🎯👋🎉 em labels/mensagens fixas (não só toasts)                                                          | tom de demo; emoji é pra celebração, não pra cromo de interface             |
| **Radius/spacing à deriva** | 10/12/14/16px de radius misturados (tokens definem 8/14/20)                                               | quina diferente em cada card = "feito em momentos diferentes"               |

## 4. Recomendações

### A. Gráficas (o que o usuário VÊ) — em levas

- **G1 · Escala tipográfica como token** (o maior ROI visual). Adicionar ao
  tokens.css: `--text-2xs:10px · --text-xs:11px · --text-sm:13px · --text-base:14px
· --text-md:15px · --text-lg:17px · --text-xl:20px · --text-2xl:28px` + pesos
  padrão (títulos 700, labels 600 uppercase+tracking, corpo 400). Varrer **vendor
  primeiro** (carro-chefe), depois dashboards. Colapsar 12px→11/13 e 16px→15.
- **G2 · Anatomia única de card.** Hoje: `.chart-card`, `.settings-card`,
  `.vendor-sheet` + dezenas de headers/contadores inline. Criar primitivas:
  `.card`, `.card-header`, `.card-title`, `.card-kicker` (o contador 10px
  uppercase letterspaced que hoje é inline 3×), `.card-body`. Os cards de
  Demanda/Leads/Pausas viram instâncias, não one-offs.
- **G3 · Varredura de radius/spacing pros tokens.** Tudo pra 8/14/20 e 8pt grid.
  Quina e respiro consistentes são 50% do "parece produto".
- **G4 · Política de emoji**: só em toast/celebração (level-up, lead recuperado).
  Labels, títulos e mensagens fixas usam ícone (FA solid) ou nada.
  _Verificado na leva 1 (2026-06-10): o app JÁ cumpre — os achados eram conteúdo
  de mensagem WhatsApp (👋, vai pro cliente), toasts (⭐🎉), push (🎯) e medalhas
  de ranking (🥇🥈🥉 — iconografia de gamificação intencional). Nenhuma remoção;
  a política vale pra código novo._
- **G5 · Empty states padronizados**: um padrão único (ícone ghost + título +
  ação) — hoje cada card tem o seu, uns com ícone, outros não.
- **G6 · Hierarquia do dashboard** (anti "parede de cards"): linha de KPIs →
  2 gráficos hero (Evolução + Funil/Origem) → resto agrupado nas seções/tabs já
  existentes (`setChartTab`), colapsadas por padrão. Menos scroll, mais leitura.

### B. Arquitetônicas (o que sustenta o visual)

- **B1 · Pinar ApexCharts** (resolver o `@latest` de hoje pra versão exata) nos
  3 HTMLs. 5 min, elimina risco de drift visual silencioso. **Fazer já.**
- **B2 · `<mv-topbar>`**: extrair topbar+período+calendário+subhead pro padrão
  `mv-sidebar` (R1 provou o caminho). Mata a triplicação; o JS já é central
  (`dashboard-init.js`), só o markup é colado.
- **B3 · Settings sair do monólito**: `<style>` → `css/settings.v52.css`, script
  inline → `js/settings-init.js` (módulo). Sem mudar visual — só dar casa.
- **B4 · Fatiar `dashboard-charts.js`** (1992 l): `charts-core` (renderChart,
  paletas, tooltip) + `cards-demand` + `cards-leads` + `cards-pauses` + `trend`.
  Mecânico, baixo risco.
- **B5 · Stylelint anti-regressão**: proibir hex cru fora do tokens.css (143
  hoje; era o item T4 do final-polish) e `font-size` px fora da escala (warn).
  Trava o sistema pra não derreter de novo.
- **B6 · Guard de SW**: check no pre-push que falha se js/css/html mudou sem bump
  de `CACHE_VERSION` (foram 181→187 manuais só nesta semana — uma hora esquece).
- **B7 · onclick= → addEventListener** nas telas que sobrevivem (dashboards,
  settings). Tablet morre, não vale o retrabalho.

### C. O que **não** fazer agora (decisão consciente)

- **Bundler/framework**: não. Vanilla + SW está entregando; bundler é invisível
  pro usuário e adiciona atrito. Reavaliar só se o time crescer.
- **Redesign total**: não precisa. A identidade (periwinkle/grafite/M) é boa —
  o problema é **disciplina de aplicação**, não o design.
- **Landing (2923 l)**: depois do app. É marketing, troca-se inteira quando
  houver tempo.
- **Tablet**: congelar (zero investimento — está saindo de cena).

## 5. Ordem sugerida (impacto visível ÷ esforço)

| Leva  | Itens                                                              | Esforço | Resultado                             |
| ----- | ------------------------------------------------------------------ | ------- | ------------------------------------- |
| **1** | B1 (pin Apex) + G1 no vendor + G4 (emoji)                          | S       | carro-chefe com tipografia de produto |
| **2** | G2 (card anatomy) + G1 nos dashboards + G3                         | M       | dashboards param de parecer colagem   |
| **3** | B2 (mv-topbar) + B7 nos dashboards                                 | M       | 1 topbar, 3 telas; HTML limpo         |
| **4** | B3 (settings) + G5 (empty states) + B5 (stylelint) + B6 (guard SW) | M       | sistema travado contra regressão      |
| **5** | B4 (fatiar charts.js) + G6 (hierarquia dashboard)                  | M/L     | manutenção barata + leitura executiva |

Cada leva: lint + 102 testes + harness visual + bump SW + push autorizado.

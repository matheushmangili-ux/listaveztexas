# Changelog — Lista Vez Texas

## [v54] — 2026-04-28

### Refatoração visual completa (sistema de design v54)

Reescrita visual de **todas as 13 páginas + 1 nova** baseada no design
entregue via Claude Design (`ScreenLanding`, `ScreenLogin`, `ScreenDashboard`,
`ScreenTablet`, `ScreenFilaAoVivo`, `ScreenHistorico`, `ScreenSettings`).

**Sistema:** light only, branco + azul royal `#1e40af`, Inter + JetBrains Mono.

#### Fundação (6a0b19b)

- `css/tokens.v54.css` — paleta brand/slate/status, tipografia, espaçamento
  4-base, raio, sombras
- `css/components.v54.css` — utility classes `.mv-card`, `.mv-btn`, `.mv-chip`,
  `.mv-dot`, `.mv-wordmark`, `.mv-avatar`, `.mv-field`, `.mv-toggle`, `.mv-icon`
- `assets/icons/mv-sprite.svg` — 25 ícones Lucide-like (stroke 1.6px)

#### Páginas refatoradas

- **Auth** (a5e94c1, 9dbe658): index/login com layout split (azul royal à
  esquerda, form à direita), forgot/reset-password derivações
- **Legal** (0fd3417): privacidade + termos com tipografia clean, drop FA
- **Landing** (7539b29): -45% linhas (2986 → 1644), drop hero video,
  showcase slider; preserva pricing + modais Stripe/demo + analytics
- **Vendor** (44720a7): mobile-first com hero "Atendendo agora" — timer
  mono 88px no card azul royal, replicando o `ScreenTablet` do design
- **Tablet** (4a3147a): recepção landscape com queue panel + service panel
  - 9 bottom sheets
- **Fila ao vivo** (5b47053): nova página dark `/fila` ou `/:slug/fila` —
  monitor de TV com hero "Próximo a atender", atendendo agora, em seguida
- **Settings** (d7e5020): tabs Geral/Equipe/Canais/Conta
- **Setup** (7a106ad): onboarding 5-steps com progress bar mono
- **Dashboards** (a8f24fd, 2b1e627, e304255, c8f2982): 6-metric grid
  (Vendas em destaque azul) + 2-col charts (1.5fr/1fr e 1.2fr/1fr).
  CSS extraído pra `css/dashboard.v54.css` compartilhado entre os 3
  dashboards (overview / vendedor / operacional)

#### Limpeza

- Removidos: `styles.v52.css`, `dashboard.v52.css`, `tablet.v52.css`,
  `vendor.v52.css`, `theme-dark.css`, `theme-light.css`, `tokens.css`
  (legacy)
- Removido `<mv-logo>` web component em todas as páginas — substituído
  por `.mv-wordmark` inline
- Drop tema escuro do app (mantido só em `fila-ao-vivo.html` que é display
  público de TV)
- Drop Inter Tight, paleta lavanda (`#a78bfa`)

#### Preservação rigorosa

Todos os IDs, classes, `data-*` e funções globais que JS consome ficaram
intactos. Cada commit documenta exatamente o que foi preservado por página.
Charts ApexCharts, módulos de auth, Supabase realtime, Stripe checkout,
demo via WhatsApp — tudo continua funcionando.

## [v5.0] — 2026-04-07

### Segurança

- **XSS sanitizado** — dados dinâmicos em `innerHTML` passam por `escapeHtml()` em todo o sistema
- **Brute-force no PIN** — Edge Function `login-pin` bloqueia após tentativas inválidas via tabela de rate-limit
- **Webhook hardened** — `payment-webhook` com comparação timing-safe, replay protection e idempotência por `session_id`
- **CORS restrito** — Edge Functions aceitam apenas origens explicitamente listadas
- **Auditoria RLS completa** — todas as tabelas (`vendedores`, `atendimentos`, `pausas`, `turnos`, `configuracoes`, `tenants`, `tenant_users`, `onboarding_tokens`) com policies `get_my_tenant_id()`
- **`tenant_id NOT NULL`** — constraint adicionada via migration `11-tenant-id-not-null.sql`

### Stripe & Pagamentos

- **Fluxo ponta a ponta** — `create-checkout → payment-webhook → onboarding_token → email → setup wizard → provision-tenant`
- **Stripe IDs persistidos** — `stripe_customer_id` e `stripe_subscription_id` copiados para o tenant no provision
- **Portal de assinatura** — nova Edge Function `create-billing-portal` para gerenciar plano/cancelamento
- **Ciclo de vida completo** — `invoice.payment_failed`, `invoice.paid` e `customer.subscription.deleted` tratados no webhook

### Email & Onboarding

- **Welcome email** — disparado automaticamente após pagamento com link de setup (token 7 dias)
- **Setup-complete email** — enviado após wizard concluído com links do tablet e dashboard
- **Email de falha de pagamento** — notificação automática ao cliente

### Tablet (Operação)

- **Offline real** — `sw.js` network-first com cache fallback; banner persistente com reconnect exponencial
- **PWA habilitado** — `<link rel="manifest">` adicionado; tablet pode ser instalado como app
- **Fix SW crítico** — `logo-minhavez-web.png` → `logo-minhavez-new.png` (arquivo inexistente causava falha silenciosa no install)
- **Logo sem fundo preto** — `mix-blend-mode: screen` aplicado
- **Header limpo** — relógio removido, ícones KPI unificados em rosa, separadores revisados
- **Ação cards** — botões "Iniciar Turno" e "Ver Ranking" no header

### Setup Wizard

- **Step de criação de conta** — owner cria email/senha no último passo do wizard
- **Forgot/Reset password** — fluxo completo via Supabase magic link
- **Token validado** — wizard bloqueado sem token válido ou expirado

### Refatoração

- **Arquitetura modular** — `initModule(ctx)` com 4 objetos de estado (`state`, `ui`, `timers`, `dom`), `constants.js`, classes utilitárias
- **`SETOR_LABELS` removido** — labels derivados dinamicamente do `setor_id`
- **Dead code removido** — `clockEl`, `CLOCK_UPDATE_INTERVAL`, `timers.clock` eliminados após remoção do relógio

### Landing

- **Dark mode** — landing page com tema escuro completo
- **Pré-venda** — seção de planos + checkout Stripe integrado

---

## [v4.5] — 2026-03-31

### Dashboard

- **Calendário popover** — seleção de período personalizado direto no calendário (primeiro clique = início, segundo = fim), sem campos de data extras poluindo o layout
- **Filtro de período personalizado** — base para range de/até com `getRange()` adaptado
- **Gráfico Evolução Diária** — adicionada barra de Conversão (%) no eixo direito, dual y-axis funcional com ApexCharts mixed (bar + column)
- **Tooltips dark mode** — CSS global `[data-theme="dark"]` para todos os tooltips ApexCharts + tooltip custom do scatter usando `chartColors()`
- **Anotação "média/dia"** — reposicionada para `position: 'right'` para não cortar na borda
- **Menu Exportar** — corrigido dropdown cortado pelo `overflow: hidden` do header

### Tablet (Lista de Vez)

- **Dark mode opcional** — botão no header, light como padrão, 20+ cores convertidas para CSS variables, meta theme-color sincronizado
- **Fix drag para atendimento** — removido double-lock entre `withLock()` e `_doSendToAtendimento()`
- **Fix reorder congelando** — adicionado optimistic update local antes do RPC
- **Fix cancelar sem voltar posição** — adicionada invalidação de cache (`_lastQueueKey = ''`) antes de `scheduleRender()`
- **Logo** — aumentada de 22px para 30px sem comprometer header
- **Footer cards** — opacidade de `.25` para `.4` para melhor legibilidade

### Server-Side (Supabase RPCs)

- **`fechar_turno_seguro`** — fechamento atômico: finaliza atendimentos `em_andamento`, reseta vendedores, fecha turno
- **`cleanup_dados_orfaos`** — limpa atendimentos >8h, vendedores stuck, turnos de dias anteriores
- **`iniciar_atendimento_vendedor`** — validação de turno aberto + check de atendimento duplicado

---

## [v4.0] — 2026-03-25

### Tablet

- 12 melhorias de UX, gestão e modo TV
- Fix logo overlap, cards travando, varredura de performance
- Fix logo header, drag sem confirmação, cards mais visíveis
- Fix header cortado, click direto sem modal, botões compactos

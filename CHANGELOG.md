# Changelog — Lista Vez Texas

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

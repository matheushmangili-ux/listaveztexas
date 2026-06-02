# Plano de melhoria para o lançamento — minhavez

> Documento de planejamento. Data: 2026-06-01. Base: varredura do código real
> (vendor, ruptura, prontidão geral) + decisão de abrir o produto pro **mercado
> aberto (lançamento público self-serve)**.
>
> **Veredito honesto:** a fundação é sólida (RLS forte, auth limpo, multi-tenant
> por slug, Sentry em produção, corrente de cobrança Stripe já existente, vendor
> com loop real persistido no banco). **Não estamos a anos-luz** — estamos a um
> punhado de tarefas focadas de distância de abrir com segurança. Este plano
> separa o que é **bloqueador** do que é **diferencial** e do que é **pós-launch**.

---

## Resposta direta às 4 perguntas

### 1. Podemos migrar para o mercado livre (abrir pro público self-serve)?

**Quase — falta fechar o loop, não construir do zero.** A corrente de backend já
existe: `create-checkout` → `payment-webhook` → `provision-tenant` →
`resolve-onboarding-token` → `setup.html`, mais `create-billing-portal` e
`send-email`/`email-cron`. O que falta é **garantir a entrada pública** ("criar
minha loja" na landing) e o **auto-provisionamento sem passo manual de admin**,
e **enforcement de limite de plano** (hoje `max_vendedores` é setado por plano e
só _exibido_ em settings — a criação não bloqueia). Sem isso, abrir pro público =
prospect paga e trava, ou usa sem limite. Resolvido nos itens **P0-1** e **P0-2**.

### 2. O vendor está 100%?

**~85% e genuinamente forte — é diferencial de verdade.** O core loop
(fila → atendimento → XP → missões → conquistas → avatar) está **real e
persistido** (RPCs + ledger `vendor_xp_events`, níveis/tiers server-side,
missões com reset diário por timezone, conquistas idempotentes). **Não é mock.**
Gaps que precisam de decisão antes do launch:

- **Dicas IA** (`ai-assist`): código existe mas **não está deployado** (migração
  pro Gemini parqueada) → o botão degrada pra "IA indisponível".
- **VM Missions**: lado vendedor pronto, mas **sem painel admin pra criar
  tarefas** → a aba nasce vazia.
- **Missões/anúncios não seedados** → no dia 1 o vendedor pode ver gamificação
  vazia.
  Recomendação: lançar com **feature-flags** (ligar XP/níveis/conquistas/avatar,
  que estão prontos; esconder VM Missions + Dicas IA até deploy/admin). Itens
  **P0-3** e **P0-4**.

### 3. Mais alguma melhoria pro sistema?

- **Enforcement de plano** (monetização) — P0-2.
- **Testes críticos faltando**: isolamento entre tenants (RLS), ciclo de
  atendimento, webhook de pagamento — P1.
- **Verificar em produção**: migração `45-hardening-onboarding-rls.sql` aplicada;
  chaves VAPID e `send-vendor-push` funcionando — P1.
- **PWA**: skeleton/empty states + banner offline — P2.
- **Dívida**: consolidar os 3 dashboards HTML; auto-reload de turno no tablet
  (RUNBOOK incidente #3) — P2.
- (Sentry **já está** ligado em produção — não é pendência.)

### 4. Ruptura — capturar o que o cliente queria e não tinha

**Hoje captura produto SÓ quando o motivo é `ruptura`** (e bem: catálogo
estruturado tipo/marca/cor/tamanho + texto livre `produto_ruptura`). Para os
outros motivos (`preco`, `indecisao`, `so_olhando`) **não captura produto** — só
a categoria. A melhoria (demand capture) é registrar **o produto desejado em
TODOS os motivos de não-conversão** e gerar o relatório "o que os clientes
pediram e não fechamos / não tínhamos". Vira **ouro pra decisão de compra e
estoque** do lojista — forte candidato a diferencial de venda. Item **P1-A**.

---

## P0 — Bloqueadores (antes de abrir pro público)

### P0-1 · Fechar o loop self-serve (cadastro → pagamento → provisionamento)

- **Por quê:** sem isso não dá pra adquirir cliente sozinho.
- **Estado:** backend existe (`create-checkout`, `payment-webhook`,
  `provision-tenant`, `resolve-onboarding-token`, `create-billing-portal`).
  `setup.html` é o wizard pós-token.
- **Fazer:**
  1. Entrada pública na `landing.html` ("Criar minha loja" / "Começar agora")
     que leva ao `create-checkout` com escolha de plano.
  2. Garantir que `payment-webhook` provisiona o tenant (ou gera
     `onboarding_token`) **automaticamente** e dispara `send-email` com magic
     link pro `setup.html` — sem passo manual de admin.
  3. Tratar os caminhos de erro: pagamento ok mas provisionamento falhou; token
     expirado; e-mail não chegou (reenvio).
  4. Verificar o fluxo ponta-a-ponta num tenant de teste.
- **Esforço:** Médio (pode ser "colar pontas + verificar" se já estiver ~90%).
- **Aceite:** um usuário novo, sem intervenção minha, cria loja, paga (sandbox),
  recebe e-mail, conclui o setup e entra no dashboard com slug próprio.

### P0-2 · Enforcement de limite de plano (`max_vendedores`)

- **Por quê:** proteger a monetização; hoje o limite é só exibido.
- **Estado:** `sql/07-multi-tenant.sql:18` `max_vendedores DEFAULT 999`;
  `provision-tenant` seta por plano; `settings.html:1349` mostra `X / max`.
- **Fazer:**
  1. RPC `pode_adicionar_vendedor()` (ou checagem no `create-vendor-auth` /
     no insert de `vendedores`/`tenant_users`) que rejeita acima do limite.
  2. UI: desabilitar "Adicionar vendedor" + toast "Limite do seu plano atingido —
     faça upgrade" com link pro `create-billing-portal`.
  3. Conferir os defaults reais por plano (Starter/Pro/Elite) — o `DEFAULT 999`
     do schema não pode vazar pra um tenant novo.
- **Esforço:** Pequeno–Médio.
- **Aceite:** tenant no limite não consegue criar mais vendedores e vê CTA de
  upgrade.

### P0-3 · Vendor — feature-flag do que não está pronto

- **Por quê:** não shippar feature que abre vazia ou quebra.
- **Fazer:**
  1. Flag pra **esconder a aba VM Missions** enquanto não houver painel admin
     (P1-C) — ou seed de tarefas demo.
  2. Flag pra **esconder "Dicas IA"** até o `ai-assist` ser deployado (P1-B).
  3. Manter ligados (estão prontos): XP, níveis, tiers, conquistas, avatar,
     anúncios, VM fotos, push.
- **Esforço:** Pequeno.
- **Aceite:** nenhuma aba/botão do vendor leva a tela vazia ou erro no launch.

### P0-4 · Seed de gamificação default por tenant novo

- **Por quê:** gamificação vazia no dia 1 mata o engajamento — o diferencial.
- **Fazer:** no `provision-tenant`, semear 3–5 `mission_templates` padrão e 1
  anúncio de boas-vindas por tenant. Conquistas já têm seeds globais.
- **Esforço:** Pequeno.
- **Aceite:** vendedor de um tenant recém-criado abre o app e vê missões do dia.

---

## P1 — Importante (durante o beta / logo após abrir)

### P1-A · Ruptura → Demand Capture (diferencial) ⭐ — ✅ FEITO (2026-06-02)

**Implementado e em produção** (migração `sql/51-demand-capture.sql` aplicada via
MCP, `demand_capture_p1a`):

- **DB:** `atendimentos.produto_desejado TEXT` + índice parcial
  `idx_atend_demanda (tenant_id, inicio) WHERE resultado='nao_convertido'`.
- **RPC:** `finalizar_atendimento` ganhou `p_produto_desejado` (no fim, default
  NULL → backward-compat; **hook XP preservado**, xp-hook.test verde). Nova
  `get_demand_report(inicio, fim, motivo, limit)` SECURITY DEFINER, RLS por
  `get_my_tenant_id()`, retorna `produto × motivo × total`, COALESCE de
  `produto_desejado`/`produto_ruptura` (ruptura também entra no relatório).
- **Tablet:** campo opcional "Qual produto o cliente queria?" na folha de motivo
  pra todos os motivos exceto ruptura (que já tem catálogo). `tablet.html` +
  `tablet-atendimento.js` (`finalize`/`selectMotivo`/`confirmMotivo`).
- **Dashboard:** card "Demanda Perdida — O que os Clientes Pediram" em
  `dashboard-operacional.html` + `loadDemandReport` em `dashboard-charts.js`
  (esconde se vazio).
- **Verificado:** lint + 102 testes; lógica do relatório rodada sobre dados reais
  (produtos de ruptura já aparecem). Card renderizado no harness (harmonia ok).
- **Follow-up — ✅ FEITO (2026-06-02):** captura no **mobile do vendedor**.
  `vendor_finish_attendance` ganhou `p_produto_desejado` (migração `sql/52`,
  `vendor_demand_capture_p1a`, hook XP preservado). No app do vendedor, tocar
  "Não converteu" abre uma folha leve "O que o cliente procurava?" com campo
  opcional + botões Finalizar/Pular (sem taxonomia de motivo — o vendedor no chão
  prioriza velocidade; o produto é o que importa pro estoque). Verificado: lint +
  102 testes; folha renderizada no harness. SW cache 165.

---

#### (Especificação original, p/ histórico)

Registrar **produto desejado em todos os motivos de não-conversão** + relatório.

- **DB (1 migração):** `ALTER TABLE atendimentos ADD COLUMN produto_desejado TEXT`
  (+ `produto_desejado_notas TEXT` opcional; índice parcial por
  `(tenant_id, motivo_perda, produto_desejado)`).
- **RPC:** novo parâmetro `p_produto_desejado` no `finalizar_atendimento`
  (`sql/36-ruptura-rpc.sql`); nova `get_demand_report(inicio, fim, motivo, limit)`.
- **Tablet UX:** campo opcional "Qual produto o cliente queria?" que aparece pra
  TODOS os motivos (não só ruptura) na folha de motivo
  (`tablet.html` + `tablet-atendimento.js` `confirmMotivo`/`finalize`).
- **Dashboard:** card "Demanda perdida — o que os clientes pediram" (tabela
  produto × motivo × quantidade), em `dashboard-operacional.html`.
- **Esforço:** ~1,5–2h, baixo risco.
- **Aceite:** recepção registra "cliente queria Bota Ariat 42" num atendimento
  perdido por preço, e o lojista vê isso agregado no dashboard.

### P1-B · Deploy do `ai-assist` (Gemini) + ligar Dicas IA

- Configurar `google_api_key` em `app_secrets`, deployar a function, remover a
  flag de P0-3. (Trabalho já codado e parqueado.)
- **Esforço:** Pequeno (deploy + chave) — precisa de aprovação pra mexer em prod.

### P1-C · Painel admin de VM Missions

- UI no dashboard pra criar/atribuir tarefas de VM (briefing, checklist, refs);
  remove a flag de P0-3.
- **Esforço:** Médio.

### P1-D · Testes críticos

- `atendimento-lifecycle` (criar → status → finalizar + grant de XP).
- `rls-isolation` (usuário do tenant A não lê/escreve dados do tenant B).
- `payment-flow` (onboarding_token → provision → criação de usuário).
- **Esforço:** Médio.

### P1-E · Verificações de produção — ✅ FEITO (2026-06-02)

- **RLS onboarding (sql/45): ✅ aplicada.** `onboarding_tokens` com RLS on,
  **0 grants** a anon/authenticated, policy `onboarding_tokens_read_anon`
  removida, nenhuma policy → **tokens não enumeráveis** (só
  `resolve-onboarding-token` SECURITY DEFINER lê).
- **VAPID + send-vendor-push: ✅ funcionando.** `push_subscriptions` com 1
  assinatura real ativa; `get_vapid_public_key()` operante; **logs das últimas
  24h mostram dezenas de invocações de `send-vendor-push` todas `200`** (a função
  falha com 500 se faltar VAPID em `app_secrets` → logo as chaves estão lá e o
  pipeline server-side entrega). Entrega física no device depende de teste real,
  mas o handoff pro serviço de push está ok.
- **Bônus:** logs confirmam o tombstone do R9 vivo (`vendor-onboard → 410`).
- **Esforço:** Pequeno (verificação). Sem mudança de código.

---

## P2 — Pós-lançamento (polimento e dívida)

- **PWA:** skeleton screens no dashboard/tablet; `offline.html` + banner "modo
  offline".
- **Consolidar os 3 dashboards HTML** (dashboard / -vendedor / -operacional são
  ~95% iguais) — dívida citada no `CLAUDE.md`.
- **Auto-reload de turno no tablet** (RUNBOOK incidente #3 — tablet pode travar
  ao expirar sessão).
- **Export CSV** dos relatórios (ruptura, demanda perdida, ranking).

---

## Ordem de execução sugerida (Levas, commits independentes)

| Leva   | Conteúdo                                                    | Gate                     |
| ------ | ----------------------------------------------------------- | ------------------------ |
| **L1** | P0-3 (flags) + P0-4 (seed)                                  | Vendor sem telas vazias  |
| **L2** | P0-2 (enforcement de plano)                                 | Monetização protegida    |
| **L3** | P0-1 (loop self-serve completo + verificação ponta-a-ponta) | **GO p/ abrir**          |
| **L4** | P1-A (demand capture da ruptura) ⭐                         | Diferencial no ar        |
| **L5** | P1-B (IA) + P1-C (admin VM)                                 | Liga features flagueadas |
| **L6** | P1-D (testes) + P1-E (verificações prod)                    | Rede de segurança        |
| **L7** | P2 (PWA, dívida, export)                                    | Polimento contínuo       |

**Gate de lançamento público:** L1→L3 concluídas e verificadas. L4 logo em
seguida (é o que vende). L5–L7 em paralelo/depois.

## Verificação por leva

- `npm run check` (lint + testes) após cada leva.
- Fluxos manuais: cadastro self-serve ponta-a-ponta (L3); limite de plano (L2);
  vendor sem telas vazias (L1); registro de demanda perdida + relatório (L4).
- Toda mudança que toca em produção (deploy de function, segredo, migração)
  passa por aprovação explícita antes.

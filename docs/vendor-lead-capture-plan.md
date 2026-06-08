# Plano — Captura obrigatória de lead na não-conversão (vendor mobile)

> Data: 2026-06-08. Contexto: nesta etapa o foco é o **app do vendedor** (tablet
> sai de cena pra validar o vendor). Pedido cru do lojista: "o vendedor não
> consegue voltar pra fila depois de uma não-conversão sem registrar **nome do
> cliente, telefone e o motivo** de não ter comprado."

---

## 1. O que eu sugiro (melhor / mais polido que o pedido cru)

O pedido cru funciona, mas tem 3 riscos que um fluxo polido resolve:

1. **Fricção mata adoção + qualidade do dado.** Exigir nome+telefone em **toda**
   não-conversão (inclusive "só olhando", que é a maior fatia — 429/ano) faz o
   vendedor digitar lixo ("0000", "x") pra liberar a fila. → **Exigir só onde faz
   sentido** (motivos de alta intenção: preço, indecisão, ruptura, outro). "Só
   olhando" não pede contato (não há lead).
2. **LGPD.** Nome+telefone é dado pessoal. Capturar sem consentimento é risco
   legal. → **Toggle de consentimento** ("cliente autorizou contato?") + a captura
   só vira lista de follow-up se o cliente topou.
3. **Só bloquear é desperdício.** O valor real não é "punir" o vendedor — é virar
   **pipeline de recuperação de venda**. → A captura alimenta uma tela
   **"Oportunidades / Leads Perdidos"** com botão **WhatsApp 1-toque** pro lojista
   (ou o próprio vendedor) recuperar. Isso amarra no "unfair" da demanda perdida.

**Resumo da recomendação:** não é "um gate de 3 campos obrigatórios sempre". É um
**fluxo inteligente por motivo** + consentimento + uma camada de recuperação que
transforma a obrigação em receita.

---

## 2. O fluxo (vendor mobile) — passo a passo

Hoje: "Não converteu" → folha "O que o cliente procurava?" (produto opcional) →
Finalizar/Pular → volta pra fila. Novo fluxo:

1. Vendedor toca **"Não converteu"**.
2. **Motivo** (chips, 1 toque, **obrigatório**): Preço · Indecisão · Só olhando ·
   Ruptura · Outro. _(Hoje o mobile manda motivo nulo — isso já melhora o dado.)_
3. **Ramo:**
   - **"Só olhando"** → campo **produto desejado** (opcional) → **Finalizar**.
     Sem captura de contato (baixa intenção). Volta pra fila.
   - **Alta intenção** (Preço / Indecisão / Ruptura / Outro) → **folha de lead
     (obrigatória)**:
     - **Nome** do cliente (texto)
     - **Telefone** (input `tel` + máscara BR; validação de tamanho)
     - **Produto desejado** (texto, com o autocomplete que já existe)
     - **Toggle**: "Cliente autorizou contato/WhatsApp" (consentimento LGPD)
     - Botão **"Finalizar e voltar pra fila"** — **desabilitado** até nome +
       telefone válidos.
4. **Gate:** enquanto a folha de lead não é concluída, o atendimento não finaliza
   → o vendedor **não volta pra fila** (não pega o próximo cliente). É o "não
   consegue voltar pra vez" pedido, mas só nos motivos que importam.

Detalhe de UX: a folha tem um "?" explicando _por que_ pedimos ("pra loja
recuperar a venda depois") — vendedor que entende o porquê preenche melhor.

---

## 3. Modelo de dados

**`atendimentos`** (+ colunas; `produto_desejado` e `motivo_perda` já existem):

- `cliente_nome TEXT`
- `cliente_telefone TEXT`
- `contato_autorizado BOOLEAN DEFAULT false`

**`tenants`** (política opt-in — nem toda loja vai querer obrigatório):

- `exige_captura_lead BOOLEAN DEFAULT false` (ou um jsonb de policy).
  Liga/desliga em Configurações.

**RPC `vendor_finish_attendance`** (+ params, hook XP preservado):

- `p_cliente_nome`, `p_cliente_telefone`, `p_contato_autorizado`.
- **Enforcement server-side** (defesa real, não só client): se
  `tenant.exige_captura_lead` E `resultado='nao_convertido'` E motivo de alta
  intenção E (nome/telefone vazios) → `RAISE EXCEPTION 'LEAD_OBRIGATORIO'`. O app
  trata e reabre a folha. (Evita burlar por request manual.)

**Índice:** `(tenant_id, contato_autorizado, inicio)` parcial p/ a tela de leads.

---

## 4. Payoff no dashboard — "Oportunidades / Leads Perdidos"

A captura vira pipeline (senão é só burocracia):

- **Card/aba** no Operacional: lista de não-conversões com contato autorizado —
  cliente, telefone, produto desejado, motivo, vendedor, data.
- **Botão WhatsApp 1-toque** (`wa.me/55... ?text=...`) com mensagem pronta
  ("Oi {nome}! Vi que você procurava {produto}, chegou/temos condição…").
- **RPC `get_lost_leads(inicio, fim)`** SECURITY DEFINER, RLS por tenant.
- Métrica: "X leads capturados · Y recuperados" (se a venda fechar depois).

---

## 5. Fases (entregáveis independentes)

- **F0 — Captura + gate (core do pedido):** migração (colunas + flag +
  enforcement) → folha de lead no vendor (motivo obrigatório + nome/telefone nos
  motivos de alta intenção + consentimento) → finish passa os campos. _Gate
  funcionando._
- **F1 — Recuperação:** tela "Leads Perdidos" + WhatsApp 1-toque + `get_lost_leads`.
  _É o que transforma em receita._
- **F2 — Polimento:** máscara/validação de telefone, dedupe, métrica de
  recuperação, config opt-in na tela de Configurações, marcar lead como
  "recuperado".

Cada fase: migração via MCP + lint + 102 testes + harness onde for visual.

---

## 6. Decisões — TRAVADAS (2026-06-08)

1. **Obrigatório por motivo** ✅ (preço/indecisão/ruptura/outro pedem contato;
   "só olhando" não).
2. **Consentimento (toggle LGPD)** ✅ incluir.
3. **Opt-in por loja (flag `exige_captura_lead`)** ✅ — ligado já pro Texas Center;
   demais lojas desligado por padrão.
4. **Quem recupera o lead: os dois** ✅ — lojista (tela no dashboard) **e** o
   próprio vendedor (no app).

## 7. Status de execução

- **F0** — migração `sql/59-vendor-lead-capture.sql` escrita (colunas + flag +
  `vendor_finish_attendance` com enforcement). **Pendente de aplicar** (Supabase
  MCP desconectado em 2026-06-08; aplicar via reconexão ou SQL Editor). UI do
  vendor (motivo + folha de lead) vem assim que a migração estiver no ar (pra
  testar contra a RPC real).

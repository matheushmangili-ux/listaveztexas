# Plano — Demanda Perdida (o "unfair advantage")

> Data: 2026-06-02. Base: análise sênior + dados reais de produção (Texas Center,
> 12 meses). Diagnóstico: a engenharia da captura está sólida, mas **88% das
> não-conversões não tinham produto** (a captura em todos os motivos acabou de
> subir) e o dado é **texto livre** (agrega mal). O alvo é virar de "relatório"
> pra **ferramenta de decisão de compra**.
>
> Achado-chave dos dados: o ouro está em **preço (117/ano) + indecisão (109)** —
> "queria e não levou". "Só olhando" (429) e "outro" (276) dominam mas têm baixo
> valor de demanda. Ruptura já captura (~76%), mas só 22% usa o catálogo
> estruturado.

---

## P0 — Fazer a engrenagem girar (sem isso, o resto é teoria)

Objetivo: subir a **taxa de captura** e a **qualidade do dado**.

### P0-1 · Autocomplete do produto (tablet + vendor)

- **RPC** `get_demand_suggestions()` (SECURITY DEFINER, tenant-scoped): retorna os
  produtos distintos já digitados (`produto_desejado`/`produto_ruptura`), normalizados,
  ordenados por frequência. Vira a "memória" da loja.
- **UI:** `<datalist>` nos inputs de produto (tablet `#desejadoInput` e
  `#rupturaInput` fallback; vendor `#vendorDesejadoInput`). Digitar sugere o que
  a loja já usou → entradas consistentes (mata duplicata por inconsistência).

### P0-2 · Normalização na gravação

- `trim` + colapsar espaços duplos antes de salvar (tablet + vendor). Sem
  Title-Case agressivo (preserva siglas tipo "TXC").

### P0-3 · Nudge de adoção (foco nos motivos de alta intenção)

- No tablet, pra **preço/indecisão**: hint curto ("📦 Anote o que ele queria —
  vira relatório de compra") + foco automático no campo de produto.
- "Só olhando" segue sem nudge (baixo valor).

---

## P1 — Camada de decisão (o moat de verdade)

### P1-1 · Valor perdido (R$) — ✅ FEITO (2026-06-02)

- `get_demand_report` (migração `sql/54`) retorna `valor_estimado` = **ticket
  MEDIANO** do tenant (vendas 180d) × qtd. **Mediana, não média** — a média estava
  destruída por outlier de digitação (prod: média R$3.926 vs mediana R$800, com um
  valor_venda de R$142.960). Card mostra R$ por linha (headline em danger) + total
  no header ("~R$ X perdido").

### P1-4 · Export CSV — ✅ FEITO (2026-06-02)

- Botão "Exportar CSV" no header do card (`window._dashDemandExport`): baixa
  produto;motivo;pedidos;valor (separador `;` + BOM UTF-8 → Excel BR lê acento).
  Verificado no harness.

### P1-2 · Tendência no tempo

- Sinalizar produtos subindo ("pedido 8× nas últimas 2 semanas"). Comparar janela
  recente vs anterior.

### P1-3 · Quebra por categoria/marca

- Reaproveitar o catálogo estruturado da ruptura (tipo/marca) pra agrupar.

### P1-4 · Export CSV + filtro

- Botão de export do relatório de demanda (produto × motivo × qtd × R$) +
  filtro por motivo/período. O lojista leva pro fornecedor.

### P1-5 · Unificar com a ruptura estruturada

- Hoje há 2 visões ("demanda perdida" texto + `get_rupture_impact` estruturado).
  Consolidar numa história só no Operacional.

---

## Ordem de execução

P0-1 → P0-2 → P0-3 (uma leva, destrava o valor) → depois P1 incremental
(P1-1 e P1-4 primeiro, que são os que "vendem"). Cada leva: lint + 102 testes +
harness onde for visual; migração via MCP; commit separado.

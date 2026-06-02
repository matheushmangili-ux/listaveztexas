# Harmonização do header do tablet

> Documento de planejamento. Data: 2026-06-02. Base: print do usuário + leitura
> do código real (`tablet.html:70-160`, `css/tablet.v52.css:96-180, 361-417`).
>
> Objetivo: deixar a barra superior do tablet **coesa** — hoje ela mistura 3
> "linguagens" visuais (KPIs sem moldura, cards com moldura, barra de progresso
> avulsa) com ícones de metáforas que brigam. Não muda lógica nem dados.

---

## Diagnóstico — o que está desarmônico (ancorado)

| #   | Problema                                                                                                                                                                                     | Onde                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Metáfora dupla de chart** na Conversão: ícone `fa-chart-line` **+** barra `conv-bar` (60×6px). Os outros 2 KPIs não têm barra → 3 blocos assimétricos.                                     | `tablet.html:89-98`, CSS `151-166`    |
| 2   | **Ícones que brigam**: `fa-users` (pessoa) + `fa-bag-shopping` (objeto, vira "cadeado" a 15px) + `fa-chart-line` (data-viz). Três metáforas.                                                 | `tablet.html:76,83,90`, CSS `130-133` |
| 3   | **Molduras inconsistentes**: KPIs sem moldura (número solto) vs Ranking/Encerrar = cards com borda. Entre os cards: Ranking outline periwinkle, Encerrar outline salmão, Iniciar preenchido. | CSS `125-149` vs `361-417`            |
| 4   | **Cor sem sistema**: Conversão renderiza verde (ícone+barra) enquanto Atendidos/Vendas ficam periwinkle. Accent de marca + verde semântico sem regra.                                        | CSS `130-133, 160-165`                |
| 5   | **Posição flutuante**: KPIs `flex:1; justify-content:center` boiam no meio, sem ancoragem ao logo nem aos botões.                                                                            | CSS `120-124`                         |

---

## Princípios da correção

1. **Um módulo de KPI, repetido 3×, simétrico.** Os três blocos devem ter o
   mesmo peso visual e a mesma estrutura.
2. **Uma linguagem só.** Ou todos com ícone unificado, ou nenhum. Sem metáforas
   misturadas.
3. **Cor com regra.** Número = neutro (`--text-primary`); rótulo =
   `--text-muted`. Cor semântica (verde/âmbar) **só** na barra de conversão,
   nunca pintando número/ícone de um KPI e não de outro.
4. **Hierarquia de ação clara à direita.** 1 ação primária (Turno), 1 secundária
   (Ranking), 1 overflow (kebab) — não 3 cards competindo.

---

## Proposta (recomendada)

### A. KPIs — módulo único e simétrico

- Agrupar os 3 num **container segmentado** sutil (um "pill" único com divisores
  verticais entre os blocos), em vez de 3 ilhas soltas. Dá a "moldura" que falta
  e unifica com a estética dos `action-card` à direita.
- Cada bloco: **número (18px, mono, neutro)** em cima do **rótulo (11px, muted,
  uppercase)** — estrutura idêntica nos três.

### B. Ícones — **dropar** (recomendado)

- Remover `fa-users` / `fa-bag-shopping` / `fa-chart-line`. O rótulo já nomeia.
  Resultado: mais limpo, sem o "cadeado", sem metáforas brigando.
- _Alternativa (se quiser manter ícones):_ um set unificado, mesmo peso, cor
  `--text-muted` (não accent), tamanho 13px — discretos e consistentes.

### C. Conversão — barra como **underline**, não bloco extra

- Manter a barra (faz sentido p/ um %), mas como **sublinhado fino** sob o valor
  da conversão (largura = a do bloco), não um elemento de 60px ao lado que
  engorda só aquele KPI. Assim os 3 blocos ficam com a mesma largura/peso.
- Cor da barra = **semântica** (verde ≥ meta, âmbar abaixo) — só a barra.

### D. Ações à direita — hierarquia

- **Turno** (Iniciar/Encerrar) = ação primária. Mantém o estado: preenchido
  accent no "Iniciar", outline-danger no "Encerrar" (estado é informação útil).
- **Ranking** = secundário → estilo **ghost** (sem fill tonal), pra não competir
  com o Turno.
- **Kebab** = overflow, como já é.

### E. Posição — **agrupar à esquerda** (recomendado)

- Mover os KPIs pra logo após o logo (cluster esquerdo: marca + stats ao vivo),
  deixando a direita só pras ações. Mental model: "marca + números | ações".
- _Alternativa:_ manter centralizado, mas como módulo contido (item A) pra não
  flutuar.

### F. Versão (`v4.3.0`)

- Tirar da zona da marca e jogar pro menu kebab (junto de Modo TV/tour/tema), ou
  manter minúscula. Limpa o canto esquerdo. (Baixa prioridade.)

---

## Decisões (travadas pelo usuário — 2026-06-02)

1. **Ícones**: ✅ **DROPAR** os 3 ícones por KPI.
2. **Posição**: ✅ **AGRUPAR À ESQUERDA** (logo + stats juntos).
3. Barra de conversão: mantém a cor **semântica** já existente (`tablet-init.js:694`
   — ≥50% verde / ≥30% âmbar / senão accent), agora como underline.
4. Cards de ação (Ranking/Encerrar): **não mexer** agora — o módulo segmentado
   dos KPIs já dá a moldura que faltava, casando com os cards. Ghost no Ranking
   fica como opcional futuro (mexeria em vários blocos de tema).

---

## Arquivos a mexer

- `tablet.html` — markup do `#headerKpis` (remover `<i>`, reestruturar conv-bar
  como underline, reordenar p/ esquerda se escolhido).
- `css/tablet.v52.css` — `.t-header*`, `.t-header-kpi*`, `.conv-bar*`,
  `.action-card`/`.ranking-card`/`.turno-card` (ghost no ranking).
- `sw.js` — bump CACHE_VERSION.

## Verificação

- Harness de preview estático (como no VM): render do header antes/depois, dark
  - light, larguras de tablet (1024/768).
- Conferir: 3 KPIs com peso igual, sem ícones brigando, barra de conversão como
  underline semântico, Ranking secundário vs Turno primário, alinhamento à
  esquerda coeso.
- `npm run check` (lint + 102 testes) — mudança é só CSS/HTML, sem risco de teste.

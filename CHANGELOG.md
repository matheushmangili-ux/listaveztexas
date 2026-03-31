# Changelog — Lista Vez Texas

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

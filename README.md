# ListaVez

Sistema de gestão de fila de vendedores para lojas físicas. Controle quem atende, acompanhe vendas em tempo real e aumente a conversão da equipe.

## Stack

- **Frontend**: HTML5 + CSS + vanilla JS (ES modules) + Chart.js
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage, RPC, RLS)
- **Deploy**: Vercel (static)
- **PWA**: Service Worker + manifest (funciona offline)

## Estrutura

```
listaveztexas/
├── index.html          Login (PIN 4 dígitos ou email/senha)
├── tablet.html         Interface da fila (tablet-first, touch-optimized)
├── dashboard.html      Dashboard gerencial (desktop-first, Chart.js)
├── landing.html        Landing page comercial
├── manifest.json       PWA manifest
├── sw.js               Service Worker (network-first, cache estáticos)
├── vercel.json         Rewrites do Vercel
├── css/
│   └── styles.css      Design system (dark/light theme, CSS variables)
├── js/
│   ├── supabase-config.js  Credenciais e client Supabase
│   ├── auth.js             Login PIN/email, roles, guards, redirects
│   └── utils.js            Helpers (formatação, toast, theme, constantes)
├── sql/
│   ├── schema.sql              Tabelas, enums, indexes
│   ├── rpc.sql                 RPCs principais (fila, stats, ranking)
│   ├── rls.sql                 Row-Level Security + realtime
│   ├── 03-pausas-log.sql       Tracking de pausas/saídas
│   ├── 04-fotos-storage.sql    Storage para fotos de vendedores
│   ├── 05-ticket-medio.sql     Ticket médio nas stats
│   └── 06-proximo-cliente-setor.sql  Fila por setor
└── assets/
    └── logo-tc.png             Logo (usado no PWA e watermark)
```

## Funcionalidades

### Tablet (Recepcionista)
- Fila ordenada com drag & drop (touch + desktop)
- Múltiplos setores (loja, chapelaria, selaria)
- Botão "Próximo Cliente" com lock anti-concorrência (`FOR UPDATE SKIP LOCKED`)
- Timer de atendimento em tempo real
- Registro de resultado: Venda (ka-ching!), Não converteu, Troca
- Troca com diferença >= R$ 1.000 reposiciona vendedor em 1o na fila
- Motivos de perda: Preço, Ruptura, Indecisão, Só olhando
- Controle de saídas: Almoço, Banheiro, Reunião, Operacional
- Vendor retorna ao último da fila ao finalizar atendimento
- Sync em tempo real via Supabase Realtime
- Batch reorder via RPC (`reordenar_fila`) — 1 query em vez de N
- Double-tap prevention (`withLock`)
- Drag rects caching para performance
- Auto-reconnect no realtime
- Timer pausa + drag cleanup ao esconder tab

### Dashboard (Gerente)
- Cards: Atendimentos, Vendas, Conversão, Não convertidos, Trocas, Ticket médio
- Comparativo vs dia anterior (cores + sinais +/-)
- Gráficos: vendas por hora, motivos de perda, ranking
- Painel da equipe em tempo real
- Filtros: hoje, semana, mês
- Conversão exclui trocas puras (sem receita)

### Login
- PIN de 4 dígitos (auto-advance, auto-submit)
- Email + senha
- Roles: recepcionista → tablet, gerente/admin → dashboard
- Dark/light theme toggle

## Como configurar

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute os scripts SQL na ordem:
   ```
   sql/schema.sql
   sql/03-pausas-log.sql
   sql/04-fotos-storage.sql
   sql/05-ticket-medio.sql
   sql/06-proximo-cliente-setor.sql
   sql/rpc.sql
   sql/rls.sql
   ```
3. Copie a URL e Anon Key do projeto

### 2. Credenciais

Em `js/supabase-config.js`:
```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-anon-key';
```

### 3. Criar usuários

No Supabase Dashboard > Authentication > Users:
- **Recepcionista**: `pin_XXXX@listavez.local`, metadata: `{"user_role": "recepcionista"}`
- **Gerente**: email real, metadata: `{"user_role": "gerente"}`

### 4. Cadastrar vendedores

No Supabase > Table Editor > vendedores: nome, apelido, setor.

### 5. Deploy

```bash
npx vercel deploy --prod
```

Ou push na `main` — Vercel faz deploy automático se conectado ao GitHub.

## Banco de dados

### Tabelas
| Tabela | Propósito |
|--------|-----------|
| `vendedores` | Equipe de vendas (nome, status, posição na fila, setor, foto) |
| `turnos` | Turnos diários (abertura, fechamento) |
| `turno_vendedores` | Presença por turno |
| `atendimentos` | Registro de atendimentos (vendedor, resultado, valor, tempo) |
| `pausas_log` | Log de saídas (motivo, duração) |
| `configuracoes` | Configurações chave-valor (JSONB) |

### RPCs
| Função | Propósito |
|--------|-----------|
| `proximo_cliente` | Próximo vendedor da fila (com lock) |
| `finalizar_atendimento` | Encerra atendimento e reposiciona vendedor |
| `reordenar_fila` | Batch reorder (array de UUIDs → posições) |
| `registrar_pausa` / `registrar_retorno` | Controle de saídas |
| `get_conversion_stats` | Métricas de conversão |
| `get_seller_ranking` | Ranking de vendedores |
| `get_hourly_flow` | Fluxo por hora |
| `get_loss_reasons` | Motivos de perda |
| `get_pause_stats` | Estatísticas de pausas |

## Performance

- Event delegation no drag (1 listener no container)
- Bounding rects cacheados durante drag (200ms TTL)
- Touch indicator tracking sem querySelectorAll
- `will-change: transform` só durante drag ativo
- DocumentFragment para batch DOM updates
- `requestAnimationFrame` para renders
- Realtime com reconexão automática
- Google Fonts: apenas pesos usados (300-900 Inter, 500-700 JetBrains Mono)
- Preconnect para CDNs de fontes e ícones

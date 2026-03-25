# ListaVez Texas

Sistema de gestão de fila da vez para a Texas Center. Substitui o Sellz com melhor UX e analytics reais.

## Stack

- **Frontend**: HTML5 + Custom CSS + Chart.js + vanilla JS (ES modules)
- **Backend**: Supabase (PostgreSQL, Realtime, Auth)
- **Deploy**: Vercel

## Como configurar

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute os scripts SQL na ordem:
   - `sql/schema.sql` — tabelas, enums, indexes
   - `sql/rpc.sql` — database functions
   - `sql/rls.sql` — row-level security + realtime
3. Copie a URL e Anon Key do projeto

### 2. Configurar credenciais

Em `js/supabase-config.js`, preencha:

```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-anon-key';
```

### 3. Criar usuários

No Supabase Dashboard > Authentication > Users, crie:

- **Recepcionista**: email + senha, user_metadata: `{"user_role": "recepcionista"}`
- **Gerente**: email + senha, user_metadata: `{"user_role": "gerente"}`

Para login por PIN, crie usuários com email `pin_XXXX@listavez.local`.

### 4. Cadastrar vendedores

No Supabase Dashboard > Table Editor > vendedores, insira os vendedores com nome e apelido.

### 5. Deploy

Push na branch `master` — Vercel faz deploy automático.

## Estrutura

```
index.html       — Login (PIN ou email)
tablet.html      — Interface da recepcionista (tablet-first)
dashboard.html   — Dashboard gerencial (desktop-first)
css/styles.css   — Tema visual
js/              — Módulos JS (auth, queue, dashboard, utils)
sql/             — Scripts SQL para Supabase
```

## Funcionalidades

### Tablet (Recepcionista)
- Fila ordenada de vendedores com posição
- Botão "Próximo Cliente" (atribui vendedor da vez com lock anti-concorrência)
- Timer de atendimento em tempo real
- Registro de resultado: Venda, Não converteu, Troca
- Motivos de não conversão: Preço, Ruptura, Indecisão, Só olhando
- Campo de produto em ruptura
- Toggle de status: Disponível / Pausa / Fora
- Sync em tempo real entre tablets via Supabase Realtime

### Dashboard (Gerente)
- Taxa de conversão (hoje/semana/mês)
- Motivos de perda (donut chart)
- Fluxo por hora (bar chart)
- Ranking de vendedores por conversão
- Log de rupturas (produtos em falta)
- Status da equipe no salão em tempo real

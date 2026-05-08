# CLAUDE.md

Convenções e contexto do repositório para quem (Claude ou humano) for trabalhar aqui. Mantenha conciso — detalhe só o que é não-óbvio pelo código.

## O que é

**minhavez** — SaaS multi-tenant pra lojas físicas gerenciarem fila de atendimento, gamificar vendedores (XP/missões), ver dashboards em tempo real e capturar VM (visual merchandising) das vendedoras. Em produção na Texas Center. Tier Elite permite vendor login individual.

## Stack

- **Frontend**: vanilla JS (ES modules), HTML estático, CSS com design tokens. **Sem bundler**. Scripts carregados diretamente no navegador.
- **Backend**: Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions).
- **Hospedagem**: Vercel (deploy automático a cada push em `main`).
- **Observability**: Sentry (erros) + PostHog (analytics), ambos via `js/analytics.js` e `js/sentry.js`.
- **Multi-tenant**: via slug no path (`/:slug/tablet`, `/:slug/dashboard`). Resolvido em `js/tenant.js`.

## Áreas do app (4 surfaces)

| Surface          | Arquivo principal                                                           | Usuário              | Device              |
| ---------------- | --------------------------------------------------------------------------- | -------------------- | ------------------- |
| **Vendor**       | `vendor.html`                                                               | Vendedora individual | Celular             |
| **Tablet**       | `tablet.html`                                                               | Operador no balcão   | Tablet fixo (kiosk) |
| **Dashboard**    | `dashboard.html` + `dashboard-vendedor.html` + `dashboard-operacional.html` | Gerente              | Desktop             |
| **Landing/Auth** | `landing.html` + `index.html` + `setup.html`                                | Visitante/admin      | Qualquer            |

Dashboard tem 3 HTMLs ~95% idênticos — consolidar em template único é débito técnico conhecido.

## Estrutura

```
/
├── *.html                   — surfaces principais
├── css/                     — todas as surfaces puxam tokens + components
│   ├── tokens.v54.css       — design tokens (cores, espaços, sombras, type)
│   ├── components.v54.css   — primitivas compartilhadas (botões, mv-wordmark, etc)
│   ├── tablet.v54.css       — estilos do tablet (recepção/fila landscape)
│   ├── dashboard.v54.css    — estilos dos 3 dashboards (sidebar + main + charts)
│   └── vendor.v54.css       — estilos do vendor (mobile, light only)
├── js/
│   ├── analytics.js         — init PostHog (com reverse proxy /ingest)
│   ├── sentry.js            — init Sentry
│   ├── tenant.js            — resolver multi-tenant via slug
│   ├── supabase-config.js   — client Supabase
│   ├── utils.js             — helpers compartilhados (toggleTheme, etc)
│   ├── vendor-*.js          — módulos do vendor
│   ├── tablet-*.js          — módulos do tablet
│   ├── dashboard-*.js       — módulos do dashboard
│   └── components/          — web components (mv-logo, mv-loader)
├── sql/
│   └── NN-feature.sql       — migrations numeradas em ordem
├── supabase/functions/      — edge functions (Deno)
└── tests/                   — vitest + jsdom
```

## Scripts

```bash
npm run dev         # browser-sync, port 3000, startPath /landing.html
npm test            # vitest
npm run lint        # eslint
npm run check       # lint + test
npm run format      # prettier
```

Pre-commit hook via Husky roda `lint-staged` — arquivos staged passam por eslint + prettier automaticamente.

## Convenções

### CSS

- **Tokens em `css/tokens.v54.css`**. Novas cores/espaços/radius vão aqui primeiro, depois usa como `var(--foo)` nos estilos.
- **Versionamento manual**: `vNN` no nome do arquivo (`tokens.v54.css`). Quando fizer mudança que precisa invalidar cache do service worker, bump pra próxima versão, atualiza refs em todos HTMLs e em `sw.js` (STATIC_ASSETS + CACHE_VERSION).
- **Estilos por surface ficam em arquivos dedicados** — nada de `<style>` inline em HTML. Migração v54 extraiu tablet/vendor pra `css/{surface}.v54.css` (dashboards já vinham externos). Inline volta a aparecer só em páginas auxiliares pequenas (auth, legal).
- **Nada de `!important`** exceto em cenários realmente justificados. Se precisar, comenta por quê acima.
- **Dark/light**: `[data-theme='dark']` e `[data-theme='light']` em `html`. Tokens respondem via custom properties. Default é dark exceto no tablet (que permite toggle desde v52) e no vendor (light only).

### JS

- **Módulos ES** (`<script type="module">`), não CommonJS.
- **Sem bundler** → imports usam path absoluto (`/js/tenant.js`), não `../tenant`.
- **Sem TypeScript** no src (tests podem ter JSDoc).
- **Errors em RPCs**: trate explicitamente. **Evite `EXCEPTION WHEN OTHERS`** em funções Postgres — já causou incidente de XP silencioso por 26 dias (ver `sql/44-fix-xp-idempotent-index.sql` e RUNBOOK).
- **Analytics**: use `window.minhavezAnalytics?.capture(event, props)`. Padrão `event` = `{contexto}_{acao}` em snake_case (ex: `vendor_login_success`).
- **Sentry**: erros graves vão automático. Pra breadcrumb manual, `window.minhavezSentry?.captureException(err, { tags: {...} })`.

### SQL

- **RLS ativa** em toda tabela com dados de tenant. Policy padrão: `tenant_id = auth.jwt() ->> 'tenant_id'`.
- **Migrations numeradas** (`NN-feature.sql`). Nunca edite migration já aplicada — crie nova.
- **`SECURITY DEFINER`** em RPCs que precisam bypassar RLS — use com cuidado.
- **Índices parciais + ON CONFLICT**: incompatíveis em geral. O conflict target precisa bater com o predicate do índice. Se usar partial index, use unique constraint inteira.

### Commits

- **Formato**: `tipo(escopo): descricao` (ex: `fix(vendor): auth race em sessao expirada`).
- **Tipos**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`.
- **Descrição explica o _porquê_**, não apenas o o quê.
- **Co-author**: commits assistidos terminam com `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Gotchas (aprendidos a duras penas)

1. **Service Worker cacheia agressivo**. Em testes, sempre faça hard refresh (Ctrl+Shift+R) ou aba anônima. Se um fix parece não subir, desregistre o SW em DevTools → Application.
2. **Adblockers bloqueiam `posthog.com` direto**. Por isso usamos reverse proxy `/ingest/*` em `vercel.json` que encaminha pra `us.i.posthog.com`. `api_host` no init é `/ingest`.
3. **Vercel cache de assets estáticos** pode servir JS antigo por alguns minutos após deploy. `x-vercel-cache: HIT` é normal; se crítico, pode invalidar pelo painel.
4. **Dashboard 3-way**: `dashboard.html`, `dashboard-vendedor.html`, `dashboard-operacional.html` compartilham `js/dashboard-charts.js`. Funções que escrevem em elemento específico precisam de guard (`if (!el) return`) — senão uma página quebra porque o elemento só existe em outra.
5. **Upload de imagem**: cap em 12MB (`MAX_UPLOAD_BYTES` em `vendor-vm.js`). Celulares modernos tiram fotos de 20MB+ raw — sem guard, estoura memória.
6. **LGPD**: analytics NÃO faz autocapture. Events manuais só. Session replay off. `property_blacklist` em `analytics.js` bloqueia `password`/`senha`/`token`. Novos events devem evitar PII (nome de cliente, valor de venda específico).

## Segurança

- **Keys públicas** (PostHog `phc_...`, Sentry DSN) são safe no client — já são public.
- **Service role key do Supabase** JAMAIS vai pro frontend. Só em edge functions (via env secret).
- **Validação dupla**: frontend valida UX, backend (RPC/trigger) valida segurança. Nunca confie só no frontend.
- **Vendor login** é gated por `plano = 'elite'` na função `tenant_has_vendor_mobile`. Edge function `create-vendor-auth` valida isso antes de criar user.

## Deploy

Push em `main` → Vercel deploya produção automaticamente (listaveztexas.vercel.app).

Previews em PRs também. Migrations SQL e edge functions são aplicadas manualmente via Supabase CLI ou MCP — não fazem parte do build do Vercel.

## Observability — onde olhar

- **Sentry**: https://sentry.io → projeto "minhavez" (org o4511269047500800). Erros em tempo real, agrupados por issue.
- **PostHog**: https://us.posthog.com → projeto 394122. Events, funis, retention.
- **Supabase logs**: painel Supabase → Logs → Postgres/API. Útil pra debug de RPC que tá falhando silencioso.
- **Vercel logs**: painel Vercel → Deployments → runtime logs. Útil pra edge functions.

Ver RUNBOOK.md pra procedimentos de incident response.

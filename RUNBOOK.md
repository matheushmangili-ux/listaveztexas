# RUNBOOK.md

Playbook de incident response. Quando algo dá errado, consulte aqui antes de improvisar.

## Onde olhar primeiro (triagem 30s)

1. **Sentry** → https://sentry.io (projeto minhavez) — erro do lado do cliente?
2. **PostHog** → https://us.posthog.com → Activity — usuários ainda mandando eventos?
3. **Supabase** → painel → Logs → Postgres/API — RPC falhando server-side?
4. **Vercel** → painel → Deployments → último deploy com status Ready?

Se os 4 estão verdes mas usuário reporta problema: provavelmente cache (service worker ou CDN).

---

## Incidentes comuns

### 1. Vendedora não está ganhando XP ou completando missão

**Histórico**: aconteceu em abril/2026, silencioso por 26 dias. ~1.632 atendimentos sem XP.

**Causa raiz**: `ON CONFLICT (vendor_id, source_id, event_type)` em `_grant_xp_for_attendance` não bateu com o predicate do índice parcial `idx_xp_events_idempotent` (que tinha `WHERE source_id IS NOT NULL`). Postgres retornou erro 42P10, mas o caller capturava com `EXCEPTION WHEN OTHERS` e só avisava por WARNING.

**Diagnóstico**:
```sql
-- rodar no Supabase SQL Editor pra um vendedor e dia específicos
SELECT count(*) FROM vendor_xp_events
WHERE vendor_id = '<uuid>'
  AND created_at::date = 'YYYY-MM-DD';

-- Se 0 mas atendimentos existem no mesmo dia → XP foi pulado
SELECT count(*) FROM atendimentos
WHERE vendedor_id = '<uuid>'
  AND inicio::date = 'YYYY-MM-DD'
  AND resultado IS NOT NULL;
```

**Fix**: `sql/44-fix-xp-idempotent-index.sql` re-cria o índice sem partial WHERE. Aplicado.

**Se voltar a acontecer**:
1. Checar Supabase Postgres logs por `WARNING: _grant_xp_for_attendance`.
2. Verificar se RPCs chamando `_grant_xp_for_attendance` têm `EXCEPTION WHEN OTHERS` engolindo — refatorar pra re-raise ou logar com detalhe.
3. Backfill retroativo: rodar script que varre `atendimentos` sem XP correspondente e chama a RPC (ver histórico do commit b88cc04).

---

### 2. Dashboard vazio ou RPC retornando erro

**Sintomas**: card de motivos/ranking/ruptura fica em loading infinito ou mostra "Sem dados".

**Diagnóstico**:
1. DevTools → Network → filtrar por `rpc` → ver qual request retornou erro.
2. Se 400/500: checar Supabase logs → Postgres → buscar o nome do RPC.
3. Se 401: sessão expirou. Logout e login resolve.
4. Se 403: problema de RLS policy. Provavelmente `tenant_id` do JWT não bate com linhas.

**Bug conhecido**: `loadRanking` e `loadRuptures` tentavam escrever em elementos que só existem em `dashboard-vendedor.html` e `dashboard-operacional.html`. Fix em commit `0888d49` adicionou `if (!el) return` guard no topo.

**Se aparecer TypeError "Cannot set properties of null"** em dashboard-charts.js:
- Identificar qual elemento é (linha do stack trace).
- Adicionar guard no topo da função que usa aquele elemento.

---

### 3. Tablet "travado" no kiosk

**Sintomas**: tela não responde, dados não atualizam, mas SW/app carregado.

**Causas possíveis**:
- **Sessão expirou silenciosamente**: o tablet não tem auth state listener igual o vendor. Fechar turno e abrir de novo (F5) força reauth.
- **Service worker cacheado**: Ctrl+Shift+R no tablet. Se SW persistir, admin pode ir em Supabase → deletar entry de `turnos` ativo desse tenant, e logar de novo.
- **Realtime channel desconectou**: refresh resolve.

**Prevenção**: janela de auto-reload no início do turno (ainda não implementada — débito).

---

### 4. Deploy subiu mas produção não atualizou

**Diagnóstico**:
1. Confirmar commit: `git log origin/main -1` — SHA bate com o que você esperava?
2. Vercel painel → deployment pra esse SHA → status **Ready**?
3. `curl -I https://listaveztexas.vercel.app/` — header `x-vercel-id` tem o edge que serviu. `age: 0` + `x-vercel-cache: HIT` é cache fresco, normal.
4. Hard refresh no browser (Ctrl+Shift+R) OU abrir aba anônima.

**Se mesmo assim não sobe**:
- Service worker cacheou versão antiga. DevTools → Application → Service Workers → Unregister.
- Também pode ser necessário `Application → Storage → Clear site data`.

**Forçar invalidação de asset específico**: Vercel painel → Settings → Edge Network → Purge. Use com moderação.

---

### 5. PostHog não está recebendo eventos

**Diagnóstico em ordem**:

1. **Browser normal com adblocker?** Abra DevTools → Network → filtre `ingest`. Se requests retornam **200**: SDK tá mandando certo.
2. **Se não aparece request em `/ingest/*`**: SDK não carregou. Causas:
   - `window.PUBLIC_POSTHOG_KEY` vazia no HTML.
   - Service worker cacheando HTML antigo sem a key.
   - Adblocker agressivo bloqueando até o proxy (raro — `listaveztexas.vercel.app/ingest` não tá em blocklists).
3. **Se aparece mas retorna 401/403**: key inválida ou região errada. Confirme em https://us.posthog.com → Settings → Project → Project API Key.
4. **Se aparece 200 mas PostHog Activity está vazio**: filtro de tempo no PostHog (troca pra "Last 24 hours"). Clica Reload.

**Debug rápido** (no console da página):
```js
window.posthog?.__SV                // 1 se loader rodou
typeof window.posthog?.capture       // 'function' se SDK carregou
window.posthog?.capture('test_manual', { from: 'console' })  // força envio
```

---

### 6. Erro novo aparece no Sentry, não sei o que é

**Triagem**:
1. **Environment** correto? Filtrar só `production` (ignora `preview`).
2. **Issue afeta quantos users?** Se for 1 usuário específico com adblocker estranho, low priority.
3. **Release** do erro bate com release atual? Se erro foi em release antiga (v51), pode já estar fixo.
4. **Frequência**: pico subitâneo = regressão provável do último deploy. Gradual = edge case novo.

**Se for regressão**: `git log --oneline main -10` → encontrar commits do último deploy → rollback via Vercel (painel → deployment anterior → Promote to Production).

**Breadcrumbs** no Sentry mostram o que o usuário fez antes do erro. Use pra reproduzir local.

---

### 7. Login de vendedor não funciona depois de criar

**Contexto**: Elite-only feature. Edge function `create-vendor-auth` cria o user no Supabase Auth e vincula ao `vendedor_id`.

**Sintomas típicos**:
- "Email ou senha incorretos" mesmo com credenciais certas.
- "Essa conta não é de vendedor" → `user_metadata.user_role` não foi setado. Edge function bug.

**Diagnóstico**:
```sql
-- checa se auth user existe e tem o metadata certo
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE email = '<email>';

-- checa se vendedor tem auth_user_id vinculado
SELECT id, nome, apelido, auth_user_id, tenant_id
FROM vendedores
WHERE id = '<vendor_id>';
```

Se `raw_user_meta_data->>'user_role'` != `'vendedor'`, a edge function não setou. Investigar `supabase/functions/create-vendor-auth/index.ts`.

---

## Procedimentos

### Rollback de deploy
Vercel painel → Deployments → escolhe versão anterior conhecida boa → `...` → **Promote to Production**. Zero downtime.

### Forçar re-deploy
Vercel painel → último deployment → `...` → **Redeploy**. Usa cache do build. Se quer bust: **Redeploy** com "Use existing build cache" OFF.

### Desregistrar service worker (dev)
DevTools → Application → Service Workers → Unregister. Depois Hard Refresh.

### Aplicar migration SQL
```bash
# via Supabase CLI local
supabase db push

# ou via MCP
# mcp__claude_ai_Supabase__apply_migration com o conteúdo
```

### Deploy edge function
```bash
supabase functions deploy <nome>
```

---

## Contas externas

| Serviço | URL | ID/Projeto |
|---|---|---|
| Sentry | https://sentry.io | org `o4511269047500800`, project `4511269057003520` |
| PostHog | https://us.posthog.com | project `394122` |
| Supabase | painel por tenant | — |
| Vercel | https://vercel.com | projeto `listaveztexas` |

---

## Monitoramento pro rollout (quando escalar vendor)

Durante a primeira semana de rollout controlado, checar diariamente:

1. **Sentry**: algum issue novo em `environment=vendor` com `users affected >= 2`?
2. **PostHog**: funil `vendor_login_success → vendor_vm_task_submitted`. Queda grande indica abandono.
3. **Supabase logs**: WARNING ou ERROR nos Postgres logs?

Se 3 dias sem anomalia → pode expandir pro resto das vendedoras.

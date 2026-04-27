// minhavez - Edge Function: create-vendor-auth
// Creates or resets an auth user for a vendor record.
//
// Payload:
//   { tenant_id, vendedor_id, email?, password, mode: 'create' | 'reset' }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

async function resolveCallerTenantRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string
) {
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, plano, status, owner_user_id')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenant) return { tenant: null, role: null }
  if (tenant.owner_user_id === userId) return { tenant, role: 'owner' }

  const { data: membership } = await supabaseAdmin
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  return { tenant, role: membership?.role ?? null }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Nao autenticado' }, 401, cors)
    }

    const payload = await req.json().catch(() => null)
    if (!payload) return json({ error: 'Payload invalido' }, 400, cors)

    const { tenant_id, vendedor_id, email, password, mode } = payload as {
      tenant_id?: string
      vendedor_id?: string
      email?: string
      password?: string
      mode?: 'create' | 'reset'
    }

    if (!tenant_id || !vendedor_id || !mode) {
      return json({ error: 'Campos obrigatorios faltando' }, 400, cors)
    }
    if (mode !== 'create' && mode !== 'reset') {
      return json({ error: 'Modo invalido' }, 400, cors)
    }
    if (!password || password.length < 8) {
      return json({ error: 'Senha precisa ter ao menos 8 caracteres' }, 400, cors)
    }
    if (mode === 'create' && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return json({ error: 'Email invalido' }, 400, cors)
    }

    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    })

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ error: 'Sessao invalida' }, 401, cors)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { tenant, role: callerRole } = await resolveCallerTenantRole(
      supabaseAdmin,
      userData.user.id,
      tenant_id
    )

    if (!tenant) {
      return json({ error: 'Tenant nao encontrado' }, 404, cors)
    }
    if (!callerRole || !['owner', 'admin', 'gerente'].includes(callerRole)) {
      return json({ error: 'Apenas owner/admin/gerente podem criar login de vendedor' }, 403, cors)
    }
    if (tenant.status !== 'active') {
      return json({ error: 'Tenant inativo' }, 403, cors)
    }
    if (tenant.plano !== 'elite') {
      return json({ error: 'Criar login de vendedor e exclusivo do plano Elite' }, 403, cors)
    }

    const { data: vendedor, error: vendedorErr } = await supabaseAdmin
      .from('vendedores')
      .select('id, tenant_id, auth_user_id')
      .eq('id', vendedor_id)
      .single()

    if (vendedorErr || !vendedor) {
      return json({ error: 'Vendedor nao encontrado' }, 404, cors)
    }
    if (vendedor.tenant_id !== tenant_id) {
      return json({ error: 'Vendedor nao pertence ao tenant informado' }, 403, cors)
    }

    if (mode === 'reset') {
      if (!vendedor.auth_user_id) {
        return json({ error: 'Este vendedor ainda nao tem login criado' }, 400, cors)
      }
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(vendedor.auth_user_id, {
        password
      })
      if (updateErr) {
        return json({ error: 'Erro ao atualizar senha: ' + updateErr.message }, 500, cors)
      }
      return json({ ok: true }, 200, cors)
    }

    if (vendedor.auth_user_id) {
      return json({ error: 'Este vendedor ja tem um login vinculado' }, 409, cors)
    }

    const normalizedEmail = email!.trim().toLowerCase()
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const clash = existingUsers?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail)
    if (clash) {
      return json({ error: 'Ja existe um usuario com esse email' }, 409, cors)
    }

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { user_role: 'vendedor', tenant_id, vendedor_id }
    })
    if (createErr || !newUser?.user) {
      return json({ error: 'Erro ao criar usuario: ' + (createErr?.message ?? 'unknown') }, 500, cors)
    }
    const newAuthUserId = newUser.user.id

    const { error: tenantUserErr } = await supabaseAdmin.from('tenant_users').insert({
      tenant_id,
      user_id: newAuthUserId,
      role: 'vendedor'
    })
    if (tenantUserErr) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId).catch(() => {})
      return json({ error: 'Erro ao registrar vinculo: ' + tenantUserErr.message }, 500, cors)
    }

    const { error: linkErr } = await supabaseAdmin
      .from('vendedores')
      .update({ auth_user_id: newAuthUserId })
      .eq('id', vendedor_id)
      .eq('tenant_id', tenant_id)

    if (linkErr) {
      await supabaseAdmin.from('tenant_users').delete().eq('user_id', newAuthUserId).catch(() => {})
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId).catch(() => {})
      return json({ error: 'Erro ao vincular vendedor: ' + linkErr.message }, 500, cors)
    }

    return json({ ok: true, email: normalizedEmail, auth_user_id: newAuthUserId }, 200, cors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: 'Erro interno: ' + msg }, 500, cors)
  }
})

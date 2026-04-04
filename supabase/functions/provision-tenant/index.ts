// provision-tenant Edge Function
// Creates a new tenant with vendors and auth users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, nome_loja, slug, setores, vendedores, owner_email, owner_password } = await req.json()

    // Validate required fields
    if (!nome_loja || !slug || !setores?.length || !vendedores?.length) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios faltando' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3) {
      return new Response(JSON.stringify({ error: 'Slug inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Admin client with service_role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Validate onboarding token if provided
    let onboardingToken = null
    let ownerEmail = null
    let plano = 'pro'

    if (token) {
      const { data: tkData, error: tkErr } = await supabaseAdmin
        .from('onboarding_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (tkErr || !tkData) {
        return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      onboardingToken = tkData
      ownerEmail = tkData.email
      plano = tkData.plano || 'starter'
    }

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Este slug já está em uso. Escolha outro.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine max_vendedores by plan
    const planLimits: Record<string, number> = { starter: 5, pro: 15, advanced: 30 }
    const maxVendedores = planLimits[plano] || 15

    // Create or find owner auth user
    let ownerUserId: string | null = null

    // Prefer email/password from wizard; fall back to token email
    const finalOwnerEmail = owner_email || ownerEmail
    const finalOwnerPassword = owner_password || crypto.randomUUID().slice(0, 16)

    if (finalOwnerEmail) {
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find(u => u.email === finalOwnerEmail)

      if (existingUser) {
        ownerUserId = existingUser.id
        // Update password if provided from wizard
        if (owner_password) {
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password: owner_password
          })
        }
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: finalOwnerEmail,
          password: finalOwnerPassword,
          email_confirm: true,
          user_metadata: { user_role: 'owner' }
        })
        if (createErr) {
          return new Response(JSON.stringify({ error: 'Erro ao criar usuário: ' + createErr.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        ownerUserId = newUser.user!.id
      }
      ownerEmail = finalOwnerEmail
    }

    // Create tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({
        nome_loja,
        slug,
        plano,
        max_vendedores: maxVendedores,
        owner_email: ownerEmail,
        owner_user_id: ownerUserId,
        setores,
        status: 'active',
        cor_primaria: '#E11D48'
      })
      .select()
      .single()

    if (tenantErr) {
      return new Response(JSON.stringify({ error: 'Erro ao criar tenant: ' + tenantErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tenantId = tenant.id

    // Update owner's user_metadata with tenant_id
    if (ownerUserId) {
      await supabaseAdmin.auth.admin.updateUserById(ownerUserId, {
        user_metadata: { user_role: 'owner', tenant_id: tenantId }
      })

      // Create tenant_users entry for owner
      await supabaseAdmin.from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: ownerUserId,
        role: 'owner'
      })
    }

    // Create recepcionista auth user for PIN login
    // We create one shared recepcionista user per tenant
    const recEmail = `recepcao_${slug}@minhavez.app`
    const recPassword = `rec_${tenantId}_${crypto.randomUUID().slice(0, 8)}`

    const { data: recUser, error: recErr } = await supabaseAdmin.auth.admin.createUser({
      email: recEmail,
      password: recPassword,
      email_confirm: true,
      user_metadata: { user_role: 'recepcionista', tenant_id: tenantId }
    })

    if (!recErr && recUser.user) {
      await supabaseAdmin.from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: recUser.user.id,
        role: 'recepcionista'
      })
    }

    // Create vendedores
    const vendedorInserts = vendedores.map((v: { nome: string; setor: string; pin: string }, idx: number) => ({
      tenant_id: tenantId,
      nome: v.nome,
      setor: v.setor,
      pin: v.pin,
      status: 'fora',
      posicao_fila: idx + 1
    }))

    const { error: vendErr } = await supabaseAdmin
      .from('vendedores')
      .insert(vendedorInserts)

    if (vendErr) {
      return new Response(JSON.stringify({ error: 'Erro ao criar vendedores: ' + vendErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create PIN entries in tenant_users for each vendor
    for (const v of vendedores) {
      const { error: pinErr } = await supabaseAdmin.from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: recUser?.user?.id || null,
        role: 'recepcionista',
        pin: v.pin
      })
      // Ignore duplicate PIN errors silently
    }

    // Mark onboarding token as used
    if (onboardingToken) {
      await supabaseAdmin
        .from('onboarding_tokens')
        .update({ used: true, tenant_id: tenantId })
        .eq('id', onboardingToken.id)
    }

    // Generate session for the owner if we have one
    if (ownerUserId) {
      const { data: sessionData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: ownerEmail!
      })
      // We can't directly create a session, so we return the tenant info
      // The frontend will handle login
    }

    return new Response(JSON.stringify({
      success: true,
      tenant_id: tenantId,
      slug,
      nome_loja,
      owner_email: ownerEmail,
      rec_email: recEmail,
      rec_password: recPassword
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

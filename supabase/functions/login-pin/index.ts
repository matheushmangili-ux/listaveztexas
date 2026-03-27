// login-pin Edge Function
// Tenant-scoped PIN authentication
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { slug, pin } = await req.json()

    if (!slug || !pin || pin.length !== 4) {
      return new Response(JSON.stringify({ error: 'Slug e PIN são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Resolve tenant from slug
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .single()

    if (tenantErr || !tenant) {
      return new Response(JSON.stringify({ error: 'Loja não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Look up PIN in vendedores for this tenant
    const { data: vendedor, error: vendErr } = await supabaseAdmin
      .from('vendedores')
      .select('id, nome, pin')
      .eq('tenant_id', tenant.id)
      .eq('pin', pin)
      .maybeSingle()

    if (!vendedor) {
      return new Response(JSON.stringify({ error: 'PIN inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find the recepcionista auth user for this tenant
    const { data: tenantUser } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenant.id)
      .eq('role', 'recepcionista')
      .limit(1)
      .single()

    if (!tenantUser?.user_id) {
      return new Response(JSON.stringify({ error: 'Usuário recepcionista não encontrado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get the recepcionista auth user's email
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(tenantUser.user_id)

    if (!authUser?.user?.email) {
      return new Response(JSON.stringify({ error: 'Erro ao recuperar credenciais' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Ensure the user has correct tenant_id in metadata
    await supabaseAdmin.auth.admin.updateUserById(tenantUser.user_id, {
      user_metadata: { user_role: 'recepcionista', tenant_id: tenant.id }
    })

    // Generate a magic link token for the recepcionista
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email
    })

    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: 'Erro ao gerar sessão' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Extract the token from the link and verify it to get a session
    const url = new URL(linkData.properties.action_link)
    const tokenHash = url.searchParams.get('token') || url.hash?.split('token=')[1]?.split('&')[0]

    // Use verifyOtp to generate a real session
    const { data: session, error: sessionErr } = await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink'
    })

    if (sessionErr || !session?.session) {
      return new Response(JSON.stringify({ error: 'Erro ao criar sessão: ' + (sessionErr?.message || 'desconhecido') }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      user: session.user,
      vendedor_nome: vendedor.nome
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

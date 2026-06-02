// vendor-onboard — DESCONTINUADA (tombstone)
// =============================================================================
// Esta função foi substituída por `create-vendor-auth`, que é o ÚNICO caminho
// oficial de criação de acesso de vendedor:
//   - é elite-gated (plano);
//   - seta user_metadata.user_role = 'vendedor' (necessário pro login/RLS);
//   - insere a linha em tenant_users.
//
// A versão antiga (deployada solta como v5, sem fonte no repo) divergia:
// criava o auth user SEM user_role e SEM tenant_users, gerando logins de
// vendedor quebrados. Ficou órfã (nenhuma UI a chamava).
//
// Mantemos só este tombstone, versionado no repo, que responde 410 Gone para
// qualquer cliente legado. NÃO reativar a lógica antiga — use create-vendor-auth.
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://listaveztexas.vercel.app',
  'https://listaveztexas-matheushmangili-8230s-projects.vercel.app',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve((req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      ok: false,
      code: 'DEPRECATED',
      error: 'vendor-onboard foi descontinuada. Use create-vendor-auth.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})

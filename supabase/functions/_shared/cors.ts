const ALLOWED_ORIGINS = [
  'https://listaveztexas.vercel.app',
  'https://listaveztexas-matheushmangili-8230s-projects.vercel.app',
  'http://localhost:3000',
]

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

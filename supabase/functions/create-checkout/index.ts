// create-checkout Edge Function
// Creates a Stripe Checkout Session for purchasing a MinhaVez plan
import { corsHeaders } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'

// Stripe price ID (single plan)
const PRICE_ID = Deno.env.get('STRIPE_PRICE_STARTER') || Deno.env.get('STRIPE_PRICE_PRO') || ''

async function stripeRequest(endpoint: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(body).toString()
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { plano, email } = await req.json()

    if (!plano || !email) {
      return new Response(JSON.stringify({ error: 'Plano e email são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!PRICE_ID) {
      return new Response(JSON.stringify({ error: 'Preço não configurado. Contate o suporte.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create Stripe Checkout Session
    const session = await stripeRequest('/checkout/sessions', {
      'mode': 'subscription',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      'customer_email': email,
      'success_url': `${BASE_URL}/setup?token={CHECKOUT_SESSION_ID}&plano=${plano}`,
      'cancel_url': `${BASE_URL}/landing.html#precos`,
      'metadata[plano]': plano,
      'metadata[email]': email,
      'allow_promotion_codes': 'true',
      'billing_address_collection': 'required',
      'locale': 'pt-BR'
    })

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      sessionId: session.id,
      url: session.url
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

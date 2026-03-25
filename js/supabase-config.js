// ============================================
// ListaVez Texas — Supabase Config
// ============================================
// Preencha com as credenciais do seu projeto Supabase

const SUPABASE_URL = 'SUA_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'SUA_SUPABASE_ANON_KEY';

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    if (typeof window.supabase === 'undefined') {
      throw new Error('Supabase JS library not loaded. Add the CDN script tag.');
    }
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };

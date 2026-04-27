// ============================================
// minhavez Vendedor — Bootstrap + auth + routing
// ============================================
import { getSupabase } from '/js/supabase-config.js';
import { initHome, unmountHome } from '/js/vendor-home.js';

const sb = getSupabase();

// DOM refs
const screenLogin = document.getElementById('screenLogin');
const screenHome = document.getElementById('screenHome');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLogin = document.getElementById('btnLogin');

// ─── Toast helper (usado pelo home também via window) ───
const toastEl = document.getElementById('vendorToast');
let _toastTimer = null;
window._vendorToast = function (msg, type = 'info', ms = 3000) {
  clearTimeout(_toastTimer);
  toastEl.textContent = msg;
  toastEl.className = 'vendor-toast ' + (type || '');
  toastEl.classList.remove('hidden');
  _toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
};

// ─── Screen routing ───
function showLogin() {
  screenLogin.classList.remove('hidden');
  screenHome.classList.add('hidden');
  unmountHome();
  emailInput.focus();
}

async function showHome() {
  screenLogin.classList.add('hidden');
  screenHome.classList.remove('hidden');
  await initHome(sb);
}

// ─── Login handler ───
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginError.classList.add('hidden');
  btnLogin.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Garante que é vendedor
    const role = data.user?.user_metadata?.user_role;
    if (role !== 'vendedor') {
      await sb.auth.signOut({ scope: 'local' });
      throw new Error('Essa conta não é de vendedor. Use o login do tablet/dashboard.');
    }

    // Telemetria: identify pra poder correlacionar eventos futuros ao
    // vendedor. Usa o auth user UUID (estavel entre sessoes). Tag de
    // tenant_slug ajuda filtrar funil por cliente em rollouts multi-tenant.
    try {
      const tenantSlug = localStorage.getItem('lv-last-slug') || null;
      window.minhavezAnalytics?.identify(data.user.id, {
        user_role: 'vendedor',
        tenant_slug: tenantSlug
      });
      window.minhavezAnalytics?.capture('vendor_login_success', { tenant_slug: tenantSlug });
    } catch (_e) {
      // analytics nao pode bloquear o fluxo de login
    }

    await showHome();
  } catch (err) {
    const raw = err?.message || '';
    let msg;
    let reason = 'unknown';
    if (!navigator.onLine) {
      msg = 'Sem conexão. Confira sua internet e tente de novo.';
      reason = 'offline';
    } else if (/invalid login credentials/i.test(raw)) {
      msg = 'Email ou senha incorretos.';
      reason = 'invalid_credentials';
    } else if (/rate limit|too many/i.test(raw)) {
      msg = 'Muitas tentativas. Aguarde um instante e tente novamente.';
      reason = 'rate_limit';
    } else if (/email not confirmed/i.test(raw)) {
      msg = 'Email ainda não confirmado. Confira sua caixa de entrada.';
      reason = 'email_not_confirmed';
    } else if (/conta não é de vendedor/i.test(raw)) {
      msg = raw;
      reason = 'wrong_role';
    } else {
      msg = raw || 'Falha no login. Tente novamente.';
    }
    try {
      window.minhavezAnalytics?.capture('vendor_login_failed', { reason });
    } catch (_e) {
      /* ignore */
    }
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  } finally {
    btnLogin.disabled = false;
  }
});

// ─── Logout handler (exposto pra home chamar) ───
// Flag pra distinguir logout deliberado (user clicou "Sair") de logout
// involuntário (refresh token expirou). Sem isso, o listener de authstate
// mostraria o toast "Sua sessão expirou" em cima do clique do user.
let _intentionalLogout = false;

window._vendorLogout = async function () {
  _intentionalLogout = true;
  try {
    window.minhavezAnalytics?.capture('vendor_logout');
    window.minhavezAnalytics?.reset();
  } catch (_e) {
    /* ignore */
  }
  try {
    await sb.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[logout] erro:', e);
  }
  _intentionalLogout = false;
  showLogin();
};

// ─── Auth state listener ───
// Escuta SIGNED_OUT disparado pelo próprio Supabase quando o refresh token
// falha (sessão expirou, user deslogado de outro device, token revogado).
// Sem isso, o vendor ficava na home com todas as RPCs retornando 401 em
// silêncio — user só percebia pelo app "travado" sem nunca carregar dados.
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && !_intentionalLogout) {
    if (!screenHome.classList.contains('hidden')) {
      window._vendorToast?.('Sua sessão expirou. Faça login novamente.', 'info', 5000);
    }
    showLogin();
  }
});

// ─── Bootstrap: checa sessão existente ───
(async function boot() {
  // Service worker registration (pro push listener depois)
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('[sw register] falhou:', e);
    }
  }

  const {
    data: { session }
  } = await sb.auth.getSession();
  if (session?.user?.user_metadata?.user_role === 'vendedor') {
    await showHome();
  } else {
    showLogin();
  }
})();

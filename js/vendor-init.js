// ============================================
// minhavez Vendedor — Bootstrap + auth + routing
// ============================================
import { getSupabase } from '/js/supabase-config.js';
import { getAuthContext } from '/js/auth.js';
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
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('loginPin');
const lojaInput = document.getElementById('loginLoja');
const pinLojaField = document.getElementById('pinLojaField');
const pinLojaLabel = document.getElementById('pinLojaLabel');
const btnLoginPin = document.getElementById('btnLoginPin');

// Slug da loja pro login por PIN: ?loja= na URL (semeado pelo link do WhatsApp)
// ou cacheado. PIN só é único dentro da loja, então precisamos do slug antes.
function getKnownSlug() {
  const fromUrl = (new URLSearchParams(location.search).get('loja') || '').trim().toLowerCase();
  if (fromUrl) {
    localStorage.setItem('lv-last-slug', fromUrl);
    return fromUrl;
  }
  return (localStorage.getItem('lv-last-slug') || '').trim().toLowerCase();
}

function updatePinLojaUI() {
  const slug = getKnownSlug();
  if (slug) {
    pinLojaLabel.innerHTML = `Loja: <strong>${slug.replace(/[<>&]/g, '')}</strong>`;
    pinLojaLabel.classList.remove('hidden');
    pinLojaField.classList.add('hidden');
  } else {
    pinLojaLabel.classList.add('hidden');
    pinLojaField.classList.remove('hidden');
  }
}

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
  // PIN é o método padrão; email fica como alternativa.
  loginForm.classList.add('hidden');
  pinForm.classList.remove('hidden');
  loginError.classList.add('hidden');
  updatePinLojaUI();
  pinInput.focus();
}

async function showHome() {
  screenLogin.classList.add('hidden');
  screenHome.classList.remove('hidden');
  await initHome(sb);
}

async function isVendorUser(user) {
  const context = await getAuthContext(user);
  return context?.role === 'vendedor';
}

// ─── Login handler ───
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginError.classList.add('hidden');
  btnLogin.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    loginError.textContent = 'Preencha email e senha.';
    loginError.classList.remove('hidden');
    btnLogin.disabled = false;
    return;
  }

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Garante que é vendedor
    if (!(await isVendorUser(data.user))) {
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

// ─── Login por PIN ───
pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginError.classList.add('hidden');

  const pin = pinInput.value.trim();
  const slug = getKnownSlug() || (lojaInput.value || '').trim().toLowerCase();

  if (!/^\d{4}$/.test(pin)) {
    loginError.textContent = 'Digite seu PIN de 4 dígitos.';
    loginError.classList.remove('hidden');
    return;
  }
  if (!slug) {
    loginError.textContent = 'Informe o código da loja.';
    loginError.classList.remove('hidden');
    updatePinLojaUI();
    return;
  }

  btnLoginPin.disabled = true;
  try {
    const res = await fetch(`${sb.supabaseUrl}/functions/v1/vendor-login-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sb.supabaseKey}` },
      body: JSON.stringify({ slug, pin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'PIN inválido');
    if (data.access_token) {
      await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    }
    localStorage.setItem('lv-last-slug', slug);

    const {
      data: { session }
    } = await sb.auth.getSession();
    if (!session?.user || !(await isVendorUser(session.user))) {
      await sb.auth.signOut({ scope: 'local' });
      throw new Error('Esse acesso não é de vendedor.');
    }
    try {
      window.minhavezAnalytics?.identify(session.user.id, { user_role: 'vendedor', tenant_slug: slug });
      window.minhavezAnalytics?.capture('vendor_login_success', { tenant_slug: slug, method: 'pin' });
    } catch (_e) {
      /* analytics não bloqueia login */
    }
    pinInput.value = '';
    await showHome();
  } catch (err) {
    if (!navigator.onLine) {
      loginError.textContent = 'Sem conexão. Confira sua internet e tente de novo.';
    } else {
      loginError.textContent = err?.message || 'Falha no login. Tente novamente.';
    }
    loginError.classList.remove('hidden');
    try {
      window.minhavezAnalytics?.capture('vendor_login_failed', { reason: 'pin', method: 'pin' });
    } catch (_e) {
      /* ignore */
    }
  } finally {
    btnLoginPin.disabled = false;
  }
});

// ─── Toggle PIN <-> email ───
document.getElementById('switchToEmail').addEventListener('click', () => {
  pinForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  loginError.classList.add('hidden');
  emailInput.focus();
});
document.getElementById('switchToPin').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  pinForm.classList.remove('hidden');
  loginError.classList.add('hidden');
  updatePinLojaUI();
  pinInput.focus();
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
  if (session?.user && (await isVendorUser(session.user))) {
    await showHome();
  } else {
    showLogin();
  }
})();

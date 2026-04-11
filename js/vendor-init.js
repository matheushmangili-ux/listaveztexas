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

    await showHome();
  } catch (err) {
    loginError.textContent = err?.message || 'Falha no login';
    loginError.classList.remove('hidden');
  } finally {
    btnLogin.disabled = false;
  }
});

// ─── Logout handler (exposto pra home chamar) ───
window._vendorLogout = async function () {
  try {
    await sb.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[logout] erro:', e);
  }
  showLogin();
};

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

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.user_metadata?.user_role === 'vendedor') {
    await showHome();
  } else {
    showLogin();
  }
})();

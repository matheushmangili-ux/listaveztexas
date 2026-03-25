// ============================================
// ListaVez Texas — Auth Module
// ============================================
import { getSupabase } from './supabase-config.js';

const sb = getSupabase();

export async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function loginWithPin(pin) {
  // PIN maps to a pre-configured user email: pin_XXXX@listavez.local
  const email = `pin_${pin}@listavez.local`;
  const password = `pin_${pin}_texas`;
  return login(email, password);
}

export async function logout() {
  await sb.auth.signOut();
  window.location.href = '/index.html';
}

export async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export function getRole(user) {
  return user?.user_metadata?.user_role || null;
}

export async function requireRole(allowedRoles) {
  const user = await getUser();
  if (!user) {
    window.location.href = '/index.html';
    return null;
  }
  const role = getRole(user);
  if (!allowedRoles.includes(role)) {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

export function redirectByRole(user) {
  const role = getRole(user);
  if (role === 'recepcionista') {
    window.location.href = '/tablet.html';
  } else if (role === 'gerente' || role === 'admin') {
    window.location.href = '/dashboard.html';
  }
}

// ============================================
// ListaVez — Auth Module (Multi-Tenant)
// ============================================
import { getSupabase } from './supabase-config.js';
import { getSlug, tenantPath } from './tenant.js';

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
  const slug = getSlug();
  window.location.href = slug ? `/${slug}/login` : '/landing.html';
}

export async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export function getRole(user) {
  return user?.user_metadata?.user_role || null;
}

export function getTenantId(user) {
  return user?.user_metadata?.tenant_id || null;
}

export async function requireRole(allowedRoles) {
  const user = await getUser();
  if (!user) {
    window.location.href = tenantPath('/login');
    return null;
  }
  const role = getRole(user);
  if (!allowedRoles.includes(role)) {
    window.location.href = tenantPath('/login');
    return null;
  }
  return user;
}

export function redirectByRole(user) {
  const role = getRole(user);
  if (role === 'recepcionista') {
    window.location.href = tenantPath('/tablet');
  } else if (role === 'gerente' || role === 'admin' || role === 'owner') {
    window.location.href = tenantPath('/dashboard');
  }
}

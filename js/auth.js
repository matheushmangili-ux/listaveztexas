// ============================================
// MinhaVez — Auth Module (Multi-Tenant)
// ============================================
import { getSupabase } from './supabase-config.js';
import { getSlug, tenantPath, clearTenantCache } from './tenant.js';

const sb = getSupabase();

export async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function loginWithPin(pin) {
  const slug = getSlug();
  // Try Edge Function for tenant-scoped PIN auth
  if (slug) {
    const res = await fetch(`${sb.supabaseUrl}/functions/v1/login-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sb.supabaseKey}`
      },
      body: JSON.stringify({ slug, pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'PIN inválido');
    // Set the session returned by the Edge Function
    if (data.access_token) {
      await sb.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
    }
    return data.user;
  }
  // No slug = no tenant context, PIN login not possible
  throw new Error('Contexto de loja não encontrado. Acesse pela URL correta.');
}

export async function logout() {
  const slug = getSlug();
  const target = slug ? `/${slug}/login` : '/landing.html';
  try {
    await sb.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('[logout] signOut error:', e);
  }
  clearTenantCache();
  window.location.replace(target);
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

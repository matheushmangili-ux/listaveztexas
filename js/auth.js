// ============================================
// MinhaVez — Auth Module (Multi-Tenant)
// ============================================
import { getSupabase } from './supabase-config.js';
import { getSlug, tenantPath, clearTenantCache } from './tenant.js';

const sb = getSupabase();
let cachedAuthContext = null;

export async function login(email, password) {
  cachedAuthContext = null;
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
        Authorization: `Bearer ${sb.supabaseKey}`
      },
      body: JSON.stringify({ slug, pin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'PIN inválido');
    // Set the session returned by the Edge Function
    if (data.access_token) {
      cachedAuthContext = null;
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
  cachedAuthContext = null;
  window.location.replace(target);
}

export async function getUser() {
  const {
    data: { user }
  } = await sb.auth.getUser();
  return user;
}

export function getRole(user) {
  if (cachedAuthContext?.user?.id === user?.id) return cachedAuthContext.role;
  return user?.user_metadata?.user_role || null;
}

export function getTenantId(user) {
  if (cachedAuthContext?.user?.id === user?.id) return cachedAuthContext.tenantId;
  return user?.user_metadata?.tenant_id || null;
}

export async function getAuthContext(user = null) {
  const currentUser = user || (await getUser());
  if (!currentUser) return null;
  if (cachedAuthContext?.user?.id === currentUser.id) return cachedAuthContext;

  const metadataRole = currentUser.user_metadata?.user_role || null;
  const metadataTenantId = currentUser.user_metadata?.tenant_id || null;
  let role = metadataRole;
  let tenantId = metadataTenantId;

  try {
    const [roleResult, tenantResult] = await Promise.all([sb.rpc('get_my_tenant_role'), sb.rpc('get_my_tenant_id')]);
    if (!roleResult.error && roleResult.data) role = roleResult.data;
    if (!tenantResult.error && tenantResult.data) tenantId = tenantResult.data;
  } catch (_) {
    // Metadata remains a compatibility fallback until every environment has sql/45.
  }

  cachedAuthContext = { user: currentUser, role, tenantId };
  return cachedAuthContext;
}

export async function requireRole(allowedRoles) {
  const context = await getAuthContext();
  const user = context?.user || null;
  if (!user) {
    window.location.replace(tenantPath('/login'));
    return null;
  }
  if (!allowedRoles.includes(context.role)) {
    window.location.replace(tenantPath('/login'));
    return null;
  }
  return user;
}

export async function redirectByRole(user) {
  const context = await getAuthContext(user);
  const role = context?.role || null;
  if (role === 'recepcionista') {
    window.location.replace(tenantPath('/tablet'));
  } else if (role === 'gerente' || role === 'admin' || role === 'owner') {
    window.location.replace(tenantPath('/dashboard'));
  } else if (role === 'vendedor') {
    window.location.replace(tenantPath('/vendor'));
  }
}

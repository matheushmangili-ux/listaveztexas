// ============================================
// MinhaVez — Tenant Module
// Resolves tenant from URL slug, loads context
// ============================================
import { getSupabase } from './supabase-config.js';

let _tenantCache = null;
let _slug = null;

/**
 * Extract tenant slug from URL path.
 * Expected: /texascenter/tablet, /minhaloja/login, etc.
 * Returns null for root paths like /landing.html
 */
export function getSlug() {
  if (_slug !== null) return _slug;
  const parts = window.location.pathname.split('/').filter(Boolean);
  const reserved = [
    'landing.html',
    'landing',
    'index.html',
    'index',
    'dashboard.html',
    'dashboard',
    'tablet.html',
    'tablet',
    'settings.html',
    'settings',
    'setup.html',
    'css',
    'js',
    'assets',
    'sw.js',
    'manifest.json',
    'setup'
  ];
  if (parts.length >= 1 && !reserved.includes(parts[0])) {
    _slug = parts[0];
  } else {
    _slug = '';
  }
  return _slug || null;
}

/**
 * Build a path with the current tenant slug prefix.
 * tenantPath('/tablet') → '/texascenter/tablet'
 */
export function tenantPath(path) {
  const slug = getSlug();
  if (!slug) return path;
  return `/${slug}${path}`;
}

/**
 * Load tenant context from Supabase via resolve_tenant RPC.
 * Returns { id, nome_loja, logo_url, cor_primaria, setores } or null.
 * Redirects to /landing if slug is invalid or tenant not found.
 */
export async function loadTenant() {
  if (_tenantCache) return _tenantCache;

  const slug = getSlug();
  if (!slug) {
    window.location.href = '/landing.html';
    return null;
  }

  const sb = getSupabase();
  const { data, error } = await sb.rpc('resolve_tenant', { p_slug: slug });

  if (error || !data || data.length === 0) {
    window.location.href = '/landing.html';
    return null;
  }

  _tenantCache = data[0];
  return _tenantCache;
}

/**
 * Clear cached tenant and slug (call on logout or tenant switch).
 */
export function clearTenantCache() {
  _tenantCache = null;
  _slug = null;
}

/**
 * Apply tenant branding (accent color, page title).
 */
export function applyBranding(tenant) {
  if (!tenant) return;
  // NÃO sobrescrever --accent: paleta minhavez (mint) é padrão global.
  // Rebranding white-label per-tenant pode voltar depois como feature Elite.
  // if (tenant.cor_primaria) {
  //   document.documentElement.style.setProperty('--accent', tenant.cor_primaria);
  // }
  if (tenant.nome_loja) {
    document.title = `Minha Vez — ${tenant.nome_loja}`;
  }
}

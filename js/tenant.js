// ============================================
// MinhaVez — Tenant Module
// Resolves tenant from URL slug, loads context
// ============================================
import { getSupabase } from './supabase-config.js';
import { deriveAccentVariants } from './utils.js';

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
 * Por padrão, redireciona pra /landing se slug ausente ou tenant não encontrado.
 * Passe { redirectOnMissing: false } pra obter null em vez de redirecionar
 * (usado pelo login, que precisa mostrar um passo "qual é sua loja?").
 */
export async function loadTenant({ redirectOnMissing = true } = {}) {
  if (_tenantCache) return _tenantCache;

  const slug = getSlug();
  if (!slug) {
    if (redirectOnMissing) window.location.href = '/landing.html';
    return null;
  }

  const sb = getSupabase();
  const { data, error } = await sb.rpc('resolve_tenant', { p_slug: slug });

  if (error || !data || data.length === 0) {
    if (redirectOnMissing) window.location.href = '/landing.html';
    return null;
  }

  _tenantCache = data[0];
  try {
    localStorage.setItem('lv-last-slug', slug);
  } catch (_) {
    /* storage indisponível — ignora */
  }
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
 * cor_primaria só vem preenchido quando resolve_tenant gateia por plano='elite'
 * (vide sql/34-resolve-tenant-white-label.sql). Gate server-side — sem checar
 * plano aqui.
 *
 * Setamos os tokens v54 (`--mv-primary*`, `--mv-brand-*`) que o CSS realmente
 * usa, e MANTEMOS o shim legado (`--accent*`, `--gold*`, `--success*`) por
 * compatibilidade com qualquer JS/template não-migrado.
 */
export function applyBranding(tenant) {
  if (!tenant) return;
  if (tenant.cor_primaria) {
    const v = deriveAccentVariants(tenant.cor_primaria);
    if (v) {
      const root = document.documentElement.style;
      // Tokens v54 (o que o CSS efetivamente lê)
      root.setProperty('--mv-primary', v.base);
      root.setProperty('--mv-primary-hover', v.dim);
      root.setProperty('--mv-on-primary', v.ink);
      root.setProperty('--mv-brand-400', v.bright);
      root.setProperty('--mv-brand-500', v.base);
      root.setProperty('--mv-brand-600', v.base);
      root.setProperty('--mv-brand-700', v.dim);
      // Shim legado v52 — preserva compat com JS/templates não-migrados.
      // Pode sair em v55 quando todo o codebase usar --mv-* exclusivamente.
      root.setProperty('--accent', v.base);
      root.setProperty('--accent-bright', v.bright);
      root.setProperty('--accent-dim', v.dim);
      root.setProperty('--accent-ink', v.ink);
    }
  }
  if (tenant.nome_loja) {
    document.title = `Minha Vez — ${tenant.nome_loja}`;
  }
}

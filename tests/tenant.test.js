import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests so getSlug cache doesn't leak
async function freshImport() {
  vi.resetModules();
  return await import('../js/tenant.js');
}

describe('getSlug', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/', href: 'http://localhost/' }
    });
  });

  it('retorna null para pathname raiz', async () => {
    window.location.pathname = '/';
    const { getSlug } = await freshImport();
    expect(getSlug()).toBe(null);
  });

  it('retorna null para paths reservados', async () => {
    window.location.pathname = '/landing.html';
    let { getSlug } = await freshImport();
    expect(getSlug()).toBe(null);

    window.location.pathname = '/dashboard';
    ({ getSlug } = await freshImport());
    expect(getSlug()).toBe(null);
  });

  it('extrai slug de /texascenter/login', async () => {
    window.location.pathname = '/texascenter/login';
    const { getSlug } = await freshImport();
    expect(getSlug()).toBe('texascenter');
  });

  it('extrai slug de /minhaloja/tablet', async () => {
    window.location.pathname = '/minhaloja/tablet';
    const { getSlug } = await freshImport();
    expect(getSlug()).toBe('minhaloja');
  });

  it('cacheia resultado entre chamadas', async () => {
    window.location.pathname = '/lojaA/dashboard';
    const { getSlug } = await freshImport();
    expect(getSlug()).toBe('lojaA');
    // Mudando pathname não afeta (cache)
    window.location.pathname = '/lojaB/dashboard';
    expect(getSlug()).toBe('lojaA');
  });
});

describe('tenantPath', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/', href: 'http://localhost/' }
    });
  });

  it('retorna path original quando não há slug', async () => {
    window.location.pathname = '/';
    const { tenantPath } = await freshImport();
    expect(tenantPath('/login')).toBe('/login');
  });

  it('prefixa com slug quando há tenant na URL', async () => {
    window.location.pathname = '/texascenter/dashboard';
    const { tenantPath } = await freshImport();
    expect(tenantPath('/login')).toBe('/texascenter/login');
    expect(tenantPath('/tablet')).toBe('/texascenter/tablet');
  });
});

describe('applyBranding', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--accent');
    document.title = '';
  });

  it('não faz nada quando tenant é null', async () => {
    const { applyBranding } = await freshImport();
    expect(() => applyBranding(null)).not.toThrow();
  });

  it('aplica cor primária e variantes derivadas às CSS vars', async () => {
    const { applyBranding } = await freshImport();
    applyBranding({ cor_primaria: '#ff0000', nome_loja: 'Loja X' });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--accent')).toBe('#ff0000');
    // bright/dim são derivadas via HSL; basta conferir que foram definidas
    expect(style.getPropertyValue('--accent-bright')).toMatch(/^#[0-9a-f]{6}$/);
    expect(style.getPropertyValue('--accent-dim')).toMatch(/^#[0-9a-f]{6}$/);
    // --gold e --success alinham com accent (mesma paleta)
    expect(style.getPropertyValue('--gold')).toBe('#ff0000');
    expect(style.getPropertyValue('--success')).toBe('#ff0000');
    // ink é preto ou branco
    expect(['#0d0d0d', '#ffffff']).toContain(style.getPropertyValue('--accent-ink'));
  });

  it('não aplica cor quando cor_primaria está ausente (tenant non-elite ou opt-out)', async () => {
    const { applyBranding } = await freshImport();
    applyBranding({ nome_loja: 'Loja Y', plano: 'pro' });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('atualiza document.title com nome_loja', async () => {
    const { applyBranding } = await freshImport();
    applyBranding({ nome_loja: 'Texas Center' });
    expect(document.title).toBe('Minha Vez — Texas Center');
  });
});

describe('clearTenantCache', () => {
  it('reseta cache do slug após clear', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/lojaA/dashboard', href: 'http://localhost/' }
    });
    const { getSlug, clearTenantCache } = await freshImport();
    expect(getSlug()).toBe('lojaA');
    clearTenantCache();
    window.location.pathname = '/lojaB/dashboard';
    expect(getSlug()).toBe('lojaB');
  });
});

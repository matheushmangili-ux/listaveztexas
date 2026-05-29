import { describe, it, expect, vi } from 'vitest';

// auth.js chama getSupabase() no topo do módulo, que exige window.supabase.
// Stubamos antes de importar e usamos resetModules pra limpar o cache de
// contexto/slug entre os casos.
async function freshAuth(rpcImpl) {
  vi.resetModules();
  window.supabase = {
    createClient: () => ({
      auth: {},
      rpc: rpcImpl || (() => Promise.resolve({ data: null, error: { message: 'no rpc' } }))
    })
  };
  return await import('../js/auth.js');
}

function setLocation(pathname) {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname, href: 'http://localhost' + pathname, replace }
  });
  return replace;
}

// rpc que responde role/tenant por nome — simula get_my_tenant_role/_id.
function rpcRole(role) {
  return (name) => Promise.resolve({ data: name === 'get_my_tenant_role' ? role : 'tenant-x', error: null });
}

describe('getRole / getTenantId — fallback de metadata', () => {
  it('lê user_role e tenant_id do metadata sem contexto cacheado', async () => {
    setLocation('/');
    const { getRole, getTenantId } = await freshAuth();
    const user = { id: 'u1', user_metadata: { user_role: 'gerente', tenant_id: 't1' } };
    expect(getRole(user)).toBe('gerente');
    expect(getTenantId(user)).toBe('t1');
  });

  it('retorna null quando não há metadata', async () => {
    setLocation('/');
    const { getRole, getTenantId } = await freshAuth();
    const user = { id: 'u2', user_metadata: {} };
    expect(getRole(user)).toBe(null);
    expect(getTenantId(user)).toBe(null);
  });
});

describe('redirectByRole — roteamento por papel', () => {
  const user = { id: 'u1', user_metadata: {} };

  it('vendedor → /:slug/vendor', async () => {
    const replace = setLocation('/texascenter/login');
    const { redirectByRole } = await freshAuth(rpcRole('vendedor'));
    await redirectByRole(user);
    expect(replace).toHaveBeenCalledWith('/texascenter/vendor');
  });

  it('recepcionista → /:slug/tablet', async () => {
    const replace = setLocation('/texascenter/login');
    const { redirectByRole } = await freshAuth(rpcRole('recepcionista'));
    await redirectByRole(user);
    expect(replace).toHaveBeenCalledWith('/texascenter/tablet');
  });

  it('gerente → /:slug/dashboard', async () => {
    const replace = setLocation('/texascenter/login');
    const { redirectByRole } = await freshAuth(rpcRole('gerente'));
    await redirectByRole(user);
    expect(replace).toHaveBeenCalledWith('/texascenter/dashboard');
  });

  it('owner/admin também vão pro dashboard', async () => {
    const replace = setLocation('/texascenter/login');
    const { redirectByRole } = await freshAuth(rpcRole('admin'));
    await redirectByRole(user);
    expect(replace).toHaveBeenCalledWith('/texascenter/dashboard');
  });

  it('cai no metadata quando a RPC de role falha', async () => {
    const replace = setLocation('/texascenter/login');
    const userG = { id: 'u3', user_metadata: { user_role: 'gerente' } };
    const { redirectByRole } = await freshAuth(() => Promise.resolve({ data: null, error: { message: 'rpc down' } }));
    await redirectByRole(userG);
    expect(replace).toHaveBeenCalledWith('/texascenter/dashboard');
  });

  it('papel desconhecido não redireciona pra lugar nenhum', async () => {
    const replace = setLocation('/texascenter/login');
    const { redirectByRole } = await freshAuth(rpcRole('faxineiro'));
    await redirectByRole(user);
    expect(replace).not.toHaveBeenCalled();
  });
});

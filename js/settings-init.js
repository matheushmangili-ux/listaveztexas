import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '/js/supabase-config.js';
import { requireRole, logout, getTenantId } from '/js/auth.js';
import { loadTenant, applyBranding, tenantPath } from '/js/tenant.js';
import { toast, initTheme, escapeHtml } from '/js/utils.js';
initTheme();

const sb = getSupabase();
let tenant = null;
let tenantId = null;
let vendedores = [];
let tenantSectors = [];
const VENDOR_SETTINGS_COLUMNS =
  'id,nome,apelido,status,posicao_fila,ativo,created_at,updated_at,tenant_id,setor,foto_url,auth_user_id,avatar_config,telefone';

(async function init() {
  tenant = await loadTenant();
  if (!tenant) return;
  applyBranding(tenant);

  const user = await requireRole(['gerente', 'admin', 'owner']);
  if (!user) return;

  tenantId = getTenantId(user) || tenant.id;
  tenantSectors = tenant.setores || ['loja'];

  // Load full tenant data
  const { data: tenantData } = await sb.from('tenants').select('*').eq('id', tenantId).single();
  if (tenantData) tenant = tenantData;

  // Load vendors
  const { data: vData, error: vErr } = await sb
    .from('vendedores')
    .select(VENDOR_SETTINGS_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('posicao_fila');
  if (vErr) {
    // Não esconder erro de carga como "lista vazia" — surfaça (já nos custou
    // um susto com a coluna telefone sem GRANT retornando 403).
    console.error('[settings] falha ao carregar vendedores:', vErr);
    toast('Erro ao carregar vendedores: ' + (vErr.message || 'recarregue a página'), 'error');
  }
  vendedores = vData || [];

  // Populate UI
  document.getElementById('settStoreName').value = tenant.nome_loja || '';
  document.getElementById('settLeadCapture').checked = !!tenant.exige_captura_lead;
  const color = tenant.cor_primaria || '#a8b1ff';
  document.getElementById('settColor').value = color;
  document.getElementById('settColorText').value = color;
  document.getElementById('colorSwatch').style.background = color;
  tenantSectors = tenant.setores || ['loja'];

  // White-label Elite: picker só aparece para plano elite; outros veem card de lock
  const isElite = tenant.plano === 'elite';
  document.getElementById('corPickerWrap').style.display = isElite ? '' : 'none';
  document.getElementById('corLockCard').style.display = isElite ? 'none' : '';
  document.getElementById('corEliteBadge').style.display = isElite ? 'none' : '';

  renderSettSectors();
  renderVendorList();
  populateLinks();
  populatePlan();
  loadCanais();

  document.getElementById('settingsLoader').style.display = 'none';
  document.getElementById('settingsContent').style.display = 'block';
})();

// Color sync
document.getElementById('settColor').addEventListener('input', (e) => {
  document.getElementById('settColorText').value = e.target.value;
  document.getElementById('colorSwatch').style.background = e.target.value;
});
document.getElementById('settColorText').addEventListener('input', (e) => {
  const v = e.target.value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    document.getElementById('settColor').value = v;
    document.getElementById('colorSwatch').style.background = v;
  }
});

document.getElementById('settNewSector').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') window.addSettSector();
});

document.getElementById('vmPin').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '');
});

// Sectors
function renderSettSectors() {
  document.getElementById('settSectors').innerHTML = tenantSectors
    .map(
      (s, i) => `
    <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:16px;font-size:12px;font-weight:600;color:var(--text-secondary)">
      ${s}
      <span onclick="removeSettSector(${i})" style="cursor:pointer;color:var(--text-muted);font-size:10px" title="Remover"><i class="fa-solid fa-xmark"></i></span>
    </span>
  `
    )
    .join('');
}

window.addSettSector = function () {
  const input = document.getElementById('settNewSector');
  const name = input.value.trim().toLowerCase();
  if (!name || tenantSectors.includes(name)) return;
  tenantSectors.push(name);
  input.value = '';
  renderSettSectors();
};

window.removeSettSector = function (idx) {
  tenantSectors.splice(idx, 1);
  renderSettSectors();
};

// Save dashboard location
// ─── Settings tabs ───
window.switchSettingsTab = function (tab) {
  document.querySelectorAll('.settings-tab-panel').forEach((p) => (p.style.display = 'none'));
  document.querySelectorAll('.settings-tab').forEach((b) => b.classList.remove('active'));
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.style.display = '';
  const btn = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
};

// Save store settings
window.saveStoreSettings = async function () {
  const name = document.getElementById('settStoreName').value.trim();
  const color = document.getElementById('settColorText').value.trim();
  if (!name) {
    toast('Nome da loja é obrigatório', 'error');
    return;
  }

  const isElite = tenant.plano === 'elite';
  const payload = {
    nome_loja: name,
    setores: tenantSectors
  };
  // Cor personalizada só para elite (também gateado server-side via resolve_tenant)
  if (isElite) payload.cor_primaria = color;

  const { error } = await sb.from('tenants').update(payload).eq('id', tenantId);

  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    return;
  }
  toast('Configurações salvas!', 'success');
  applyBranding({ ...tenant, nome_loja: name, cor_primaria: isElite ? color : tenant.cor_primaria });
};

// Política de captura de lead (F2-B) — salva na hora ao alternar o toggle.
window.saveLeadCapturePolicy = async function (enabled) {
  const toggle = document.getElementById('settLeadCapture');
  const { error } = await sb.from('tenants').update({ exige_captura_lead: !!enabled }).eq('id', tenantId);
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    if (toggle) toggle.checked = !enabled; // reverte o toggle
    return;
  }
  tenant.exige_captura_lead = !!enabled;
  toast(enabled ? 'Captura de lead ativada' : 'Captura de lead desativada', 'success');
};

// Links
function populateLinks() {
  const base = window.location.origin;
  const slug = tenant.slug;
  document.getElementById('linkTablet').textContent = `${base}/${slug}/tablet`;
  document.getElementById('linkDashboard').textContent = `${base}/${slug}/dashboard`;
  document.getElementById('linkLogin').textContent = `${base}/${slug}/login`;
}

window.copyText = function (id) {
  navigator.clipboard.writeText(document.getElementById(id).textContent).then(() => toast('Copiado!', 'success'));
};

// Billing Portal
window.openBillingPortal = async function () {
  const btn = document.getElementById('btnBillingPortal');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:11px"></i> Aguarde...';
  try {
    // BUG latente (pego pelo eslint na extração): _supabase global só existe nos
    // dashboards (dashboard-init.js) — aqui o clique dava ReferenceError. Usa o
    // client local + URL/key importados do config.
    const {
      data: { session }
    } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-billing-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY
      }
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast(data.error || 'Erro ao abrir portal de faturamento', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:11px"></i> Gerenciar';
    }
  } catch (_err) {
    toast('Erro ao conectar com o servidor', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:11px"></i> Gerenciar';
  }
};

// Plan
function populatePlan() {
  const plano = tenant.plano || 'starter';
  const badge = document.getElementById('planBadge');
  badge.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);
  badge.className = 'plan-badge ' + plano;
  const max = tenant.max_vendedores || 10;
  // Conta só ATIVOS — bate com o que o trigger de limite enforça no banco.
  const ativos = vendedores.filter((v) => v.ativo !== false).length;
  document.getElementById('planVendorCount').textContent = `${ativos} / ${max}`;
  // Gate: no limite, desabilita "Adicionar" e mostra CTA de upgrade.
  const atLimit = ativos >= max;
  const addBtn = document.getElementById('btnAddVendor');
  const hint = document.getElementById('vendorLimitHint');
  if (addBtn) {
    addBtn.disabled = atLimit;
    addBtn.style.opacity = atLimit ? '0.5' : '';
    addBtn.style.cursor = atLimit ? 'not-allowed' : '';
  }
  if (hint) hint.style.display = atLimit ? 'block' : 'none';
}

// Vendor list
function renderVendorList() {
  const list = document.getElementById('vendorMgmtList');
  if (vendedores.length === 0) {
    list.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">Nenhum vendedor cadastrado</p>';
    return;
  }
  const showAccess = isEliteTenant();
  list.innerHTML = vendedores
    .map((v) => {
      const id = escapeHtml(v.id);
      const nome = escapeHtml(v.nome || '—');
      const setor = escapeHtml(v.setor || '—');
      const apelido = v.apelido && v.apelido !== v.nome ? escapeHtml(v.apelido) : '';
      const initial = escapeHtml((v.nome || '?').trim().charAt(0).toUpperCase() || '?');
      const hasAccess = !!v.auth_user_id;
      const accessBadge = showAccess
        ? `<span class="vendor-access ${hasAccess ? 'on' : 'off'}" title="${hasAccess ? 'Tem login no app do vendedor' : 'Ainda sem login no app'}">
            <span class="dot"></span>${hasAccess ? 'App ativo' : 'Sem app'}
          </span>`
        : '';
      return `
    <div class="vendor-mgmt-row">
      <div class="vendor-avatar" aria-hidden="true">${initial}</div>
      <div class="vendor-main">
        <div class="vendor-name">${nome}</div>
        ${apelido ? `<div class="vendor-sub">${apelido}</div>` : ''}
      </div>
      <div class="vendor-meta">
        <span class="vendor-chip">${setor}</span>
        ${accessBadge}
        <div class="vendor-actions">
          <button onclick="openEditVendor('${id}')" title="Editar" aria-label="Editar ${nome}"><i class="fa-solid fa-pen"></i></button>
        </div>
      </div>
    </div>
  `;
    })
    .join('');
}

// ─── Vendor login section (plano Elite) ───
let _vmResetRequested = false;

function isEliteTenant() {
  return tenant && tenant.plano === 'elite';
}

function resetVendorLoginSection() {
  _vmResetRequested = false;
  const chk = document.getElementById('vmCreateLoginChk');
  if (chk) chk.checked = false;
  const email = document.getElementById('vmLoginEmail');
  if (email) email.value = '';
  const pass = document.getElementById('vmLoginPassword');
  if (pass) pass.value = '';
  const fields = document.getElementById('vmLoginFields');
  if (fields) fields.style.display = 'none';
  const resetWrap = document.getElementById('vmResetPassWrap');
  if (resetWrap) resetWrap.style.display = 'none';
  const resetInput = document.getElementById('vmResetPassInput');
  if (resetInput) resetInput.value = '';
}

function renderVendorLoginSection(vendor) {
  resetVendorLoginSection();
  const lock = document.getElementById('vmLoginLockCard');
  const createBlock = document.getElementById('vmLoginCreateBlock');
  const existingBlock = document.getElementById('vmLoginExistingBlock');

  if (!isEliteTenant()) {
    lock.style.display = '';
    createBlock.style.display = 'none';
    existingBlock.style.display = 'none';
    return;
  }

  lock.style.display = 'none';
  if (vendor && vendor.auth_user_id) {
    createBlock.style.display = 'none';
    existingBlock.style.display = '';
    const disp = document.getElementById('vmLoginEmailDisplay');
    disp.textContent = vendor._auth_email || '—';
  } else {
    existingBlock.style.display = 'none';
    createBlock.style.display = '';
  }
}

async function fetchVendorAuthEmail(vendorId) {
  try {
    const { data, error } = await sb.rpc('get_vendor_auth_email', { p_vendedor_id: vendorId });
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

// Toggle fields quando usuário marca "criar login"
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'vmCreateLoginChk') {
    const fields = document.getElementById('vmLoginFields');
    fields.style.display = e.target.checked ? 'grid' : 'none';
    if (e.target.checked) document.getElementById('vmLoginEmail').focus();
  }
});

// Botão "Resetar senha"
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('#vmResetPassBtn')) {
    const wrap = document.getElementById('vmResetPassWrap');
    const willOpen = wrap.style.display === 'none';
    wrap.style.display = willOpen ? 'grid' : 'none';
    _vmResetRequested = willOpen;
    if (willOpen) document.getElementById('vmResetPassInput').focus();
    else document.getElementById('vmResetPassInput').value = '';
  }
});

// Add vendor modal
window.openAddVendor = function () {
  // Pré-checagem de limite (o trigger no banco é a fronteira real; aqui é UX).
  const max = tenant.max_vendedores || 10;
  const ativos = vendedores.filter((v) => v.ativo !== false).length;
  if (ativos >= max) {
    toast(`Limite de ${max} vendedores do seu plano atingido. Faça upgrade pra liberar mais.`, 'warning');
    return;
  }
  document.getElementById('vendorModalTitle').textContent = 'Adicionar Vendedor';
  document.getElementById('vendorEditId').value = '';
  document.getElementById('vmName').value = '';
  document.getElementById('vmPhone').value = '';
  document.getElementById('vmPin').value = '';
  document.getElementById('vmPin').placeholder = '0000';
  populateSectorSelect('');
  renderVendorLoginSection(null);
  document.getElementById('vendorModal').classList.add('open');
  document.getElementById('vmName').focus();
};

window.openEditVendor = async function (id) {
  const v = vendedores.find((x) => x.id === id);
  if (!v) return;
  document.getElementById('vendorModalTitle').textContent = 'Editar Vendedor';
  document.getElementById('vendorEditId').value = id;
  document.getElementById('vmName').value = v.nome;
  document.getElementById('vmPhone').value = v.telefone || '';
  document.getElementById('vmPin').value = '';
  document.getElementById('vmPin').placeholder = 'Novo PIN';
  populateSectorSelect(v.setor);
  // Render enquanto busca email (show placeholder), depois atualiza
  renderVendorLoginSection(v);
  document.getElementById('vendorModal').classList.add('open');
  if (isEliteTenant() && v.auth_user_id) {
    const email = await fetchVendorAuthEmail(v.id);
    v._auth_email = email;
    const disp = document.getElementById('vmLoginEmailDisplay');
    if (disp) disp.textContent = email || '—';
  }
};

window.closeVendorModal = function () {
  document.getElementById('vendorModal').classList.remove('open');
};

// ─── Enviar acesso do vendedor por WhatsApp ───
const VENDOR_APP_URL = 'https://listaveztexas.vercel.app/vendor.html';

function normalizePhoneBR(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.startsWith('55') && d.length >= 12) return d; // já internacional
  if (d.length === 10 || d.length === 11) return '55' + d; // DDD + número BR
  return d; // fallback: usa como veio
}

function buildVendorWelcomeMsg({ nome, loja, email, senha, slug, pin }) {
  const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
  const link = slug ? `${VENDOR_APP_URL}?loja=${encodeURIComponent(slug)}` : VENDOR_APP_URL;
  const linhas = [
    `Oi ${primeiro}! 👋`,
    ``,
    `Seu acesso ao app *minhavez Vendedor*${loja ? ' da ' + loja : ''} está pronto. 🎉`,
    ``,
    `📲 *Como instalar no celular:*`,
    `1) Abra este link no navegador (Chrome no Android / Safari no iPhone):`,
    link,
    `2) Toque no menu do navegador (⋮ no Android, ⬆️ no iPhone)`,
    `3) Escolha *"Adicionar à tela inicial"*`,
    `4) Abra o app *minhavez Vendedor* pela tela inicial`,
    ``
  ];
  if (pin) {
    linhas.push(
      `🔑 *Pra entrar é só o seu PIN:*`,
      `PIN: ${pin}`,
      ``,
      `Se preferir, dá pra entrar com email e senha:`,
      `E-mail: ${email}`,
      `Senha: ${senha}`
    );
  } else {
    linhas.push(`🔑 *Seu login:*`, `E-mail: ${email}`, `Senha: ${senha}`);
  }
  linhas.push(``, `🔔 Ao entrar, ative as notificações pra avisar quando for a sua vez.`);
  return linhas.join('\n');
}

let _shareData = null;
function openVendorShareModal(data) {
  _shareData = data;
  document.getElementById('vmShareMsg').value = buildVendorWelcomeMsg(data);
  const phone = normalizePhoneBR(data.telefone);
  document.getElementById('vmSharePhoneHint').textContent = phone
    ? `Vai abrir a conversa com ${data.telefone}.`
    : 'Sem telefone cadastrado — o WhatsApp abre pra você escolher o contato (a mensagem já vai pronta).';
  document.getElementById('vendorShareModal').classList.add('open');
}
window.closeShareModal = function () {
  document.getElementById('vendorShareModal').classList.remove('open');
  _shareData = null;
};
window.copyShareMsg = function () {
  navigator.clipboard
    .writeText(document.getElementById('vmShareMsg').value)
    .then(() => toast('Mensagem copiada!', 'success'))
    .catch(() => toast('Erro ao copiar', 'error'));
};
document.getElementById('vmShareWaBtn')?.addEventListener('click', () => {
  const msg = document.getElementById('vmShareMsg').value;
  const phone = _shareData ? normalizePhoneBR(_shareData.telefone) : '';
  const url = (phone ? `https://wa.me/${phone}` : 'https://wa.me/') + `?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
});
document.getElementById('vendorShareModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) window.closeShareModal();
});

function populateSectorSelect(selected) {
  document.getElementById('vmSector').innerHTML = tenantSectors
    .map((s) => {
      const setor = escapeHtml(s);
      return `<option value="${setor}" ${s === selected ? 'selected' : ''}>${setor}</option>`;
    })
    .join('');
}

window.saveVendor = async function () {
  const id = document.getElementById('vendorEditId').value;
  const nome = document.getElementById('vmName').value.trim();
  const setor = document.getElementById('vmSector').value;
  const telefone = document.getElementById('vmPhone').value.trim();
  const pin = document.getElementById('vmPin').value.trim();

  if (!nome) {
    toast('Nome é obrigatório', 'error');
    return;
  }
  if (pin && pin.length !== 4) {
    toast('PIN deve ter 4 dígitos', 'error');
    return;
  }

  // Dados de login (plano Elite)
  const elite = isEliteTenant();
  const createLoginChecked = elite && document.getElementById('vmCreateLoginChk')?.checked;
  const loginEmail = document.getElementById('vmLoginEmail')?.value.trim();
  const loginPass = document.getElementById('vmLoginPassword')?.value;
  const resetPass = _vmResetRequested ? document.getElementById('vmResetPassInput')?.value : '';

  if (createLoginChecked) {
    if (!loginEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      toast('Informe um email válido para o login', 'error');
      return;
    }
    if (!loginPass || loginPass.length < 8) {
      toast('Senha precisa ter ao menos 8 caracteres', 'error');
      return;
    }
  }
  if (_vmResetRequested && (!resetPass || resetPass.length < 8)) {
    toast('Nova senha precisa ter ao menos 8 caracteres', 'error');
    return;
  }

  const btn = document.getElementById('vmSave');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    let vendedorId = id;
    if (id) {
      // Update
      const update = { nome, setor, telefone: telefone || null };
      if (pin) update.pin = pin;
      const { error } = await sb.from('vendedores').update(update).eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
    } else {
      // Insert
      const maxPos = vendedores.length > 0 ? Math.max(...vendedores.map((v) => v.posicao_fila || 0)) + 1 : 1;
      const insert = {
        nome,
        setor,
        telefone: telefone || null,
        tenant_id: tenantId,
        status: 'fora',
        posicao_fila: maxPos
      };
      if (pin) insert.pin = pin;
      const { data: inserted, error } = await sb.from('vendedores').insert(insert).select('id').single();
      if (error) throw error;
      vendedorId = inserted.id;
    }

    // Criar login (Elite + checkbox marcado)
    if (createLoginChecked) {
      const { data: resp, error: fnErr } = await sb.functions.invoke('create-vendor-auth', {
        body: {
          tenant_id: tenantId,
          vendedor_id: vendedorId,
          email: loginEmail,
          password: loginPass,
          mode: 'create'
        }
      });
      if (fnErr) throw new Error(fnErr.message || 'Falha ao criar login');
      if (resp && resp.error) throw new Error(resp.error);
    }

    // Resetar senha (Elite + botão resetar aberto + nova senha preenchida)
    if (_vmResetRequested && resetPass) {
      const { data: resp, error: fnErr } = await sb.functions.invoke('create-vendor-auth', {
        body: {
          tenant_id: tenantId,
          vendedor_id: vendedorId,
          password: resetPass,
          mode: 'reset'
        }
      });
      if (fnErr) throw new Error(fnErr.message || 'Falha ao resetar senha');
      if (resp && resp.error) throw new Error(resp.error);
    }

    if (id) toast('Vendedor atualizado!', 'success');
    else toast('Vendedor adicionado!', 'success');
    if (createLoginChecked) toast('Login criado com sucesso', 'success');
    if (_vmResetRequested && resetPass) toast('Senha atualizada', 'success');

    // Monta o compartilhamento de credenciais ANTES do reload (no reset de
    // senha precisamos do email atual, que vive no array antes de recarregar).
    let _share = null;
    const _slug = tenant?.slug || '';
    if (createLoginChecked) {
      _share = {
        nome,
        loja: tenant?.nome_loja || '',
        email: loginEmail,
        senha: loginPass,
        telefone,
        slug: _slug,
        pin
      };
    } else if (_vmResetRequested && resetPass) {
      const existing = vendedores.find((x) => x.id === vendedorId);
      _share = {
        nome,
        loja: tenant?.nome_loja || '',
        email: existing?._auth_email || '',
        senha: resetPass,
        telefone,
        slug: _slug,
        pin
      };
    }

    // Reload
    const { data } = await sb
      .from('vendedores')
      .select(VENDOR_SETTINGS_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('posicao_fila');
    vendedores = data || [];
    renderVendorList();
    populatePlan();
    window.closeVendorModal();
    if (_share) openVendorShareModal(_share);
  } catch (e) {
    const isLimit = /LIMITE_PLANO/.test(e.message || '');
    toast(
      isLimit ? 'Limite de vendedores do seu plano atingido. Faça upgrade pra liberar mais.' : 'Erro: ' + e.message,
      isLimit ? 'warning' : 'error'
    );
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar';
};

// Nav
window.goBack = function () {
  window.location.href = tenantPath('/dashboard');
};

window.handleLogout = async function () {
  await logout();
};

// Close modal on overlay click
document.getElementById('vendorModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) window.closeVendorModal();
});

// Close canal modal on overlay click
document.getElementById('canalModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) window.closeCanalModal();
});

// ─── Canais de Origem ───
let _canais = [];
let _editingCanalId = null;
let _editingCanalTipo = 'fixo'; // 'fixo' or 'evento'

const _canalIcOpts = [
  'fa-brands fa-meta',
  'fa-brands fa-tiktok',
  'fa-brands fa-instagram',
  'fa-brands fa-google',
  'fa-brands fa-whatsapp',
  'fa-brands fa-youtube',
  'fa-envelope',
  'fa-comment-sms',
  'fa-handshake',
  'fa-user-check',
  'fa-globe',
  'fa-bullhorn',
  'fa-tv',
  'fa-newspaper',
  'fa-radio',
  'fa-store',
  'fa-person-walking',
  'fa-map-pin'
];
const _eventoIcOpts = [
  'fa-calendar-star',
  'fa-champagne-glasses',
  'fa-gift',
  'fa-tags',
  'fa-fire',
  'fa-bolt',
  'fa-star',
  'fa-heart',
  'fa-music',
  'fa-car',
  'fa-trophy',
  'fa-percent'
];
let _selectedIcone = 'fa-brands fa-meta';

async function loadCanais() {
  const { data } = await sb.from('canais_origem').select('*').eq('tenant_id', tenantId).order('tipo').order('ordem');
  _canais = data || [];
  renderCanais();
}

function iconClass(ic) {
  if (!ic) return 'fa-solid fa-circle-question';
  return ic.startsWith('fa-brands') || ic.startsWith('fa-solid') || ic.startsWith('fa-regular') ? ic : 'fa-solid ' + ic;
}

function renderCanalRow(c, showActions) {
  const id = escapeHtml(c.id);
  const nome = escapeHtml(c.nome);
  const tipo = escapeHtml(c.tipo);
  const icon = escapeHtml(iconClass(c.icone));
  return `<div class="canal-row">
    <div class="canal-icon"><i class="${icon}"></i></div>
    <div class="canal-info">
      <div class="canal-name">${nome}</div>
      ${!c.ativo ? '<div class="canal-type">Inativo</div>' : ''}
    </div>
    <button class="canal-toggle ${c.ativo ? 'active' : ''}" onclick="toggleCanal('${id}', ${!c.ativo})" title="${c.ativo ? 'Desativar' : 'Ativar'}"></button>
    ${
      showActions
        ? `<div class="canal-actions">
      <button onclick="editCanal('${id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
      <button class="danger" onclick="deleteCanal('${id}', '${tipo}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
    </div>`
        : ''
    }
  </div>`;
}

function renderCanais() {
  const fixos = _canais.filter((c) => c.tipo === 'fixo');
  const eventos = _canais.filter((c) => c.tipo === 'evento');

  // Canais
  const fixosList = document.getElementById('canaisFixosList');
  const fixosEmpty = document.getElementById('canaisFixosEmpty');
  if (fixosList) {
    if (fixos.length === 0) {
      fixosList.innerHTML = '';
      if (fixosEmpty) fixosEmpty.style.display = 'block';
    } else {
      if (fixosEmpty) fixosEmpty.style.display = 'none';
      fixosList.innerHTML = fixos.map((c) => renderCanalRow(c, true)).join('');
    }
  }

  // Eventos
  const eventosList = document.getElementById('canaisEventosList');
  const eventosEmpty = document.getElementById('canaisEventosEmpty');
  if (eventosList) {
    if (eventos.length === 0) {
      eventosList.innerHTML = '';
      if (eventosEmpty) eventosEmpty.style.display = 'block';
    } else {
      if (eventosEmpty) eventosEmpty.style.display = 'none';
      eventosList.innerHTML = eventos.map((c) => renderCanalRow(c, true)).join('');
    }
  }
}

window.toggleCanal = async function (id, newState) {
  const { error } = await sb.from('canais_origem').update({ ativo: newState }).eq('id', id);
  if (error) {
    toast('Erro ao atualizar', 'error');
    return;
  }
  const c = _canais.find((x) => x.id === id);
  if (c) c.ativo = newState;
  renderCanais();
  toast(newState ? 'Ativado' : 'Desativado', 'success');
};

// ─── Modal unificado (Canal / Evento) ───
function openCanalModal(tipo, id) {
  _editingCanalTipo = tipo;
  _editingCanalId = id || null;
  const isCanal = tipo === 'fixo';
  const icons = isCanal ? _canalIcOpts : _eventoIcOpts;

  const modal = document.getElementById('canalModal');
  const title = document.getElementById('canalModalTitle');
  const label = document.getElementById('canalModalLabel');
  const input = document.getElementById('canalModalNome');

  if (id) {
    const c = _canais.find((x) => x.id === id);
    if (!c) return;
    title.textContent = isCanal ? 'Editar Canal' : 'Editar Evento';
    input.value = c.nome;
    _selectedIcone = c.icone;
  } else {
    title.textContent = isCanal ? 'Novo Canal' : 'Novo Evento';
    input.value = '';
    _selectedIcone = icons[0];
  }

  label.textContent = isCanal ? 'Nome do canal' : 'Nome do evento';
  input.placeholder = isCanal ? 'Ex: Google Ads' : 'Ex: Feirão de Março';

  renderIconePicker(icons);
  modal.style.display = 'flex';
  input.focus();
}

window.showAddCanal = function () {
  openCanalModal('fixo', null);
};
window.showAddEvento = function () {
  openCanalModal('evento', null);
};
window.editCanal = function (id) {
  const c = _canais.find((x) => x.id === id);
  if (c) openCanalModal(c.tipo, id);
};

window.closeCanalModal = function () {
  document.getElementById('canalModal').style.display = 'none';
  _editingCanalId = null;
};

function renderIconePicker(icons) {
  const picker = document.getElementById('canalModalIconePicker');
  if (!picker) return;
  const list = icons || (_editingCanalTipo === 'fixo' ? _canalIcOpts : _eventoIcOpts);
  picker.innerHTML = list
    .map(
      (ic) =>
        `<button type="button" class="icone-option ${ic === _selectedIcone ? 'selected' : ''}" onclick="pickIcone('${ic}')">
       <i class="${iconClass(ic)}"></i>
     </button>`
    )
    .join('');
}

window.pickIcone = function (ic) {
  _selectedIcone = ic;
  renderIconePicker();
};

window.saveCanalModal = async function () {
  const nome = document.getElementById('canalModalNome').value.trim();
  const isCanal = _editingCanalTipo === 'fixo';
  if (!nome) {
    toast('Digite o nome', 'warning');
    return;
  }

  if (_editingCanalId) {
    const { error } = await sb.from('canais_origem').update({ nome, icone: _selectedIcone }).eq('id', _editingCanalId);
    if (error) {
      toast('Erro ao atualizar: ' + error.message, 'error');
      return;
    }
    toast((isCanal ? 'Canal' : 'Evento') + ' atualizado', 'success');
  } else {
    const maxOrdem = _canais
      .filter((c) => c.tipo === _editingCanalTipo)
      .reduce((max, c) => Math.max(max, c.ordem || 0), 0);
    const { error } = await sb.from('canais_origem').insert({
      tenant_id: tenantId,
      nome,
      icone: _selectedIcone,
      tipo: _editingCanalTipo,
      ativo: true,
      ordem: maxOrdem + 1
    });
    if (error) {
      toast('Erro ao criar: ' + error.message, 'error');
      return;
    }
    toast((isCanal ? 'Canal' : 'Evento') + ' criado', 'success');
  }

  window.closeCanalModal();
  await loadCanais();
};

window.deleteCanal = async function (id, tipo) {
  const canal = _canais.find((c) => c.id === id);
  const nome = canal?.nome || '';
  const label = tipo === 'fixo' ? 'canal' : 'evento';
  if (!confirm('Excluir o ' + label + ' "' + nome + '"?\nOs dados históricos serão mantidos.')) return;
  const { error } = await sb.from('canais_origem').delete().eq('id', id);
  if (error) {
    toast('Erro ao excluir: ' + error.message, 'error');
    return;
  }
  toast(tipo === 'fixo' ? 'Canal excluído' : 'Evento excluído', 'success');
  await loadCanais();
};

// ─── Change Password ───
window.changePassword = async function () {
  const pass = document.getElementById('newPass').value;
  const confirm = document.getElementById('newPassConfirm').value;
  const btn = document.getElementById('btnChangePass');
  if (!pass || pass.length < 6) {
    toast('Senha precisa ter no mínimo 6 caracteres', 'warning');
    return;
  }
  if (pass !== confirm) {
    toast('As senhas não conferem', 'warning');
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
  try {
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) throw error;
    toast('Senha alterada com sucesso!', 'success');
    document.getElementById('newPass').value = '';
    document.getElementById('newPassConfirm').value = '';
  } catch (e) {
    toast('Erro ao alterar senha: ' + (e.message || 'tente novamente'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-key" style="font-size:11px"></i> Alterar senha';
  }
};

// ─── LGPD: Export Data ───
window.exportMyData = async function () {
  const btn = document.getElementById('btnExportData');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
  try {
    const tid = window._tenantId;
    if (!tid) throw new Error('Tenant não encontrado');
    // Coleta dados de todas as tabelas relevantes
    const [vendedores, atendimentos, turnos, pausas, configuracoes] = await Promise.all([
      sb.from('vendedores').select(VENDOR_SETTINGS_COLUMNS).eq('tenant_id', tid),
      sb.from('atendimentos').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(5000),
      sb.from('turnos').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(500),
      sb.from('pausas').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(2000),
      sb.from('configuracoes').select('*').eq('tenant_id', tid)
    ]);
    const exported = {
      exported_at: new Date().toISOString(),
      tenant_id: tid,
      vendedores: vendedores.data || [],
      atendimentos: atendimentos.data || [],
      turnos: turnos.data || [],
      pausas: pausas.data || [],
      configuracoes: configuracoes.data || []
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minhavez-export-${tid}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Dados exportados com sucesso!', 'success');
  } catch (e) {
    toast('Erro ao exportar: ' + (e.message || 'tente novamente'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-download" style="font-size:11px"></i> Exportar';
  }
};

// ─── LGPD: Request Account Deletion ───
window.requestAccountDeletion = async function () {
  const confirmed = confirm(
    'ATENÇÃO: Isso é irreversível!\n\n' +
      'Ao confirmar, sua conta e todos os dados da loja serão marcados para exclusão.\n' +
      'A exclusão será processada em até 30 dias úteis conforme LGPD.\n' +
      'Você será deslogado imediatamente.\n\n' +
      'Deseja continuar?'
  );
  if (!confirmed) return;
  // Segundo confirm pra segurança
  const doubleConfirm = prompt('Digite "EXCLUIR" para confirmar a exclusão definitiva:');
  if (doubleConfirm !== 'EXCLUIR') {
    toast('Exclusão cancelada', 'info');
    return;
  }
  const btn = document.getElementById('btnDeleteAccount');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
  try {
    const {
      data: { session }
    } = await sb.auth.getSession();
    const tid = window._tenantId;
    // Marca tenant como pending_deletion (admin processa depois)
    await sb
      .from('tenants')
      .update({
        status: 'pending_deletion',
        deletion_requested_at: new Date().toISOString(),
        deletion_requested_by: session?.user?.id || 'unknown'
      })
      .eq('id', tid);
    toast('Solicitação de exclusão registrada. Você será deslogado agora.', 'warning');
    setTimeout(async () => {
      await sb.auth.signOut();
      window.location.href = '/';
    }, 2500);
  } catch (e) {
    toast('Erro ao solicitar exclusão: ' + (e.message || 'entre em contato com suporte'), 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash" style="font-size:11px"></i> Excluir';
  }
};

// ─── Theme selector ───
(function () {
  const selector = document.getElementById('themeSelector');
  if (!selector) return;
  const opts = selector.querySelectorAll('.theme-opt');

  function applyTheme(mode) {
    const effective =
      mode === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : mode;
    document.documentElement.setAttribute('data-theme', effective);
    localStorage.setItem('lv-theme', mode);
    opts.forEach((o) => {
      const active = o.dataset.themeOpt === mode;
      o.style.background = active ? 'var(--accent)' : 'transparent';
      o.style.color = active ? 'var(--accent-ink)' : 'var(--text-secondary)';
    });
  }

  const current = localStorage.getItem('lv-theme') || 'auto';
  applyTheme(current);

  opts.forEach((o) => {
    o.addEventListener('click', () => applyTheme(o.dataset.themeOpt));
  });

  // Reage a mudança de OS quando em modo 'auto'
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if ((localStorage.getItem('lv-theme') || 'auto') === 'auto') applyTheme('auto');
  });
})();

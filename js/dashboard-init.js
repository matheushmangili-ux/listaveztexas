// ============================================
// MinhaVez — Dashboard Init
// Bootstrap + event handlers + realtime wiring for dashboard.html
// ============================================

import { getSupabase } from '/js/supabase-config.js';
import { requireRole, logout, getTenantId } from '/js/auth.js';
import {
  todayRange,
  yesterdayRange,
  weekRange,
  monthRange,
  initials,
  toast,
  initTheme,
  toggleTheme,
  escapeHtml,
  setoresMatch
} from '/js/utils.js';
import { loadTenant, applyBranding, tenantPath, getSlug } from '/js/tenant.js';
import { METAS_KEY, DEFAULT_METAS, PERIODS } from '/js/dashboard-config.js';
const setorLabel = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
import { showChangelog } from '/js/changelog.js';
import { fetchVendedores, fetchTodosVendedores, fetchDrillMotivo } from '/js/dashboard-api.js';
import {
  initDashboardCharts,
  loadAll,
  loadKPIs,
  loadMotivos,
  loadHourly,
  loadRanking,
  loadFloor,
  loadScatter,
  loadTempoMeta,
  loadOrigem,
  setFirstLoadDone,
  formatTempo
} from '/js/dashboard-charts.js';
import {
  SESSION_TIMEOUT_DASHBOARD,
  SESSION_CHECK_INTERVAL,
  RT_DASHBOARD_DEBOUNCE,
  TOAST_SHORT
} from '/js/constants.js';
initTheme();

// ─── Logout (defined early so the button works even while page is still loading) ───
window.handleLogout = async function () {
  try {
    await logout();
  } catch (e) {
    console.error('[handleLogout]', e);
    window.location.replace('/landing.html');
  }
};

// Load tenant context
const tenant = await loadTenant();
if (tenant) {
  applyBranding(tenant);
  // Update nav links with tenant slug
  const tabletLink = document.getElementById('linkTablet');
  const settingsLink = document.getElementById('linkSettings');
  if (tabletLink) tabletLink.href = tenantPath('/tablet');
  if (settingsLink) settingsLink.href = tenantPath('/settings');
  // Populate header brand
  const headerTitle = document.getElementById('headerTitle');
  const headerLogo = document.getElementById('headerLogo');
  if (headerTitle && tenant.nome_loja) headerTitle.textContent = tenant.nome_loja;
  if (headerLogo && tenant.logo_url) {
    headerLogo.innerHTML = `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.nome_loja || '')}">`;
  }
  // Show tenant slug in footer for support
  const slugEl = document.getElementById('tenantSlugFooter');
  const slugVal = document.getElementById('tenantSlugValue');
  const slug = getSlug();
  if (slugEl && slugVal && slug) {
    slugVal.textContent = slug;
    slugEl.style.display = '';
    slugEl.addEventListener('click', () => {
      navigator.clipboard
        .writeText(slug)
        .then(() => toast('ID copiado!', 'success'))
        .catch(() => toast('Erro ao copiar ID', 'error'));
    });
  }
}

const sb = getSupabase();
window._supabase = sb; // expose for dashboard-vm, dashboard-ai modules
let user;
try {
  user = await requireRole(['gerente', 'admin', 'owner']);
} catch (e) {
  console.warn('[requireRole]', e?.message || e);
}
if (!user) {
  const loginTarget = tenantPath('/login');
  window.handleLogout = () => {
    window.location.href = loginTarget;
  };
  window.location.replace(loginTarget);
  await new Promise(() => {});
}
const tenantId = tenant?.id || (user ? getTenantId(user) : null);

// Guard: if JWT tenant_id doesn't match URL tenant, force re-login
const jwtTenantId = user ? getTenantId(user) : null;
if (tenant && jwtTenantId && jwtTenantId !== tenant.id) {
  await sb.auth.signOut();
  window.location.href = tenantPath('/login');
}

let currentPeriod = PERIODS.HOJE;
let filterSetor = '';
let filterVendedor = '';

// Metas configuráveis (salvas no localStorage, editáveis via settings)
function getMetas() {
  try {
    return { ...DEFAULT_METAS, ...JSON.parse(localStorage.getItem(METAS_KEY) || '{}') };
  } catch {
    return DEFAULT_METAS;
  }
}
const metas = getMetas();

// ─── Period tabs ───
let customRangeStart = null;
let customRangeEnd = null;

function getRange() {
  if (currentPeriod === PERIODS.CUSTOM && customRangeStart && customRangeEnd) {
    const start = new Date(customRangeStart + 'T00:00:00');
    const end = new Date(customRangeEnd + 'T23:59:59');
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (currentPeriod === PERIODS.ONTEM) return yesterdayRange();
  if (currentPeriod === PERIODS.SEMANA) return weekRange();
  if (currentPeriod === PERIODS.MES) return monthRange();
  return todayRange();
}

function getPrevRange() {
  const r = getRange();
  const start = new Date(r.start);
  const end = new Date(r.end);
  const duration = end - start;
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - duration);
  return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
}

// Cache de dados para filtros e exports (evita refetch)
let _cachedRanking = [];
let _cachedStats = {};
let _cachedMotivos = [];
let _cachedVendedores = [];

// Cache KPI DOM refs (avoid repeated getElementById on realtime updates)
const _kpi = {
  total: document.getElementById('kpiTotal'),
  vendas: document.getElementById('kpiVendas'),
  conv: document.getElementById('kpiConv'),
  loss: document.getElementById('kpiLoss'),
  time: document.getElementById('kpiTime'),
  pref: document.getElementById('kpiPref')
};

// ─── Dashboard Charts module init ───
initDashboardCharts({
  sb,
  get tenantId() {
    return tenantId;
  },
  get currentPeriod() {
    return currentPeriod;
  },
  get filterSetor() {
    return filterSetor;
  },
  get filterVendedor() {
    return filterVendedor;
  },
  get metas() {
    return metas;
  },
  get cachedVendedores() {
    return _cachedVendedores;
  },
  get cachedRanking() {
    return _cachedRanking;
  },
  set cachedRanking(v) {
    _cachedRanking = v;
  },
  get _cachedStats() {
    return _cachedStats;
  },
  set _cachedStats(v) {
    _cachedStats = v;
  },
  get _cachedMotivos() {
    return _cachedMotivos;
  },
  set _cachedMotivos(v) {
    _cachedMotivos = v;
  },
  kpi: _kpi,
  getRange,
  getPrevRange,
  updateTimestamp
});

// ─── Filters ───
async function populateFilters() {
  const { data } = await fetchVendedores(sb, tenantId);
  _cachedVendedores = data || [];

  const setores = [...new Set(_cachedVendedores.map((v) => v.setor || 'loja'))];
  const selSetor = document.getElementById('filterSetor');
  selSetor.innerHTML =
    '<option value="">Todos os setores</option>' +
    setores.map((s) => `<option value="${s}">${setorLabel(s)}</option>`).join('');
  updateVendedorFilter();
}

function updateVendedorFilter() {
  const selVend = document.getElementById('filterVendedor');
  const filtered = filterSetor
    ? _cachedVendedores.filter((v) => setoresMatch(v.setor, filterSetor))
    : _cachedVendedores;
  selVend.innerHTML =
    '<option value="">Todos os vendedores</option>' +
    filtered.map((v) => `<option value="${v.id}">${v.apelido || v.nome}</option>`).join('');
}

window.onSetorChange = function () {
  filterSetor = document.getElementById('filterSetor').value;
  updateVendedorFilter();
  if (filterVendedor && !document.querySelector(`#filterVendedor option[value="${filterVendedor}"]`)) {
    filterVendedor = '';
    document.getElementById('filterVendedor').value = '';
  }
};

window.applyFilters = function () {
  filterSetor = document.getElementById('filterSetor').value;
  filterVendedor = document.getElementById('filterVendedor').value;
  const clearBtn = document.getElementById('filterClearBtn');
  if (clearBtn) clearBtn.style.display = filterSetor || filterVendedor ? '' : 'none';
  loadAll();
};

window.clearFilters = function () {
  filterSetor = '';
  filterVendedor = '';
  document.getElementById('filterSetor').value = '';
  document.getElementById('filterVendedor').value = '';
  updateVendedorFilter();
  const clearBtn = document.getElementById('filterClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  loadAll();
};

window.setPeriod = function (p) {
  closeCalendar();
  customRangeStart = null;
  customRangeEnd = null;
  document.getElementById('customRangeLabel').style.display = 'none';
  currentPeriod = p;
  document.querySelectorAll('#periodTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.period === p);
  });
  loadAll();
};

/* ─── Calendar Popover Logic ─── */
let _calViewYear, _calViewMonth;
let _calPickStart = null,
  _calPickEnd = null;
let _calStep = 0;

function _fmt2(n) {
  return n < 10 ? '0' + n : '' + n;
}
function _dateStr(y, m, d) {
  return y + '-' + _fmt2(m + 1) + '-' + _fmt2(d);
}

const _monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  const hint = document.getElementById('calSelectionHint');
  label.textContent = _monthNames[_calViewMonth] + ' ' + _calViewYear;

  const firstDay = new Date(_calViewYear, _calViewMonth, 1).getDay();
  const daysInMonth = new Date(_calViewYear, _calViewMonth + 1, 0).getDate();
  const daysInPrev = new Date(_calViewYear, _calViewMonth, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  let html = '';
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = _calViewMonth === 0 ? 11 : _calViewMonth - 1;
    const y = _calViewMonth === 0 ? _calViewYear - 1 : _calViewYear;
    const ds = _dateStr(y, m, d);
    html +=
      '<button class="cal-day other-month" data-date="' + ds + '" onclick="calPick(\'' + ds + '\')">' + d + '</button>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = _dateStr(_calViewYear, _calViewMonth, d);
    let cls = 'cal-day';
    if (ds === todayStr) cls += ' today';
    if (_calPickStart && _calPickEnd) {
      if (ds === _calPickStart && ds === _calPickEnd) cls += ' range-start range-end';
      else if (ds === _calPickStart) cls += ' range-start';
      else if (ds === _calPickEnd) cls += ' range-end';
      else if (ds > _calPickStart && ds < _calPickEnd) cls += ' in-range';
    } else if (_calPickStart && ds === _calPickStart) {
      cls += ' range-start range-end';
    }
    html += '<button class="' + cls + '" data-date="' + ds + '" onclick="calPick(\'' + ds + '\')">' + d + '</button>';
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    const m = _calViewMonth === 11 ? 0 : _calViewMonth + 1;
    const y = _calViewMonth === 11 ? _calViewYear + 1 : _calViewYear;
    const ds = _dateStr(y, m, d);
    html +=
      '<button class="cal-day other-month" data-date="' + ds + '" onclick="calPick(\'' + ds + '\')">' + d + '</button>';
  }
  grid.innerHTML = html;

  if (_calStep === 0) hint.textContent = 'Clique no dia inicial';
  else hint.textContent = 'Clique no dia final';
}

window.calPick = function (dateStr) {
  _calJustClicked = true;
  if (_calStep === 0) {
    _calPickStart = dateStr;
    _calPickEnd = null;
    _calStep = 1;
    renderCalendar();
  } else {
    if (dateStr < _calPickStart) {
      _calPickEnd = _calPickStart;
      _calPickStart = dateStr;
    } else {
      _calPickEnd = dateStr;
    }
    _calStep = 0;
    renderCalendar();
    setTimeout(function () {
      applyCalendarRange();
    }, 200);
  }
};

function applyCalendarRange() {
  customRangeStart = _calPickStart;
  customRangeEnd = _calPickEnd;
  currentPeriod = PERIODS.CUSTOM;
  document.querySelectorAll('#periodTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.period === 'custom');
  });
  const lbl = document.getElementById('customRangeLabel');
  const s = _calPickStart.split('-'),
    e = _calPickEnd.split('-');
  if (_calPickStart === _calPickEnd) {
    lbl.textContent = s[2] + '/' + s[1] + '/' + s[0];
  } else {
    lbl.textContent = s[2] + '/' + s[1] + ' — ' + e[2] + '/' + e[1] + '/' + e[0];
  }
  lbl.style.display = 'inline';
  closeCalendar();
  loadAll();
}

window.toggleCalendar = function (e) {
  e && e.stopPropagation();
  const pop = document.getElementById('calendarPopover');
  if (pop.style.display === 'block') {
    closeCalendar();
    return;
  }
  const now = new Date();
  _calViewYear = now.getFullYear();
  _calViewMonth = now.getMonth();
  _calStep = 0;
  _calPickStart = customRangeStart;
  _calPickEnd = customRangeEnd;
  if (_calPickStart && _calPickEnd) _calStep = 0;
  pop.style.display = 'block';
  renderCalendar();
  document.querySelectorAll('#periodTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.period === 'custom');
  });
};

function closeCalendar() {
  document.getElementById('calendarPopover').style.display = 'none';
}

window.calNav = function (dir) {
  _calJustClicked = true;
  _calViewMonth += dir;
  if (_calViewMonth < 0) {
    _calViewMonth = 11;
    _calViewYear--;
  }
  if (_calViewMonth > 11) {
    _calViewMonth = 0;
    _calViewYear++;
  }
  renderCalendar();
};

window.calClear = function () {
  _calJustClicked = true;
  _calPickStart = null;
  _calPickEnd = null;
  _calStep = 0;
  customRangeStart = null;
  customRangeEnd = null;
  document.getElementById('customRangeLabel').style.display = 'none';
  renderCalendar();
};

let _calJustClicked = false;
document.addEventListener('click', function (e) {
  const pop = document.getElementById('calendarPopover');
  if (!pop || pop.style.display !== 'block') return;
  if (_calJustClicked) {
    _calJustClicked = false;
    return;
  }
  if (!pop.contains(e.target) && !e.target.closest('[data-period="custom"]')) {
    closeCalendar();
  }
});

// ─── Gestão de Vendedores ───
async function loadVendedores() {
  const el = document.getElementById('vendedorList');
  if (!el) return;
  const { data, error } = await fetchTodosVendedores(sb, tenantId);
  if (error || !data || data.length === 0) {
    el.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Nenhum vendedor cadastrado</div>';
    return;
  }
  el.innerHTML = data
    .map((v) => {
      const avatarContent = v.foto_url
        ? `<img src="${escapeHtml(v.foto_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
        : initials(v.nome);
      return `<div class="vendedor-row">
      <div class="vendedor-avatar" style="overflow:hidden">${avatarContent}</div>
      <div class="vendedor-info">
        <div class="vendedor-name">${v.nome}</div>
        ${v.apelido ? '<div class="vendedor-nick">' + v.apelido + '</div>' : ''}
        <div style="font-size:9px;color:var(--text-muted);font-weight:600;margin-top:1px">${setorLabel(v.setor || 'loja')}</div>
      </div>
      <span class="badge-ativo ${v.ativo ? 'on' : 'off'}">${v.ativo ? 'Ativo' : 'Inativo'}</span>
      <div class="vendedor-actions">
        <button title="Editar" data-action="edit" data-id="${v.id}" data-nome="${(v.nome || '').replace(/"/g, '&quot;')}" data-apelido="${(v.apelido || '').replace(/"/g, '&quot;')}" data-setor="${v.setor || 'loja'}"><i class="fa-solid fa-pen"></i></button>
        <button title="${v.ativo ? 'Desativar' : 'Ativar'}" data-action="toggle" data-id="${v.id}" data-ativo="${v.ativo}"><i class="fa-solid fa-${v.ativo ? 'toggle-on' : 'toggle-off'}"></i></button>
        <button title="Desativar" class="btn-danger" data-action="delete" data-id="${v.id}" data-nome="${(v.nome || '').replace(/"/g, '&quot;')}"><i class="fa-solid fa-user-slash"></i></button>
      </div>
    </div>`;
    })
    .join('');
}

// Event delegation for vendedor action buttons (prevents XSS from inline onclick)
document.getElementById('vendedorList')?.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'edit') {
    window.editVendedor(btn.dataset.id, btn.dataset.nome, btn.dataset.apelido, btn.dataset.setor);
  } else if (action === 'toggle') {
    window.toggleVendedor(btn.dataset.id, btn.dataset.ativo === 'true');
  } else if (action === 'delete') {
    window.deleteVendedor(btn.dataset.id, btn.dataset.nome);
  }
});

// Photo preview
window.previewFoto = function (input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('vendedorFotoPreview').innerHTML =
      `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
};

async function uploadFoto(vendedorId, file) {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const path = `vendedores/${vendedorId}.${ext}`;
  const { error } = await sb.storage.from('Sellers').upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = sb.storage.from('Sellers').getPublicUrl(path);
  return data?.publicUrl || null;
}

window.openVendedorModal = function (title) {
  document.getElementById('modalTitle').textContent = title || 'Novo Vendedor';
  document.getElementById('vendedorModal').classList.add('open');
  document.getElementById('vendedorNome').focus();
};

window.closeVendedorModal = function () {
  document.getElementById('vendedorModal').classList.remove('open');
  document.getElementById('vendedorEditId').value = '';
  document.getElementById('vendedorNome').value = '';
  document.getElementById('vendedorApelido').value = '';
  document.getElementById('vendedorPin').value = '';
  document.getElementById('vendedorSetor').value = 'loja';
  const fotoInput = document.getElementById('vendedorFoto');
  if (fotoInput) fotoInput.value = '';
  const fotoPreview = document.getElementById('vendedorFotoPreview');
  if (fotoPreview)
    fotoPreview.innerHTML = '<i class="fa-solid fa-user" style="color:var(--text-muted);font-size:18px"></i>';
};

window.editVendedor = function (id, nome, apelido, setor) {
  document.getElementById('vendedorEditId').value = id;
  document.getElementById('vendedorNome').value = nome;
  document.getElementById('vendedorApelido').value = apelido || '';
  document.getElementById('vendedorPin').value = '';
  document.getElementById('vendedorSetor').value = setor || 'loja';
  window.openVendedorModal('Editar Vendedor');
};

let savingVendedor = false;
window.saveVendedor = async function () {
  if (savingVendedor) return;
  savingVendedor = true;
  const id = document.getElementById('vendedorEditId').value;
  const nome = document.getElementById('vendedorNome').value.trim();
  const apelido = document.getElementById('vendedorApelido').value.trim() || null;
  const setor = document.getElementById('vendedorSetor').value || 'loja';
  const pin = document.getElementById('vendedorPin').value.trim();
  const fotoFile = document.getElementById('vendedorFoto')?.files[0] || null;
  if (!nome) {
    toast('Preencha o nome', 'warning');
    savingVendedor = false;
    return;
  }
  if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
    toast('PIN deve ter exatamente 4 dígitos', 'warning');
    savingVendedor = false;
    return;
  }

  if (id) {
    const update = { nome, apelido, setor };
    if (pin) update.pin = pin;
    if (fotoFile) {
      const url = await uploadFoto(id, fotoFile);
      if (url) update.foto_url = url;
    }
    const { error } = await sb.from('vendedores').update(update).eq('id', id).eq('tenant_id', tenantId);
    if (error) {
      toast('Erro ao atualizar: ' + error.message, 'error');
      savingVendedor = false;
      return;
    }
    toast('Vendedor atualizado', 'success');
  } else {
    const insertObj = { nome, apelido, setor, tenant_id: tenantId };
    if (pin) insertObj.pin = pin;
    const { data: inserted, error } = await sb.from('vendedores').insert(insertObj).select('id').single();
    if (error) {
      toast('Erro ao cadastrar: ' + error.message, 'error');
      savingVendedor = false;
      return;
    }
    if (fotoFile && inserted) {
      const url = await uploadFoto(inserted.id, fotoFile);
      if (url) await sb.from('vendedores').update({ foto_url: url }).eq('id', inserted.id).eq('tenant_id', tenantId);
    }
    toast('Vendedor cadastrado', 'success');
  }
  window.closeVendedorModal();
  savingVendedor = false;
  await loadVendedores();
  loadFloor();
};

window.toggleVendedor = async function (id, isAtivo) {
  const { error } = await sb.from('vendedores').update({ ativo: !isAtivo }).eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    toast('Erro: ' + error.message, 'error');
    return;
  }
  toast(isAtivo ? 'Vendedor desativado' : 'Vendedor ativado', 'success');
  loadVendedores();
  loadFloor();
};

window.deleteVendedor = async function (id, nome) {
  if (!confirm('Desativar "' + nome + '"? O vendedor será removido da fila mas seu histórico será preservado.')) return;
  const { error } = await sb
    .from('vendedores')
    .update({ ativo: false, status: 'fora', posicao_fila: null })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (error) {
    toast('Erro: ' + error.message, 'error');
    return;
  }
  toast('Vendedor desativado — histórico preservado', 'success');
  await loadVendedores();
  loadFloor();
};

// ─── Export helpers ───
async function getExportData() {
  // Usar dados em cache quando disponíveis (evita refetch)
  if (_cachedRanking.length > 0 && _cachedStats.total_atendimentos != null) {
    return { ranking: _cachedRanking, stats: _cachedStats, motivos: _cachedMotivos };
  }
  const range = getRange();
  const [rankRes, statsRes, motivosRes] = await Promise.all([
    sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end }),
    sb.rpc('get_conversion_stats', { p_inicio: range.start, p_fim: range.end }),
    sb.rpc('get_loss_reasons', { p_inicio: range.start, p_fim: range.end })
  ]);
  if (rankRes.error) {
    toast('Erro ao exportar: ' + rankRes.error.message, 'error');
    return null;
  }
  if (!rankRes.data || rankRes.data.length === 0) {
    toast('Sem dados para exportar', 'warning');
    return null;
  }
  return { ranking: rankRes.data, stats: statsRes.data?.[0] || {}, motivos: motivosRes.data || [] };
}

function getPeriodLabel() {
  const labels = { [PERIODS.HOJE]: 'Hoje', [PERIODS.ONTEM]: 'Ontem', [PERIODS.SEMANA]: 'Semana', [PERIODS.MES]: 'Mês' };
  return labels[currentPeriod] ?? 'Personalizado';
}

// ─── Export CSV ───
window.exportCSV = async function () {
  const d = await getExportData();
  if (!d) return;
  const period = getPeriodLabel();
  let csv = '\uFEFF';
  csv += 'Relatório Minha Vez — ' + period + '\n';
  csv += 'Gerado em: ' + new Date().toLocaleString('pt-BR') + '\n\n';
  csv += 'Vendedor,Atendimentos,Vendas,Conversão %,Tempo Médio (min)\n';
  d.ranking.forEach((r) => {
    csv += `"${r.nome}",${r.total_atendimentos || 0},${r.total_vendas || 0},${r.taxa_conversao || 0},${r.tempo_medio_min || 0}\n`;
  });
  const totAtend = d.ranking.reduce((s, r) => s + (r.total_atendimentos || 0), 0);
  const totVendas = d.ranking.reduce((s, r) => s + (r.total_vendas || 0), 0);
  const avgConv = totAtend > 0 ? Math.round((totVendas / totAtend) * 100) : 0;
  csv += `\n"TOTAL",${totAtend},${totVendas},${avgConv},—\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'relatorio-minhavez-' + currentPeriod + '-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado!', 'success');
};

// ─── Export PDF ───
window.exportPDF = async function () {
  const d = await getExportData();
  if (!d) return;
  const period = getPeriodLabel();
  const now = new Date().toLocaleString('pt-BR');
  const totAtend = d.ranking.reduce((s, r) => s + (r.total_atendimentos || 0), 0);
  const totVendas = d.ranking.reduce((s, r) => s + (r.total_vendas || 0), 0);
  const avgConv = totAtend > 0 ? Math.round((totVendas / totAtend) * 100) : 0;
  const motivoLabels = {
    preco: 'Preço',
    ruptura: 'Ruptura',
    indecisao: 'Indecisão',
    so_olhando: 'Só olhando',
    outro: 'Outro'
  };

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter Tight',sans-serif;background:#fff;color:#18181B;padding:40px}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:16px;border-bottom:3px solid #a78bfa}
.header h1{font-size:22px;font-weight:800;letter-spacing:-.02em}
.header .sub{font-size:11px;color:#71717A;font-weight:600}
.kpi-row{display:flex;gap:16px;margin-bottom:28px}
.kpi{flex:1;background:#FAFAFA;border:1px solid #E4E4E7;border-radius:6px;padding:16px;text-align:center}
.kpi .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#71717A;margin-bottom:4px}
.kpi .value{font-size:28px;font-weight:800;letter-spacing:-.02em}
.kpi .value.green{color:#8b5cf6} .kpi .value.red{color:#d47a68} .kpi .value.blue{color:#6d85ac} .kpi .value.amber{color:#a78bfa}
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
th{background:#18181B;color:#FAFAFA;padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
td{padding:10px 12px;border-bottom:1px solid #E4E4E7;font-weight:500}
tr:nth-child(even){background:#FAFAFA}
.medal{font-size:16px;text-align:center}
.conv-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px}
.conv-high{background:rgba(167, 139, 250,0.15);color:#8b5cf6} .conv-mid{background:rgba(212,163,115,0.15);color:#b8875a} .conv-low{background:rgba(232,155,138,0.14);color:#d47a68}
.section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#71717A;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #E4E4E7}
.motivos{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.motivo-tag{padding:6px 14px;border-radius:4px;font-size:11px;font-weight:700;background:#F4F4F5;border:1px solid #E4E4E7}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #E4E4E7;font-size:9px;color:#A1A1AA;text-align:center;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
@media print{body{padding:24px}@page{margin:1cm;size:A4}}
</style></head><body>
<div class="header">
  <div><h1>minhavez</h1><div class="sub">${tenant?.nome_loja || 'minhavez'} — Relatório ${period}</div></div>
  <div style="text-align:right"><div class="sub">${now}</div></div>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="label">Atendimentos</div><div class="value">${totAtend}</div></div>
  <div class="kpi"><div class="label">Vendas</div><div class="value green">${totVendas}</div></div>
  <div class="kpi"><div class="label">Conversão</div><div class="value amber">${avgConv}%</div></div>
  <div class="kpi"><div class="label">Tempo Médio</div><div class="value blue">${formatTempo(d.stats.tempo_medio_min || 0)}</div></div>
  ${d.stats.ticket_medio ? `<div class="kpi"><div class="label">Ticket Médio</div><div class="value amber">R$ ${Number(d.stats.ticket_medio).toLocaleString('pt-BR')}</div></div>` : ''}
</div>
<div class="section-title">Ranking de Vendedores</div>
<table>
  <thead><tr><th>#</th><th>Vendedor</th><th>Atendimentos</th><th>Vendas</th><th>Conversão</th><th>Tempo Médio</th></tr></thead>
  <tbody>${d.ranking
    .map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const conv = r.taxa_conversao || 0;
      const cls = conv >= 50 ? 'conv-high' : conv >= 30 ? 'conv-mid' : 'conv-low';
      return `<tr><td class="medal">${medal}</td><td style="font-weight:700">${r.nome}</td><td>${r.total_atendimentos || 0}</td><td style="color:#8b5cf6;font-weight:700">${r.total_vendas || 0}</td><td><span class="conv-badge ${cls}">${conv}%</span></td><td>${formatTempo(r.tempo_medio_min || 0)}</td></tr>`;
    })
    .join('')}
  <tr style="font-weight:800;background:#F4F4F5"><td></td><td>TOTAL</td><td>${totAtend}</td><td style="color:#8b5cf6">${totVendas}</td><td><span class="conv-badge ${avgConv >= 50 ? 'conv-high' : avgConv >= 30 ? 'conv-mid' : 'conv-low'}">${avgConv}%</span></td><td>—</td></tr>
  </tbody>
</table>
${d.motivos.length > 0 ? `<div class="section-title">Motivos de Perda</div><div class="motivos">${d.motivos.map((m) => `<div class="motivo-tag">${motivoLabels[m.motivo] || m.motivo}: <strong>${m.total}</strong></div>`).join('')}</div>` : ''}
<div class="footer">minhavez v3.7 — ${tenant?.nome_loja || 'minhavez'} — Gerado automaticamente</div>
</body></html>`;

  const printWin = window.open('', '_blank');
  if (!printWin) {
    toast('Popup bloqueado — permita popups para exportar PDF', 'warning');
    return;
  }
  printWin.document.write(html);
  printWin.document.close();
  printWin.onload = () => {
    printWin.print();
  };
  toast('PDF pronto para impressão!', 'success');
};

// Close export dropdown on outside click
document.addEventListener('click', (e) => {
  const dd = document.getElementById('exportDropdown');
  const menu = document.getElementById('exportMenu');
  if (dd && menu && !dd.contains(e.target)) menu.classList.remove('open');
});

// ─── Session timeout (8h inactivity — dashboard pode ficar em TV) ───
let _lastActivity = Date.now();
['click', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
  document.addEventListener(
    evt,
    () => {
      _lastActivity = Date.now();
    },
    { passive: true }
  );
});
setInterval(() => {
  if (Date.now() - _lastActivity > SESSION_TIMEOUT_DASHBOARD) {
    toast('Sessão expirada por inatividade', 'warning');
    setTimeout(() => logout(), TOAST_SHORT);
  }
}, SESSION_CHECK_INTERVAL);

// ─── Realtime dashboard updates (partial — só recarrega o que mudou) ───
let _rtVendTimer = null;
let _rtAtendTimer = null;
let _isReloadingAtend = false;
function debouncedReloadVendedores() {
  clearTimeout(_rtVendTimer);
  _rtVendTimer = setTimeout(() => {
    loadFloor();
    loadVendedores();
  }, RT_DASHBOARD_DEBOUNCE);
}
function debouncedReloadAtendimentos() {
  clearTimeout(_rtAtendTimer);
  _rtAtendTimer = setTimeout(async () => {
    if (_isReloadingAtend) return;
    _isReloadingAtend = true;
    try {
      const range = getRange();
      const prevRange = getPrevRange();
      loadKPIs(range, prevRange);
      const res = await sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
      let data = res.data || [];
      if (filterSetor) {
        const setorMap = new Map(_cachedVendedores.map((cv) => [cv.id, cv.setor || 'loja']));
        data = data.filter((r) => setorMap.get(r.vendedor_id) === filterSetor);
      }
      if (filterVendedor) data = data.filter((r) => r.vendedor_id === filterVendedor);
      _cachedRanking = data;
      loadRanking(range, data);
      loadScatter(range, data);
      loadTempoMeta(range, data);
      loadMotivos(range);
      loadHourly(range);
      loadOrigem(range);
      updateTimestamp();
    } finally {
      _isReloadingAtend = false;
    }
  }, 800);
}
let _dashboardRtChannel = sb
  .channel(`dashboard-sync-${tenantId || 'default'}`)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'vendedores', filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined },
    () => debouncedReloadVendedores()
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'atendimentos', filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined },
    () => debouncedReloadAtendimentos()
  )
  .subscribe();

// Cleanup realtime subscription ao sair da página
window.addEventListener('beforeunload', () => {
  try {
    if (_dashboardRtChannel) {
      _dashboardRtChannel.unsubscribe();
      sb.removeChannel(_dashboardRtChannel);
      _dashboardRtChannel = null;
    }
  } catch (e) {
    console.warn('[dashboard rt cleanup]', e?.message || e);
  }
});

// Indicador de última atualização (topbar subhead)
let _lastUpdateAt = Date.now();
function updateTimestamp() {
  _lastUpdateAt = Date.now();
  renderUpdatedAgo();
}
function renderUpdatedAgo() {
  const el = document.getElementById('subheadUpdated');
  if (!el) return;
  const s = Math.max(0, Math.round((Date.now() - _lastUpdateAt) / 1000));
  if (s < 60) el.textContent = s + 's';
  else if (s < 3600) el.textContent = Math.floor(s / 60) + ' min';
  else el.textContent = Math.floor(s / 3600) + ' h';
}
setInterval(renderUpdatedAgo, 10000);

// ─── Changelog versionado (mesma lista do tablet — adicione novas entradas no TOPO) ───
const APP_CHANGELOG = [
  {
    version: '3.7.0',
    date: '2026-04-09',
    items: [
      {
        icon: 'fa-clipboard-list',
        text: 'Log de Pausas — tabela substituída por cards semânticos com Saída, Retorno e Duração'
      },
      { icon: 'fa-palette', text: 'Sidebar redesenhada — botões no estilo Aplicar e fundo na cor dos cards' },
      { icon: 'fa-bug', text: 'Correção: pausas ficavam abertas ao arrastar vendedor de volta à fila (drag-and-drop)' },
      { icon: 'fa-expand', text: 'Dashboard agora preenche a tela inteira em monitores largos' }
    ]
  },
  {
    version: '3.6.0',
    date: '2026-04-07',
    items: [
      { icon: 'fa-lock', text: 'Isolamento entre lojas reforçado — dados de um tenant nunca vazam para outro' },
      { icon: 'fa-shield-halved', text: 'Proteção contra força bruta no PIN dos vendedores' },
      { icon: 'fa-credit-card', text: 'Portal de gerenciamento de assinatura Stripe disponível nas configurações' },
      { icon: 'fa-envelope', text: 'Email automático com links da loja enviado após configuração completa' },
      { icon: 'fa-sliders', text: 'Página de configurações da loja adicionada (/settings)' }
    ]
  },
  {
    version: '3.5.0',
    date: '2026-03-29',
    items: [
      {
        icon: 'fa-calendar-week',
        text: 'Período padrão agora é "Semana" — gráficos mostram últimos 7 dias com mais contexto'
      },
      { icon: 'fa-chart-line', text: 'Tendência: ponto de hoje em destaque com ★ e bolinha maior' },
      { icon: 'fa-chart-bar', text: 'Fluxo por Hora: em multi-dia mostra média/dia + linha vermelha do hoje' },
      { icon: 'fa-mug-hot', text: 'Pausas: registro individual com motivo, horário e duração' },
      { icon: 'fa-file-export', text: 'Botão Exportar padronizado + On Time com efeito glow' }
    ]
  },
  {
    version: '3.3.0',
    date: '2026-03-29',
    items: [
      {
        icon: 'fa-store',
        text: 'SaaS: 3 planos disponíveis — Básico (5 vendedores), Profissional (15) e Avançado (30)'
      },
      { icon: 'fa-palette', text: 'Cores dos gráficos adaptáveis ao tema claro/escuro — textos sempre legíveis' },
      { icon: 'fa-sun', text: 'Modo claro totalmente redesenhado: KPIs, cards, filtros e header com cores ricas' },
      {
        icon: 'fa-credit-card',
        text: 'Checkout Stripe corrigido: redirecionamento pós-pagamento funciona corretamente'
      },
      { icon: 'fa-shield', text: 'Termos de Uso e Política de Privacidade (LGPD) adicionados' }
    ]
  },
  {
    version: '3.2.0',
    date: '2026-03-29',
    items: [
      {
        icon: 'fa-filter',
        text: 'Filtro por vendedor agora atualiza KPIs com dados reais (atendimentos, conversão, ticket médio)'
      },
      { icon: 'fa-square-check', text: 'Botão "Aplicar" para confirmar filtros + botão limpar' },
      { icon: 'fa-bug', text: 'Correção: KPIs não atualizavam ao filtrar por vendedor' }
    ]
  },
  {
    version: '3.1.0',
    date: '2026-03-29',
    items: [
      { icon: 'fa-palette', text: 'Visual redesign: cards com bordas arredondadas, badges pill, paleta refinada' },
      { icon: 'fa-chart-bar', text: 'Gráficos com nova paleta (azul, mint, âmbar), tooltips modernos' },
      { icon: 'fa-arrow-up-1-9', text: 'Animação de contagem nos KPIs ao carregar' },
      { icon: 'fa-circle-dot', text: 'Status On Time: dots pulsam para vendedores disponíveis' }
    ]
  },
  {
    version: '3.0.0',
    date: '2026-03-29',
    items: [
      { icon: 'fa-filter', text: 'Novo: filtros de setor e vendedor — visualize dados individuais' },
      { icon: 'fa-chart-bar', text: 'Gráficos 30% maiores, com gradientes e animações mais suaves' },
      { icon: 'fa-expand', text: 'Layout mais espaçoso, cards com hover e borda colorida' },
      { icon: 'fa-icons', text: 'KPIs com ícones e labels mais legíveis' }
    ]
  },
  {
    version: '2.7.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-gauge-high', text: 'Micro-otimização: transições CSS mais leves, menos repaints' },
      { icon: 'fa-shield', text: 'Correções de estabilidade: race condition no menu de fila, guards em timers' },
      { icon: 'fa-chart-line', text: 'Dashboard: KPIs com cache de DOM, transições específicas' }
    ]
  },
  {
    version: '2.6.0',
    date: '2026-03-28',
    items: [
      {
        icon: 'fa-arrow-rotate-right',
        text: 'Atualizações agora mostram banner "clique para atualizar" — sem deslogar'
      },
      { icon: 'fa-bell', text: 'Dashboard agora mostra popup de novidades' },
      { icon: 'fa-shield', text: 'Correções: troca com diferença e envio de vendedor para atendimento' }
    ]
  },
  {
    version: '2.5.0',
    date: '2026-03-28',
    items: [
      { icon: 'fa-bug', text: 'Correções de bugs: race condition no drag, double-tap cancelar, timer leak' },
      { icon: 'fa-bolt', text: 'Performance: limpeza de DOM otimizada, animações via GPU, cache de drag melhorado' },
      { icon: 'fa-battery-half', text: 'Economia de bateria: intervals pausam quando tab está oculta' },
      { icon: 'fa-expand', text: 'Responsivo: breakpoints para tablets pequenos e grandes, landscape otimizado' },
      { icon: 'fa-hand-pointer', text: 'Touch targets mínimo 44px, fontes mínimo 10px para acessibilidade' }
    ]
  },
  {
    version: '2.4.0',
    date: '2026-03-28',
    items: [
      {
        icon: 'fa-hand-pointer',
        text: 'Novo: arraste o card de atendimento para resolver (venda, troca, não converteu ou cancelar)'
      },
      { icon: 'fa-arrow-up', text: 'Cancelar atendimento agora retorna o vendedor ao 1º da fila' },
      { icon: 'fa-clock', text: 'Timers agora mostram "5min 23s" em vez de "05:23"' }
    ]
  }
];

showChangelog(APP_CHANGELOG, 'minhavez_dash_update_seen_');

// ─── Topbar Subhead: tenant + city + last updated ───
(function initSubhead() {
  const tenantEl = document.getElementById('subheadTenant');
  const cityEl = document.getElementById('subheadCity');
  if (tenantEl) tenantEl.textContent = tenant?.nome_loja || '—';

  async function fetchGeoCity() {
    const apis = ['https://get.geojs.io/v1/ip/geo.json', 'https://ipwho.is/'];
    for (const url of apis) {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (d.city) return d.city;
      } catch {
        /* try next */
      }
    }
    return null;
  }
  (async () => {
    try {
      const city = await fetchGeoCity();
      if (city && cityEl) cityEl.innerHTML = '<i class="fa-solid fa-location-dot"></i> ' + city;
    } catch (e) {
      console.warn('Geo fetch failed:', e);
    }
  })();
})();

// ─── Topbar theme toggle (dark ↔ light) ───
(function initTopbarThemeToggle() {
  const btn = document.getElementById('topbarThemeToggle');
  const icon = document.getElementById('topbarThemeIcon');
  if (!btn || !icon) return;

  function currentMode() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function render(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('lv-theme', mode);
    icon.className = mode === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    btn.setAttribute('aria-label', mode === 'dark' ? 'Alternar para claro' : 'Alternar para escuro');
  }

  render(currentMode());
  btn.addEventListener('click', () => render(currentMode() === 'dark' ? 'light' : 'dark'));
})();

await populateFilters();
// Wait for Satoshi font to load before rendering charts
await document.fonts.ready;
await Promise.all([loadAll(), loadVendedores()]);
setFirstLoadDone();
updateTimestamp();

// ─── Refresh countdown (subhead) — 60s loop que triggera refresh suave ───
(function initRefreshCountdown() {
  const textEl = document.getElementById('refreshCountdownText');
  if (!textEl) return;

  const PERIOD = 60;
  let counter = PERIOD;

  function render() {
    textEl.textContent = counter + 's';
  }
  render();

  setInterval(async () => {
    counter -= 1;
    if (counter <= 0) {
      counter = PERIOD;
      try {
        await loadAll();
        updateTimestamp();
      } catch (_) {
        /* fail silently, próximo tick tenta de novo */
      }
    }
    render();
  }, 1000);
})();

// ─── Theme ───
window.toggleTheme = function () {
  toggleTheme();
  loadAll();
};

// ─── Sidebar dropdown (Dashboard views) ───
window.toggleDashDropdown = function () {
  const dd = document.getElementById('dashDropdown');
  if (!dd) return;
  const isOpen = dd.classList.toggle('open');
  const trigger = dd.querySelector('.sidebar-dropdown-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', String(isOpen));
  localStorage.setItem('lv-dash-dropdown', isOpen ? '1' : '0');
};
(function initDashDropdown() {
  const dd = document.getElementById('dashDropdown');
  if (!dd) return;
  const saved = localStorage.getItem('lv-dash-dropdown');
  if (saved === '0') {
    dd.classList.remove('open');
    const trigger = dd.querySelector('.sidebar-dropdown-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }
  // Mark active sublink based on current page
  const path = location.pathname.toLowerCase();
  let activeView = 'overview';
  if (path.includes('dashboard-vendedor')) activeView = 'vendedor';
  else if (path.includes('dashboard-operacional')) activeView = 'operacional';
  dd.querySelectorAll('.sidebar-sublink').forEach((el) => {
    el.classList.toggle('sidebar-sublink--active', el.dataset.view === activeView);
  });
  // Also update parent trigger active state (only if on overview — sub-pages get own active in their own HTMLs)
  const trigger = dd.querySelector('.sidebar-dropdown-trigger');
  if (trigger && activeView !== 'overview') {
    trigger.classList.remove('sidebar-link--active');
  }
})();

// ─── Section-level collapsibles (Por Vendedor / Operacional) ───
window.toggleSectionCollapse = function (key) {
  const wrap = document.querySelector('.section-collapse[data-section-key="' + key + '"]');
  if (!wrap) return;
  const isOpen = wrap.classList.toggle('open');
  const header = wrap.querySelector('.section-collapse-header');
  if (header) header.setAttribute('aria-expanded', String(isOpen));
  const stored = JSON.parse(localStorage.getItem('lv-section-open') || '{}');
  stored[key] = isOpen;
  localStorage.setItem('lv-section-open', JSON.stringify(stored));
  // Apex charts escondidos renderizam 0px — for\u00e7a resize quando abre
  if (isOpen) setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
};
(function restoreSectionCollapse() {
  const stored = JSON.parse(localStorage.getItem('lv-section-open') || '{}');
  document.querySelectorAll('.section-collapse').forEach((wrap) => {
    const key = wrap.dataset.sectionKey;
    if (!key) return;
    // Default: collapsed. S\u00f3 abre se lv-section-open tiver true explicit.
    if (stored[key] === true) {
      wrap.classList.add('open');
      const header = wrap.querySelector('.section-collapse-header');
      if (header) header.setAttribute('aria-expanded', 'true');
    }
  });
})();

// ─── Collapsible Sections (per-card) ───
window.toggleSection = function (id) {
  const btn = document.getElementById('collapseBtn-' + id);
  const body = document.getElementById('collapseBody-' + id);
  if (!btn || !body) return;
  const isCollapsed = body.classList.toggle('collapsed');
  btn.classList.toggle('collapsed', isCollapsed);
  btn.setAttribute('aria-expanded', String(!isCollapsed));
  const stored = JSON.parse(localStorage.getItem('lv-collapsed') || '{}');
  stored[id] = isCollapsed;
  localStorage.setItem('lv-collapsed', JSON.stringify(stored));
};
// Restore collapsed state on load
(function restoreCollapsed() {
  const stored = JSON.parse(localStorage.getItem('lv-collapsed') || '{}');
  Object.entries(stored).forEach(([id, collapsed]) => {
    if (!collapsed) return;
    const btn = document.getElementById('collapseBtn-' + id);
    const body = document.getElementById('collapseBody-' + id);
    if (btn && body) {
      btn.classList.add('collapsed');
      body.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();

// ─── Drill-down: Motivos de Perda ───
window.openDrillMotivo = async function (motivo, label) {
  const modal = document.getElementById('drillModal');
  const title = document.getElementById('drillTitle');
  const body = document.getElementById('drillBody');
  if (!modal) return;
  title.textContent = label || motivo;
  body.innerHTML =
    '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Carregando...</div>';
  modal.classList.add('open');

  const range = getRange();
  const { data, error } = await fetchDrillMotivo(sb, range, motivo, tenantId);
  if (error || !data || data.length === 0) {
    body.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Nenhum registro encontrado</div>';
    return;
  }
  body.innerHTML = data
    .map((r) => {
      const nome = r.vendedores?.apelido || r.vendedores?.nome || '—';
      const dt = new Date(r.inicio);
      const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dia = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-subtle);font-size:13px">
      <span style="font-weight:600;color:var(--text-primary)">${nome}</span>
      <span style="color:var(--text-muted)">${dia} · ${hora}</span>
    </div>`;
    })
    .join('');
};

window.closeDrillModal = function () {
  document.getElementById('drillModal')?.classList.remove('open');
};

// ============================================
// minhavez Dashboard — Comunicados (composer + listagem)
// Standalone: zero dependência do fluxo de charts. Se falhar, resto do
// dashboard continua funcionando.
// ============================================

import { getSupabase } from '/js/supabase-config.js';

const sb = getSupabase();
let _items = [];
let _tenantId = null;

const TYPE_META = {
  comunicado:  { icon: '📢', label: 'Comunicado' },
  corrida:     { icon: '🏁', label: 'Corrida' },
  evento:      { icon: '📅', label: 'Evento' },
  treinamento: { icon: '🎓', label: 'Treinamento' }
};

// ─── Public API via window (chamada dos onclicks no dashboard.html) ───
window._dashAnnouncementsOpen = openModal;
window._dashAnnouncementsClose = closeModal;

async function openModal() {
  const modal = document.getElementById('annModal');
  if (!modal) return;
  modal.classList.add('open');
  await ensureTenant();
  await loadList();
}

function closeModal() {
  const modal = document.getElementById('annModal');
  if (!modal) return;
  modal.classList.remove('open');
}

async function ensureTenant() {
  if (_tenantId) return;
  const { data: { user } } = await sb.auth.getUser();
  _tenantId = user?.user_metadata?.tenant_id || null;
}

// ─── Wire up composer ───
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('annForm');
  const typeSel = document.getElementById('annType');
  const corridaFields = document.getElementById('annCorridaFields');

  if (typeSel && corridaFields) {
    typeSel.addEventListener('change', () => {
      corridaFields.style.display = typeSel.value === 'corrida' ? 'flex' : 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await publish();
    });
  }
});

async function publish() {
  const btn = document.getElementById('annSubmit');
  showError(null);
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publicando...';

  try {
    await ensureTenant();
    if (!_tenantId) throw new Error('tenant_id não disponível');

    const type  = document.getElementById('annType').value;
    const title = document.getElementById('annTitle').value.trim();
    const body  = document.getElementById('annBody').value.trim();
    const urgent = document.getElementById('annUrgent').checked;

    if (!title) throw new Error('Informe o título do comunicado');

    const metadata = {};
    let expires_at = null;
    if (type === 'corrida') {
      const prize = document.getElementById('annPrize').value.trim();
      const endRaw = document.getElementById('annEndDate').value; // 'YYYY-MM-DD'
      if (endRaw) {
        // Parse como data local (não UTC) e posiciona no fim do dia local: 23:59:59.999
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endRaw);
        if (!m) throw new Error('Data de término inválida');
        const endLocal = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
        if (isNaN(endLocal.getTime())) throw new Error('Data de término inválida');
        if (endLocal.getTime() <= Date.now()) throw new Error('A data de término precisa ser no futuro');
        metadata.end_date = endLocal.toISOString();
        expires_at = metadata.end_date;
      }
      if (prize) metadata.prize = prize;
    }

    const { error } = await sb.from('tenant_announcements').insert({
      tenant_id: _tenantId,
      type,
      title,
      body,
      urgent,
      metadata,
      expires_at
    });
    if (error) throw error;

    // Reseta form
    document.getElementById('annForm').reset();
    document.getElementById('annCorridaFields').style.display = 'none';
    document.getElementById('annComposerDetails').open = false;

    await loadList();
    toast('Comunicado publicado', 'success');
  } catch (err) {
    console.error('[announcements] publish falhou:', err);
    showError(err?.message || 'Erro ao publicar');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publicar';
  }
}

async function loadList() {
  const list = document.getElementById('annList');
  if (!list) return;

  const { data, error } = await sb
    .from('tenant_announcements')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<div style="color:var(--danger);padding:16px;font-size:12px">Erro: ${escapeHtml(error.message)}</div>`;
    return;
  }

  _items = data || [];
  if (_items.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Nenhum comunicado ainda.<br>Crie o primeiro acima.</div>';
    return;
  }

  list.innerHTML = _items.map(renderItem).join('');
  list.querySelectorAll('[data-archive]').forEach((btn) => {
    btn.addEventListener('click', () => archive(btn.dataset.archive));
  });
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => remove(btn.dataset.delete));
  });
}

function renderItem(a) {
  const meta = TYPE_META[a.type] || TYPE_META.comunicado;
  const isArchived = a.archived_at != null;
  const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
  const badge = isArchived ? 'ARQUIVADO'
              : isExpired ? 'EXPIRADO'
              : a.urgent ? 'URGENTE' : '';
  const badgeColor = isArchived || isExpired ? 'var(--text-muted)' : 'var(--accent)';
  const corridaInfo = a.type === 'corrida' && a.metadata?.prize
    ? `<div style="font-size:11px;color:var(--warning);margin-top:4px">🏆 ${escapeHtml(a.metadata.prize)}</div>`
    : '';

  return `
    <div style="padding:12px 14px;background:var(--surface-subtle);border:1px solid var(--border-subtle);border-radius:10px;${isArchived || isExpired ? 'opacity:0.6' : ''}">
      <div style="display:flex;align-items:start;gap:10px;justify-content:space-between">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:15px">${meta.icon}</span>
            <strong style="font-size:13px;color:var(--text);font-weight:700">${escapeHtml(a.title)}</strong>
            ${badge ? `<span style="font-size:9px;font-weight:800;color:${badgeColor};letter-spacing:0.08em;text-transform:uppercase">${badge}</span>` : ''}
          </div>
          ${a.body ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.4;white-space:pre-wrap">${escapeHtml(a.body.slice(0, 180))}${a.body.length > 180 ? '…' : ''}</div>` : ''}
          ${corridaInfo}
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px">${formatDate(a.published_at)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${!isArchived ? `<button data-archive="${a.id}" title="Arquivar" style="background:none;border:1px solid var(--border-subtle);color:var(--text-muted);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px"><i class="fa-solid fa-box-archive"></i></button>` : ''}
          <button data-delete="${a.id}" title="Apagar" style="background:none;border:1px solid var(--border-subtle);color:var(--danger);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
  `;
}

async function archive(id) {
  const { error } = await sb.from('tenant_announcements')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Arquivado', 'success');
  await loadList();
}

async function remove(id) {
  if (!confirm('Apagar este comunicado? Esta ação não pode ser desfeita.')) return;
  const { error } = await sb.from('tenant_announcements').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Apagado', 'success');
  await loadList();
}

function showError(msg) {
  const box = document.getElementById('annError');
  if (!box) return;
  if (!msg) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>' + escapeHtml(msg);
  box.style.display = 'block';
}

// ─── Utils ───
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function toast(msg, kind) {
  // Reusa o toast system do dashboard se existir, senão alert.
  if (typeof window.showToast === 'function') {
    window.showToast(msg, kind);
  } else {
    const c = document.getElementById('toastContainer');
    if (!c) { alert(msg); return; }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `background:${kind === 'error' ? 'var(--danger)' : 'var(--success)'};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2)`;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

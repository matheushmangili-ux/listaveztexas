// ============================================
// minhavez Dashboard — Missões diárias CMS
// Modal standalone com lista + form + sugestões pré-prontas.
// ============================================

import { getSupabase } from '/js/supabase-config.js';
import { renderState } from '/js/ui.js';

const sb = getSupabase();

const GOAL_LABELS = {
  atendimentos_count: 'Atendimentos',
  vendas_count: 'Vendas',
  vendas_canal_count: 'Vendas por canal',
  valor_vendido_total: 'Valor vendido (R$)'
};

const SUGGESTIONS = [
  { title: '5 atendimentos hoje', goal_type: 'atendimentos_count', goal_value: 5, reward_xp: 30, icon: 'fa-handshake' },
  { title: '3 vendas hoje', goal_type: 'vendas_count', goal_value: 3, reward_xp: 80, icon: 'fa-bag-shopping' },
  { title: '10 atendimentos hoje', goal_type: 'atendimentos_count', goal_value: 10, reward_xp: 60, icon: 'fa-users' },
  {
    title: 'R$ 500 em vendas',
    goal_type: 'valor_vendido_total',
    goal_value: 500,
    reward_xp: 100,
    icon: 'fa-dollar-sign'
  },
  { title: '1 venda hoje', goal_type: 'vendas_count', goal_value: 1, reward_xp: 25, icon: 'fa-star' },
  { title: '7 atendimentos hoje', goal_type: 'atendimentos_count', goal_value: 7, reward_xp: 45, icon: 'fa-fire' }
];

window._dashMissionsOpen = openModal;
window._dashMissionsClose = closeModal;

async function openModal() {
  document.getElementById('missionsModal')?.classList.add('open');
  renderSuggestions();
  await loadList();
}

function closeModal() {
  document.getElementById('missionsModal')?.classList.remove('open');
}

function renderSuggestions() {
  const grid = document.getElementById('missionSuggestionsGrid');
  if (!grid) return;
  grid.innerHTML = SUGGESTIONS.map(
    (s, i) => `
    <button type="button" data-suggest="${i}" style="padding:10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px;text-align:left">
      <i class="fa-solid ${s.icon}" style="color:var(--success)"></i>
      <span>${esc(s.title)}<br><span style="font-size:10px;color:var(--text-muted);font-weight:400">${s.reward_xp} XP</span></span>
    </button>
  `
  ).join('');
  grid.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = SUGGESTIONS[parseInt(btn.dataset.suggest)];
      fillForm(s);
      document.getElementById('missionFormDetails').open = true;
      document.getElementById('missionSuggestions').open = false;
    });
  });
}

function fillForm(data) {
  document.getElementById('missionEditId').value = data.id || '';
  document.getElementById('missionTitle').value = data.title || '';
  document.getElementById('missionDesc').value = data.description || '';
  document.getElementById('missionGoalType').value = data.goal_type || 'atendimentos_count';
  document.getElementById('missionGoalValue').value = data.goal_value || '';
  document.getElementById('missionRewardXp').value = data.reward_xp ?? 50;
}

function resetForm() {
  document.getElementById('missionEditId').value = '';
  document.getElementById('missionForm').reset();
  document.getElementById('missionRewardXp').value = '50';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('missionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveMission();
  });
});

async function saveMission() {
  showError(null);
  const btn = document.getElementById('missionSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  try {
    const title = document.getElementById('missionTitle').value.trim();
    if (!title) throw new Error('Título obrigatório');

    const goalValue = parseFloat(document.getElementById('missionGoalValue').value);
    if (!goalValue || goalValue <= 0) throw new Error('Meta precisa ser maior que zero');

    const rewardXp = parseInt(document.getElementById('missionRewardXp').value, 10);
    if (!Number.isFinite(rewardXp) || rewardXp < 0) throw new Error('Recompensa XP inválida');

    const editId = document.getElementById('missionEditId').value || null;
    const payload = {
      id: editId,
      title,
      description: document.getElementById('missionDesc').value.trim(),
      goal_type: document.getElementById('missionGoalType').value,
      goal_value: String(goalValue),
      reward_xp: String(rewardXp),
      icon: 'fa-bullseye',
      active_days: '127',
      active: 'true'
    };

    const { error } = await sb.rpc('admin_upsert_mission_template', { p_payload: payload });
    if (error) throw error;

    resetForm();
    document.getElementById('missionFormDetails').open = false;
    await loadList();
    toast(editId ? 'Missão atualizada' : 'Missão criada', 'success');
  } catch (err) {
    showError(err?.message || String(err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar missão';
  }
}

async function loadList() {
  const list = document.getElementById('missionList');
  if (!list) return;

  renderState(list, 'loading');

  const { data, error } = await sb.rpc('admin_list_mission_templates');
  if (error) {
    renderState(list, 'error', {
      title: 'Não consegui carregar as missões',
      hint: error.message,
      onRetry: loadList
    });
    return;
  }

  if (!data || data.length === 0) {
    renderState(list, 'empty', {
      icon: 'fa-flag-checkered',
      title: 'Nenhuma missão criada ainda',
      hint: 'Use as sugestões acima ou crie uma nova.'
    });
    return;
  }

  list.innerHTML = data.map(renderItem).join('');
  list.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = data.find((d) => d.id === btn.dataset.edit);
      if (item) {
        fillForm(item);
        document.getElementById('missionFormDetails').open = true;
      }
    });
  });
  list.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = data.find((d) => d.id === btn.dataset.toggle);
      if (!item) return;
      await sb.rpc('admin_upsert_mission_template', {
        p_payload: { id: item.id, active: String(!item.active) }
      });
      await loadList();
    });
  });
  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Apagar esta missão?')) return;
      await sb.rpc('admin_delete_mission_template', { p_id: btn.dataset.del });
      await loadList();
    });
  });
}

function renderItem(m) {
  const goalLabel = GOAL_LABELS[m.goal_type] || m.goal_type;
  return `
    <div style="padding:12px 14px;background:var(--surface-subtle);border:1px solid var(--border-subtle);border-radius:10px;${!m.active ? 'opacity:0.5' : ''}">
      <div style="display:flex;align-items:start;gap:10px;justify-content:space-between">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <i class="fa-solid ${esc(m.icon || 'fa-bullseye')}" style="color:var(--success)"></i>
            <strong style="font-size:13px;color:var(--text)">${esc(m.title)}</strong>
            ${!m.active ? '<span style="font-size:9px;font-weight:800;color:var(--text-muted);letter-spacing:0.08em;text-transform:uppercase">INATIVA</span>' : ''}
          </div>
          <div style="font-size:11px;color:var(--text-muted)">${goalLabel}: ${m.goal_value} · Recompensa: ${m.reward_xp} XP</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button data-edit="${m.id}" title="Editar" style="background:none;border:1px solid var(--border-subtle);color:var(--text-muted);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px"><i class="fa-solid fa-pen"></i></button>
          <button data-toggle="${m.id}" title="${m.active ? 'Desativar' : 'Ativar'}" style="background:none;border:1px solid var(--border-subtle);color:${m.active ? 'var(--warning)' : 'var(--success)'};width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px"><i class="fa-solid ${m.active ? 'fa-pause' : 'fa-play'}"></i></button>
          <button data-del="${m.id}" title="Apagar" style="background:none;border:1px solid var(--border-subtle);color:var(--danger);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
  `;
}

function showError(msg) {
  const box = document.getElementById('missionError');
  if (!box) return;
  if (!msg) {
    box.style.display = 'none';
    return;
  }
  box.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>' + esc(msg);
  box.style.display = 'block';
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg, kind) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, kind);
    return;
  }
  const c = document.getElementById('toastContainer');
  if (!c) {
    alert(msg);
    return;
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `background:${kind === 'error' ? 'var(--danger)' : 'var(--success)'};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2)`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

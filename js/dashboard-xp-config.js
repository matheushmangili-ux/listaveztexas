// ============================================
// minhavez Dashboard — Gamificação: config de XP por evento (Fase 2)
// Modal standalone, não depende de charts/init.
// ============================================

import { getSupabase } from '/js/supabase-config.js';

const sb = getSupabase();
const DEFAULTS = {
  atendimento_concluido: 20,
  venda_realizada: 50,
  troca_realizada: 15
};

window._dashXpConfigOpen = openModal;
window._dashXpConfigClose = closeModal;

async function openModal() {
  const modal = document.getElementById('xpConfigModal');
  if (!modal) return;
  showError(null);
  modal.classList.add('open');
  await loadConfig();
}

function closeModal() {
  const modal = document.getElementById('xpConfigModal');
  modal?.classList.remove('open');
}

async function loadConfig() {
  try {
    const { data, error } = await sb.rpc('admin_get_xp_config');
    if (error) throw error;
    const cfg = data || DEFAULTS;
    document.getElementById('xpCfgAtend').value = cfg.atendimento_concluido ?? DEFAULTS.atendimento_concluido;
    document.getElementById('xpCfgVenda').value = cfg.venda_realizada ?? DEFAULTS.venda_realizada;
    document.getElementById('xpCfgTroca').value = cfg.troca_realizada ?? DEFAULTS.troca_realizada;
    updatePreview();
  } catch (err) {
    showError('Erro ao carregar config: ' + (err?.message || String(err)));
  }
}

async function saveConfig() {
  showError(null);
  const btn = document.getElementById('xpCfgSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

  try {
    const atend = parseInt(document.getElementById('xpCfgAtend').value, 10);
    const venda = parseInt(document.getElementById('xpCfgVenda').value, 10);
    const troca = parseInt(document.getElementById('xpCfgTroca').value, 10);

    if (!Number.isFinite(atend) || atend < 0) throw new Error('Valor de atendimento inválido');
    if (!Number.isFinite(venda) || venda < 0) throw new Error('Valor de venda inválido');
    if (!Number.isFinite(troca) || troca < 0) throw new Error('Valor de troca inválido');

    const { error } = await sb.rpc('admin_set_xp_config', {
      p_config: {
        atendimento_concluido: String(atend),
        venda_realizada: String(venda),
        troca_realizada: String(troca)
      }
    });
    if (error) throw error;

    toast('Configuração salva', 'success');
    closeModal();
  } catch (err) {
    console.error('[xp-config] save falhou:', err);
    showError(err?.message || String(err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar';
  }
}

function updatePreview() {
  const atend = parseInt(document.getElementById('xpCfgAtend').value, 10) || 0;
  const venda = parseInt(document.getElementById('xpCfgVenda').value, 10) || 0;
  const troca = parseInt(document.getElementById('xpCfgTroca').value, 10) || 0;
  // Cenário: 15 atend/dia, 5 vendas, 1 troca
  const diario = 15 * atend + 5 * venda + 1 * troca;
  const semanal = diario * 6;
  const preview = document.getElementById('xpCfgPreviewText');
  if (preview) {
    preview.innerHTML = ` Um vendedor com <strong>15 atend/dia, 5 vendas, 1 troca</strong> ganha <strong class="mono">${diario} XP/dia</strong> (~${semanal}/semana).`;
  }
}

function resetDefaults() {
  document.getElementById('xpCfgAtend').value = DEFAULTS.atendimento_concluido;
  document.getElementById('xpCfgVenda').value = DEFAULTS.venda_realizada;
  document.getElementById('xpCfgTroca').value = DEFAULTS.troca_realizada;
  updatePreview();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('xpConfigForm');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); saveConfig(); });
  }
  document.getElementById('xpCfgReset')?.addEventListener('click', resetDefaults);
  ['xpCfgAtend', 'xpCfgVenda', 'xpCfgTroca'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updatePreview);
  });
});

function showError(msg) {
  const box = document.getElementById('xpCfgError');
  if (!box) return;
  if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
  box.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>' + escapeHtml(msg);
  box.style.display = 'block';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, kind) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, kind);
    return;
  }
  const c = document.getElementById('toastContainer');
  if (!c) { alert(msg); return; }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `background:${kind === 'error' ? 'var(--danger)' : 'var(--success)'};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2)`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

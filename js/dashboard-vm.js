// ============================================
// minhavez Dashboard — VM Photos Admin (Fase 6)
// Fila de aprovação: pendente / aprovado / rejeitado
// ============================================

(function () {
  let sb = null;
  let _queue = [];
  let _activeStatus = 'pending';

  window._dashVmOpen = async function () {
    sb = window._supabase;
    if (!sb) return;
    const modal = document.getElementById('vmModal');
    if (modal) modal.classList.add('visible');
    await loadQueue();
  };

  window._dashVmClose = function () {
    const modal = document.getElementById('vmModal');
    if (modal) modal.classList.remove('visible');
  };

  async function loadQueue() {
    const body = document.getElementById('vmModalBody');
    if (!body) return;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Carregando…</div>';

    try {
      const { data, error } = await sb.rpc('admin_get_vm_queue', {
        p_status: _activeStatus,
        p_limit: 50
      });
      if (error) throw error;
      _queue = data || [];
      renderBody(body);
    } catch (err) {
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger)">Erro: ${err?.message || err}</div>`;
    }
  }

  function renderBody(body) {
    const tabs = `
      <div class="vm-admin-tabs">
        <button class="vm-admin-tab${_activeStatus === 'pending' ? ' active' : ''}" data-s="pending">Pendentes</button>
        <button class="vm-admin-tab${_activeStatus === 'approved' ? ' active' : ''}" data-s="approved">Aprovados</button>
        <button class="vm-admin-tab${_activeStatus === 'rejected' ? ' active' : ''}" data-s="rejected">Rejeitados</button>
      </div>
    `;

    let list = '';
    if (_queue.length === 0) {
      list = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-style:italic">Nenhuma submissão neste status.</div>';
    } else {
      list = '<div class="vm-admin-list">' + _queue.map(renderItem).join('') + '</div>';
    }

    body.innerHTML = tabs + list;

    body.querySelectorAll('.vm-admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeStatus = btn.dataset.s;
        loadQueue();
      });
    });

    body.querySelectorAll('.vm-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => reviewVm(btn.dataset.id, 'approved'));
    });

    body.querySelectorAll('.vm-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.vm-admin-item');
        const input = row?.querySelector('.vm-reject-input');
        if (input) {
          input.classList.toggle('hidden');
          if (!input.classList.contains('hidden')) input.querySelector('input')?.focus();
        }
      });
    });

    body.querySelectorAll('.vm-reject-confirm').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.vm-admin-item');
        const feedback = row?.querySelector('.vm-reject-feedback')?.value?.trim() || '';
        reviewVm(btn.dataset.id, 'rejected', feedback);
      });
    });
  }

  function renderItem(item) {
    const nome = item.vendor_apelido || item.vendor_nome || '—';
    const catLabel = {
      vitrine: 'Vitrine', gondola: 'Gôndola', display: 'Display',
      prateleira: 'Prateleira', checkout: 'Checkout', fachada: 'Fachada', outro: 'Outro'
    }[item.category] || item.category;
    const date = new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const actions = _activeStatus === 'pending' ? `
      <div class="vm-admin-actions">
        <button class="vm-approve-btn" data-id="${item.id}"><i class="fa-solid fa-check"></i> Aprovar</button>
        <button class="vm-reject-btn" data-id="${item.id}"><i class="fa-solid fa-xmark"></i> Rejeitar</button>
      </div>
      <div class="vm-reject-input hidden">
        <input type="text" class="vm-reject-feedback" placeholder="Motivo da rejeição (opcional)" maxlength="200">
        <button class="vm-reject-confirm" data-id="${item.id}">Confirmar</button>
      </div>
    ` : '';

    const feedbackHtml = item.feedback ? `<div class="vm-admin-feedback"><i class="fa-solid fa-comment"></i> ${esc(item.feedback)}</div>` : '';

    return `
      <div class="vm-admin-item" data-id="${item.id}">
        <img src="${esc(item.photo_url)}" alt="VM" class="vm-admin-thumb" loading="lazy">
        <div class="vm-admin-info">
          <div class="vm-admin-meta">
            <strong>${esc(nome)}</strong>
            <span class="vm-admin-cat">${esc(catLabel)}</span>
            <span class="vm-admin-date">${date}</span>
          </div>
          ${item.description ? `<div class="vm-admin-desc">${esc(item.description)}</div>` : ''}
          ${feedbackHtml}
          ${actions}
        </div>
      </div>
    `;
  }

  async function reviewVm(id, status, feedback) {
    try {
      const { error } = await sb.rpc('admin_review_vm', {
        p_submission_id: id,
        p_status: status,
        p_feedback: feedback || null
      });
      if (error) throw error;
      window._toast?.(`VM ${status === 'approved' ? 'aprovada' : 'rejeitada'}!`, 'success');
      await loadQueue();
    } catch (err) {
      window._toast?.(err?.message || 'Erro ao revisar', 'error');
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();

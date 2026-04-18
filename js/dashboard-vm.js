// ============================================
// minhavez Dashboard — VM Photos + VM Missions Admin (Fase 6 + 6b)
// Create tasks, track compliance, approve/reject, free-form photos.
// ============================================

(function () {
  let sb = null;
  let _queue = [];
  let _tasks = [];
  let _taskSubs = [];
  let _activeTab = 'create';
  let _freeStatus = 'pending';
  let _viewingTaskId = null;

  const CATS = [
    { id: 'vitrine', label: 'Vitrine' },
    { id: 'gondola', label: 'Gôndola' },
    { id: 'display', label: 'Display' },
    { id: 'prateleira', label: 'Prateleira' },
    { id: 'checkout', label: 'Checkout' },
    { id: 'fachada', label: 'Fachada' },
    { id: 'outro', label: 'Outro' }
  ];

  // Lightbox genérico: abre a imagem em fullscreen sobre tudo. Fecha em click fora / ESC.
  function openLightbox(src) {
    const existing = document.getElementById('vmLightbox');
    // Sem o abort, reabrir a lightbox deixava o keydown antigo órfão no document.
    if (existing) {
      existing._abortCtrl?.abort();
      existing.remove();
    }
    const abortCtrl = new AbortController();
    const overlay = document.createElement('div');
    overlay.id = 'vmLightbox';
    overlay._abortCtrl = abortCtrl;
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
    overlay.innerHTML = `
      <img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,0.6)" />
      <button aria-label="Fechar" style="position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:20px;border:none;background:rgba(255,255,255,0.12);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-xmark"></i></button>
    `;
    const close = () => {
      abortCtrl.abort();
      overlay.remove();
    };
    overlay.addEventListener('click', close, { signal: abortCtrl.signal });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') close();
      },
      { signal: abortCtrl.signal }
    );
    document.body.appendChild(overlay);
  }

  window._dashVmOpen = async function () {
    sb = window._supabase;
    if (!sb) return;
    const modal = document.getElementById('vmModal');
    if (modal) modal.classList.add('open');
    _activeTab = 'track';
    await renderModal();
  };

  window._dashVmClose = function () {
    document.getElementById('vmModal')?.classList.remove('open');
    _viewingTaskId = null;
  };

  async function renderModal() {
    const body = document.getElementById('vmModalBody');
    if (!body) return;

    body.innerHTML = `
      <div class="vm-admin-tabs">
        <button class="vm-admin-tab${_activeTab === 'create' ? ' active' : ''}" data-t="create">Criar Tarefa</button>
        <button class="vm-admin-tab${_activeTab === 'track' ? ' active' : ''}" data-t="track">Acompanhar</button>
        <button class="vm-admin-tab${_activeTab === 'free' ? ' active' : ''}" data-t="free">Fotos Livres</button>
      </div>
      <div id="vmTabContent"></div>
    `;

    body.querySelectorAll('.vm-admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.t;
        _viewingTaskId = null;
        renderModal();
      });
    });

    if (_activeTab === 'create') renderCreateForm();
    else if (_activeTab === 'track') await renderTrackView();
    else await renderFreeView();
  }

  // ─── Create Task ───
  function renderCreateForm() {
    const area = document.getElementById('vmTabContent');
    if (!area) return;

    area.innerHTML = `
      <div class="vm-create-form">
        <label class="vm-form-label">Título *<input type="text" id="vmTaskTitle" maxlength="100" placeholder="Ex: Vitrine Coleção Inverno"></label>
        <label class="vm-form-label">Descrição<textarea id="vmTaskDesc" rows="2" maxlength="300" placeholder="Instruções detalhadas..."></textarea></label>
        <div class="vm-form-label">Categoria *
          <div class="vm-cat-row">${CATS.map((c) => `<button class="vm-cat-pill-sm" data-cat="${c.id}">${c.label}</button>`).join('')}</div>
        </div>
        <div class="vm-form-row">
          <label class="vm-form-label">Prioridade
            <select id="vmTaskPriority"><option value="normal">Normal</option><option value="urgente">Urgente</option></select>
          </label>
          <label class="vm-form-label">Prazo<input type="datetime-local" id="vmTaskDue"></label>
          <label class="vm-form-label">XP<input type="number" id="vmTaskXp" value="30" min="0" max="500"></label>
        </div>
        <div class="vm-form-label">Fotos de referência (até 5)
          <div class="vm-ref-upload" id="vmRefUpload">
            <button class="vm-ref-add" id="vmRefAddBtn"><i class="fa-solid fa-plus"></i></button>
          </div>
          <input type="file" accept="image/*" id="vmRefInput" class="hidden" multiple>
        </div>
        <div class="vm-form-label">Checklist
          <div id="vmChecklistBuilder"></div>
          <button class="vm-checklist-add" id="vmAddCheckItem"><i class="fa-solid fa-plus"></i> Adicionar item</button>
        </div>
        <button class="vendor-btn-primary" id="vmCreateBtn" style="width:100%;margin-top:12px">
          <i class="fa-solid fa-paper-plane"></i> Criar e enviar
        </button>
      </div>
    `;

    let selectedCat = null;
    const refFiles = [];
    const checkItems = [];

    area.querySelectorAll('.vm-cat-pill-sm').forEach((btn) => {
      btn.addEventListener('click', () => {
        area.querySelectorAll('.vm-cat-pill-sm').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCat = btn.dataset.cat;
      });
    });

    // Reference photos
    document
      .getElementById('vmRefAddBtn')
      ?.addEventListener('click', () => document.getElementById('vmRefInput')?.click());
    document.getElementById('vmRefInput')?.addEventListener('change', (e) => {
      for (const f of e.target.files) {
        if (refFiles.length >= 5) break;
        refFiles.push(f);
      }
      renderRefPreviews();
    });

    function renderRefPreviews() {
      const wrap = document.getElementById('vmRefUpload');
      if (!wrap) return;
      wrap.innerHTML =
        refFiles
          .map((f, i) => {
            const url = URL.createObjectURL(f);
            return `<div class="vm-ref-preview"><img src="${url}"><button class="vm-ref-remove" data-idx="${i}"><i class="fa-solid fa-xmark"></i></button></div>`;
          })
          .join('') +
        (refFiles.length < 5
          ? '<button class="vm-ref-add" id="vmRefAddBtn2"><i class="fa-solid fa-plus"></i></button>'
          : '');
      wrap.querySelectorAll('.vm-ref-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          refFiles.splice(parseInt(btn.dataset.idx), 1);
          renderRefPreviews();
        });
      });
      document
        .getElementById('vmRefAddBtn2')
        ?.addEventListener('click', () => document.getElementById('vmRefInput')?.click());
    }

    // Checklist builder
    document.getElementById('vmAddCheckItem')?.addEventListener('click', () => {
      checkItems.push('');
      renderChecklist();
    });

    function renderChecklist() {
      const wrap = document.getElementById('vmChecklistBuilder');
      if (!wrap) return;
      wrap.innerHTML = checkItems
        .map(
          (label, i) =>
            `<div class="vm-checklist-row">
          <input type="text" class="vm-checklist-input" data-idx="${i}" value="${esc(label)}" placeholder="Item ${i + 1}">
          <button class="vm-checklist-remove" data-idx="${i}"><i class="fa-solid fa-xmark"></i></button>
        </div>`
        )
        .join('');
      wrap.querySelectorAll('.vm-checklist-input').forEach((input) => {
        input.addEventListener('input', () => {
          checkItems[parseInt(input.dataset.idx)] = input.value;
        });
      });
      wrap.querySelectorAll('.vm-checklist-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          checkItems.splice(parseInt(btn.dataset.idx), 1);
          renderChecklist();
        });
      });
    }

    // Submit
    document.getElementById('vmCreateBtn')?.addEventListener('click', async () => {
      const title = document.getElementById('vmTaskTitle')?.value?.trim();
      if (!title || !selectedCat) {
        window._toast?.('Preencha título e categoria', 'error');
        return;
      }

      const btn = document.getElementById('vmCreateBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Criando…';
      }

      try {
        // Upload reference photos
        const refs = [];
        for (const f of refFiles) {
          const blob = await resizeImg(f, 800, 0.8);
          const uuid = crypto.randomUUID();
          const path = `refs/${uuid}.jpg`;
          const { error } = await sb.storage.from('vm-photos').upload(path, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
          const { data } = sb.storage.from('vm-photos').getPublicUrl(path);
          refs.push({ photo_url: data?.publicUrl || '', photo_path: path });
        }

        const payload = {
          title,
          description: document.getElementById('vmTaskDesc')?.value?.trim() || '',
          category: selectedCat,
          priority: document.getElementById('vmTaskPriority')?.value || 'normal',
          due_at: document.getElementById('vmTaskDue')?.value || null,
          reward_xp: parseInt(document.getElementById('vmTaskXp')?.value) || 30,
          references: refs,
          checklist: checkItems.filter((l) => l.trim()).map((l) => ({ label: l.trim() }))
        };

        const { error } = await sb.rpc('admin_create_vm_task', { p_payload: payload });
        if (error) throw error;

        window._toast?.('Tarefa criada e enviada!', 'success');
        _activeTab = 'track';
        await renderModal();
      } catch (err) {
        window._toast?.(err?.message || 'Erro ao criar tarefa', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Criar e enviar';
        }
      }
    });
  }

  // ─── Track View ───
  async function renderTrackView() {
    const area = document.getElementById('vmTabContent');
    if (!area) return;

    if (_viewingTaskId) {
      await renderTaskDetail(area);
      return;
    }

    area.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">Carregando…</div>';

    try {
      const { data, error } = await sb.rpc('admin_get_vm_tasks', { p_status: 'active' });
      if (error) throw error;
      _tasks = data || [];
    } catch (err) {
      area.innerHTML = `<div style="padding:12px;color:var(--danger)">Erro: ${esc(err?.message || '')}</div>`;
      return;
    }

    if (_tasks.length === 0) {
      area.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--text-muted);font-style:italic">Nenhuma tarefa ativa. Crie uma na aba "Criar Tarefa".</div>';
      return;
    }

    area.innerHTML = _tasks
      .map((t) => {
        const total = Number(t.total_assignments) || 0;
        const approved = Number(t.approved_count) || 0;
        const submitted = Number(t.submitted_count) || 0;
        const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
        return `<div class="vm-track-card" data-tid="${t.id}">
        <div class="vm-track-top">
          <strong>${esc(t.title)}</strong>
          ${t.priority === 'urgente' ? '<span class="vm-priority-badge-sm">URGENTE</span>' : ''}
        </div>
        <div class="vm-compliance-bar"><div class="vm-compliance-fill" style="width:${pct}%"></div></div>
        <div class="vm-track-stats">
          <span>${approved}/${total} aprovados (${pct}%)</span>
          ${submitted > 0 ? `<span class="vm-track-pending">${submitted} aguardando revisão</span>` : ''}
        </div>
      </div>`;
      })
      .join('');

    area.querySelectorAll('.vm-track-card').forEach((card) => {
      card.addEventListener('click', () => {
        _viewingTaskId = card.dataset.tid;
        renderTrackView();
      });
    });
  }

  async function renderTaskDetail(area) {
    area.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">Carregando submissões…</div>';

    try {
      const { data, error } = await sb.rpc('admin_get_task_submissions', { p_task_id: _viewingTaskId });
      if (error) throw error;
      _taskSubs = data || [];
    } catch (err) {
      area.innerHTML = `<div style="padding:12px;color:var(--danger)">Erro: ${esc(err?.message || '')}</div>`;
      return;
    }

    const task = _tasks.find((t) => t.id === _viewingTaskId);
    const backBtn = `<button class="vm-back-btn" id="vmBackBtn"><i class="fa-solid fa-arrow-left"></i> Voltar</button>`;

    area.innerHTML =
      backBtn +
      `<h4 style="margin:8px 0 12px">${esc(task?.title || '')}</h4>` +
      (_taskSubs.length === 0
        ? '<div style="padding:12px;color:var(--text-muted);font-style:italic">Nenhuma submissão ainda.</div>'
        : '<div class="vm-admin-list">' +
          _taskSubs
            .map((s) => {
              const nome = s.vendor_apelido || s.vendor_nome || '—';
              const photos = s.photos || [];
              const checks = s.checklist_responses || [];
              const statusLabel =
                {
                  pending: 'Pendente',
                  in_progress: 'Em execução',
                  submitted: 'Enviado',
                  approved: 'Aprovado',
                  rejected: 'Rejeitado',
                  revision: 'Ajuste'
                }[s.status] || s.status;
              const showActions = s.status === 'submitted';

              return `<div class="vm-admin-item" data-aid="${s.assignment_id}">
          <div class="vm-admin-info" style="width:100%">
            <div class="vm-admin-meta">
              <strong>${esc(nome)}</strong>
              <span class="vm-admin-cat">${statusLabel}</span>
              ${s.submitted_at ? `<span class="vm-admin-date">${new Date(s.submitted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            </div>
            ${photos.length > 0 ? `<div class="vm-side-by-side">${photos.map((p) => `<img src="${esc(p.url)}" class="vm-admin-thumb" loading="lazy">`).join('')}</div>` : ''}
            ${checks.length > 0 ? `<div class="vm-check-summary">${checks.map((c) => `<span class="${c.checked ? 'checked' : 'unchecked'}">${c.checked ? '✓' : '✗'}</span>`).join(' ')}</div>` : ''}
            ${s.feedback ? `<div class="vm-admin-feedback"><i class="fa-solid fa-comment"></i> ${esc(s.feedback)}</div>` : ''}
            ${
              showActions
                ? `<div class="vm-admin-actions">
              <button class="vm-approve-btn" data-id="${s.assignment_id}"><i class="fa-solid fa-check"></i> Aprovar</button>
              <button class="vm-reject-btn" data-id="${s.assignment_id}"><i class="fa-solid fa-xmark"></i> Rejeitar</button>
              <button class="vm-revision-btn" data-id="${s.assignment_id}"><i class="fa-solid fa-rotate-left"></i> Pedir ajuste</button>
            </div>
            <div class="vm-reject-input hidden" data-for="${s.assignment_id}">
              <input type="text" class="vm-reject-feedback" placeholder="Feedback (opcional)" maxlength="200">
              <button class="vm-reject-confirm" data-id="${s.assignment_id}">Confirmar</button>
            </div>`
                : ''
            }
          </div>
        </div>`;
            })
            .join('') +
          '</div>');

    document.getElementById('vmBackBtn')?.addEventListener('click', () => {
      _viewingTaskId = null;
      renderTrackView();
    });

    area.querySelectorAll('.vm-admin-thumb').forEach((img) => {
      img.addEventListener('click', () => openLightbox(img.src));
    });

    area.querySelectorAll('.vm-approve-btn').forEach((btn) => {
      btn.addEventListener('click', () => reviewTask(btn.dataset.id, 'approved'));
    });
    area.querySelectorAll('.vm-reject-btn, .vm-revision-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.classList.contains('vm-revision-btn') ? 'revision' : 'rejected';
        const inputWrap = area.querySelector(`.vm-reject-input[data-for="${btn.dataset.id}"]`);
        if (inputWrap) {
          inputWrap.classList.toggle('hidden');
          inputWrap.dataset.action = status;
          if (!inputWrap.classList.contains('hidden')) inputWrap.querySelector('input')?.focus();
        }
      });
    });
    area.querySelectorAll('.vm-reject-confirm').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.vm-reject-input');
        const feedback = wrap?.querySelector('.vm-reject-feedback')?.value?.trim() || '';
        const status = wrap?.dataset.action || 'rejected';
        reviewTask(btn.dataset.id, status, feedback);
      });
    });
  }

  async function reviewTask(assignmentId, status, feedback) {
    try {
      const { error } = await sb.rpc('admin_review_task_submission', {
        p_assignment_id: assignmentId,
        p_status: status,
        p_feedback: feedback || null
      });
      if (error) throw error;
      const labels = { approved: 'aprovada', rejected: 'rejeitada', revision: 'ajuste solicitado' };
      window._toast?.(`Submissão ${labels[status] || status}!`, 'success');
      await renderTrackView();
    } catch (err) {
      window._toast?.(err?.message || 'Erro ao revisar', 'error');
    }
  }

  // ─── Free-form photos (existing Fase 6) ───
  async function renderFreeView() {
    const area = document.getElementById('vmTabContent');
    if (!area) return;
    area.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">Carregando…</div>';

    try {
      const { data, error } = await sb.rpc('admin_get_vm_queue', { p_status: _freeStatus, p_limit: 50 });
      if (error) throw error;
      _queue = data || [];
    } catch (err) {
      area.innerHTML = `<div style="padding:12px;color:var(--danger)">Erro: ${esc(err?.message || '')}</div>`;
      return;
    }

    const tabs = `<div class="vm-admin-tabs" style="margin-bottom:12px">
      ${['pending', 'approved', 'rejected'].map((s) => `<button class="vm-admin-tab${_freeStatus === s ? ' active' : ''}" data-fs="${s}">${s === 'pending' ? 'Pendentes' : s === 'approved' ? 'Aprovados' : 'Rejeitados'}</button>`).join('')}
    </div>`;

    const list =
      _queue.length === 0
        ? '<div style="padding:16px;text-align:center;color:var(--text-muted);font-style:italic">Nenhuma submissão.</div>'
        : '<div class="vm-admin-list">' +
          _queue
            .map((item) => {
              const nome = item.vendor_apelido || item.vendor_nome || '—';
              const date = new Date(item.created_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              const actions =
                _freeStatus === 'pending'
                  ? `
          <div class="vm-admin-actions">
            <button class="vm-free-approve" data-id="${item.id}"><i class="fa-solid fa-check"></i> Aprovar</button>
            <button class="vm-free-reject" data-id="${item.id}"><i class="fa-solid fa-xmark"></i> Rejeitar</button>
          </div>`
                  : '';
              return `<div class="vm-admin-item">
          <img src="${esc(item.photo_url)}" class="vm-admin-thumb" loading="lazy">
          <div class="vm-admin-info">
            <div class="vm-admin-meta"><strong>${esc(nome)}</strong><span class="vm-admin-date">${date}</span></div>
            ${item.description ? `<div class="vm-admin-desc">${esc(item.description)}</div>` : ''}
            ${item.feedback ? `<div class="vm-admin-feedback"><i class="fa-solid fa-comment"></i> ${esc(item.feedback)}</div>` : ''}
            ${actions}
          </div>
        </div>`;
            })
            .join('') +
          '</div>';

    area.innerHTML = tabs + list;

    area.querySelectorAll('.vm-admin-thumb').forEach((img) => {
      img.addEventListener('click', () => openLightbox(img.src));
    });

    area.querySelectorAll('[data-fs]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _freeStatus = btn.dataset.fs;
        renderFreeView();
      });
    });
    area.querySelectorAll('.vm-free-approve').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const { error } = await sb.rpc('admin_review_vm', { p_submission_id: btn.dataset.id, p_status: 'approved' });
          if (error) throw error;
          window._toast?.('Aprovada!', 'success');
          await renderFreeView();
        } catch (err) {
          window._toast?.(err?.message, 'error');
        }
      });
    });
    area.querySelectorAll('.vm-free-reject').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const feedback = prompt('Motivo da rejeição (opcional):') || '';
        try {
          const { error } = await sb.rpc('admin_review_vm', {
            p_submission_id: btn.dataset.id,
            p_status: 'rejected',
            p_feedback: feedback
          });
          if (error) throw error;
          window._toast?.('Rejeitada!', 'success');
          await renderFreeView();
        } catch (err) {
          window._toast?.(err?.message, 'error');
        }
      });
    });
  }

  // ─── Utils ───
  function resizeImg(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width,
          h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(
          (b) => {
            URL.revokeObjectURL(u);
            b ? resolve(b) : reject(new Error('toBlob failed'));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(u);
        reject(new Error('img load failed'));
      };
      img.src = u;
    });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

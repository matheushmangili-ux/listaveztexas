// ============================================
// minhavez Vendedor — VM Photos + VM Missions (Fase 6 + 6b)
// Free-form VM photos + bidirectional VM tasks with briefing/checklist.
// ============================================

let _sb = null;
let _ctx = null;
let _myVms = [];
let _gallery = [];
let _vmTasks = [];
let _activeVmTab = 'tasks';

// Tamanho máximo do arquivo antes do resize. Sem isso, vendedor podia enviar
// fotos de 50MB+ (câmera raw de celular) que estouravam memória ao criar
// objectURL e pressionavam a quota do Storage bucket.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB — generoso, mas barra abusos
const MAX_UPLOAD_LABEL = '12MB';

const VM_CATEGORIES = [
  { id: 'vitrine', label: 'Vitrine', icon: 'fa-store' },
  { id: 'gondola', label: 'Gôndola', icon: 'fa-table-cells' },
  { id: 'display', label: 'Display', icon: 'fa-tv' },
  { id: 'prateleira', label: 'Prateleira', icon: 'fa-bars-staggered' },
  { id: 'checkout', label: 'Checkout', icon: 'fa-cash-register' },
  { id: 'fachada', label: 'Fachada', icon: 'fa-building' },
  { id: 'outro', label: 'Outro', icon: 'fa-ellipsis' }
];

const STATUS_LABELS = {
  pending: { label: 'Pendente', cls: 'vm-status-pending' },
  in_progress: { label: 'Em execução', cls: 'vm-status-pending' },
  submitted: { label: 'Enviado', cls: 'vm-status-pending' },
  approved: { label: 'Aprovado', cls: 'vm-status-approved' },
  rejected: { label: 'Rejeitado', cls: 'vm-status-rejected' },
  revision: { label: 'Ajuste', cls: 'vm-status-revision' }
};

export async function initVm(sb, ctx) {
  _sb = sb;
  _ctx = ctx;
  bindCard();
  bindSheet();
  await Promise.all([refreshVmTasks(), refreshMyVms()]);
}

export function unmountVm() {
  _sb = null;
  _ctx = null;
  _myVms = [];
  _gallery = [];
  _vmTasks = [];
}

// Força re-load + update de badges. Usado pelo botão refresh do vendor-home.
export async function refreshVm() {
  if (!_sb) return;
  await Promise.all([refreshVmTasks(), refreshMyVms()]);
}

// ─── Data ───
async function refreshVmTasks() {
  try {
    const { data, error } = await _sb.rpc('vendor_get_my_vm_tasks');
    if (error) throw error;
    _vmTasks = data || [];
  } catch (err) {
    console.warn('[vm] tasks refresh falhou:', err);
    _vmTasks = [];
  }
  if (window._vendorCounts) {
    window._vendorCounts.vm = _vmTasks.filter((t) =>
      ['pending', 'in_progress', 'revision'].includes(t.assignment_status)
    ).length;
    window._vendorUpdateBadges?.();
  }
}

async function refreshMyVms() {
  try {
    const { data, error } = await _sb.rpc('vendor_get_my_vms', { p_limit: 20 });
    if (error) throw error;
    _myVms = data || [];
  } catch (err) {
    console.warn('[vm] vms refresh falhou:', err);
    _myVms = [];
  }
}

async function loadGallery() {
  try {
    const { data, error } = await _sb.rpc('get_vm_gallery', { p_limit: 30, p_offset: 0 });
    if (error) throw error;
    _gallery = data || [];
  } catch (err) {
    console.warn('[vm] gallery falhou:', err);
    _gallery = [];
  }
}

// ─── Home card ───
function bindCard() {
  const card = document.getElementById('vmCard');
  if (card) card.addEventListener('click', openSheet);
}

function renderCard() {
  const wrap = document.getElementById('vmCard');
  if (!wrap) return;

  const actionable = _vmTasks.filter((t) =>
    ['pending', 'in_progress', 'revision'].includes(t.assignment_status)
  ).length;
  const freeApproved = _myVms.filter((v) => v.status === 'approved').length;
  const freePending = _myVms.filter((v) => v.status === 'pending').length;

  wrap.classList.remove('hidden');
  const badge = actionable > 0 ? `<span class="vm-card-badge">${actionable}</span>` : '';
  const sub =
    actionable > 0
      ? `${actionable} tarefa${actionable !== 1 ? 's' : ''} pendente${actionable !== 1 ? 's' : ''}`
      : `${freeApproved} foto${freeApproved !== 1 ? 's' : ''} aprovada${freeApproved !== 1 ? 's' : ''}`;

  wrap.innerHTML = `
    <div class="vm-card-inner">
      <div class="vm-card-icon">${badge}<i class="fa-solid fa-camera-retro"></i></div>
      <div class="vm-card-text">
        <strong>VM Missions</strong>
        <span>${sub}</span>
      </div>
      <i class="fa-solid fa-chevron-right vm-card-arrow"></i>
    </div>
  `;
}

// ─── Sheet ───
function bindSheet() {
  document.getElementById('vmOverlay')?.addEventListener('click', closeSheet);
}

window._vendorVmOpen = openSheet;
function openSheet() {
  const overlay = document.getElementById('vmOverlay');
  const sheet = document.getElementById('vmSheet');
  if (!overlay || !sheet) return;
  _activeVmTab = _vmTasks.length > 0 ? 'tasks' : 'mine';
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
  renderSheetBody();
}

function closeSheet() {
  document.getElementById('vmOverlay')?.classList.add('hidden');
  document.getElementById('vmSheet')?.classList.add('hidden');
}

function renderSheetBody() {
  const body = document.getElementById('vmSheetBody');
  if (!body) return;

  const taskBadge = _vmTasks.filter((t) => ['pending', 'in_progress', 'revision'].includes(t.assignment_status)).length;

  body.innerHTML = `
    <div class="vm-tabs">
      <button class="vm-tab${_activeVmTab === 'tasks' ? ' active' : ''}" data-tab="tasks">
        Tarefas${taskBadge > 0 ? ` <span class="vm-tab-badge">${taskBadge}</span>` : ''}
      </button>
      <button class="vm-tab${_activeVmTab === 'mine' ? ' active' : ''}" data-tab="mine">Minhas</button>
      <button class="vm-tab${_activeVmTab === 'gallery' ? ' active' : ''}" data-tab="gallery">Galeria</button>
    </div>
    ${_activeVmTab === 'mine' ? '<button class="vm-new-btn" id="vmNewBtn"><i class="fa-solid fa-camera"></i> Nova foto VM</button>' : ''}
    <div id="vmListArea"></div>
  `;

  body.querySelectorAll('.vm-tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      _activeVmTab = btn.dataset.tab;
      if (_activeVmTab === 'gallery' && _gallery.length === 0) await loadGallery();
      if (_activeVmTab === 'tasks') await refreshVmTasks();
      renderSheetBody();
    });
  });

  document.getElementById('vmNewBtn')?.addEventListener('click', startCapture);

  if (_activeVmTab === 'tasks') renderTasksList();
  else if (_activeVmTab === 'mine') renderMyList();
  else renderGalleryList();
}

// ─── Tasks list ───
function renderTasksList() {
  const area = document.getElementById('vmListArea');
  if (!area) return;

  if (_vmTasks.length === 0) {
    area.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-camera-retro empty-state__icon"></i>
      <div class="empty-state__title">Nenhuma tarefa VM</div>
      <div class="empty-state__prose">Fique de olho — novas tarefas podem chegar a qualquer momento.</div>
    </div>`;
    return;
  }

  area.innerHTML = _vmTasks
    .map((t) => {
      const cat = VM_CATEGORIES.find((c) => c.id === t.category);
      const st = STATUS_LABELS[t.assignment_status] || STATUS_LABELS.pending;
      const isUrgent = t.priority === 'urgente';
      const dueStr = t.due_at ? formatDue(t.due_at) : '';
      const actionable = ['pending', 'in_progress', 'revision'].includes(t.assignment_status);

      return `<div class="vm-task-card${isUrgent ? ' urgent' : ''}${actionable ? '' : ' done'}" data-task="${t.task_id}">
      <div class="vm-task-card-top">
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || t.category)}</span>
        ${isUrgent ? '<span class="vm-priority-badge">URGENTE</span>' : ''}
        <span class="vm-status-badge ${st.cls}">${st.label}</span>
      </div>
      <div class="vm-task-card-title">${esc(t.title)}</div>
      ${t.description ? `<div class="vm-task-card-desc">${esc(t.description)}</div>` : ''}
      <div class="vm-task-card-bottom">
        ${dueStr ? `<span class="vm-due-badge"><i class="fa-regular fa-clock"></i> ${dueStr}</span>` : ''}
        <span class="vm-xp-badge"><i class="fa-solid fa-bolt"></i> ${t.reward_xp} XP</span>
        ${t.ref_count > 0 ? `<span class="vm-ref-badge"><i class="fa-solid fa-images"></i> ${t.ref_count}</span>` : ''}
        ${t.checklist_count > 0 ? `<span class="vm-check-badge"><i class="fa-solid fa-list-check"></i> ${t.checklist_count}</span>` : ''}
      </div>
      ${t.feedback && t.assignment_status === 'revision' ? `<div class="vm-task-feedback"><i class="fa-solid fa-comment-dots"></i> ${esc(t.feedback)}</div>` : ''}
    </div>`;
    })
    .join('');

  area.querySelectorAll('.vm-task-card[data-task]').forEach((card) => {
    card.addEventListener('click', () => openTaskBriefing(card.dataset.task));
  });
}

// ─── Task briefing (fullscreen) ───
async function openTaskBriefing(taskId) {
  const view = document.getElementById('vmTaskView');
  if (!view) return;

  view.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const header = document.getElementById('vmTaskHeader');
  const body = document.getElementById('vmTaskBody');
  header.innerHTML = `<button class="vendor-icon-btn" id="vmTaskClose"><i class="fa-solid fa-xmark"></i></button><span class="vm-task-view-title">Tarefa VM</span><div></div>`;
  body.innerHTML = '<div class="vm-empty">Carregando…</div>';

  document.getElementById('vmTaskClose')?.addEventListener('click', closeTaskView);

  try {
    const { data, error } = await _sb.rpc('vendor_get_task_detail', { p_task_id: taskId });
    if (error) throw error;
    const task = data?.[0];
    if (!task) {
      body.innerHTML = '<div class="vm-empty">Tarefa não encontrada.</div>';
      return;
    }
    renderBriefing(body, task);
  } catch (err) {
    body.innerHTML = `<div class="vm-empty">Erro: ${esc(err?.message || err)}</div>`;
  }
}

function closeTaskView() {
  const view = document.getElementById('vmTaskView');
  if (view) view.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderBriefing(container, task) {
  const cat = VM_CATEGORIES.find((c) => c.id === task.category);
  const refs = task.refs || [];
  const checklist = task.checklist || [];
  const canStart = ['pending', 'revision'].includes(task.assignment_status);
  const isInProgress = task.assignment_status === 'in_progress';
  const isDone = ['submitted', 'approved', 'rejected'].includes(task.assignment_status);

  let html = '';

  // Reference carousel
  if (refs.length > 0) {
    html += `<div class="vm-ref-carousel">${refs
      .map((r) => `<img src="${esc(r.url)}" alt="Referência" class="vm-ref-img" loading="lazy">`)
      .join('')}</div>`;
  }

  // Task info
  html += `
    <div class="vm-briefing-info">
      <h4>${esc(task.title)}</h4>
      ${task.description ? `<p>${esc(task.description)}</p>` : ''}
      <div class="vm-briefing-meta">
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || task.category)}</span>
        ${task.due_at ? `<span class="vm-due-badge"><i class="fa-regular fa-clock"></i> ${formatDue(task.due_at)}</span>` : ''}
        <span class="vm-xp-badge"><i class="fa-solid fa-bolt"></i> ${task.reward_xp} XP</span>
      </div>
    </div>
  `;

  // Feedback (if revision)
  if (task.feedback && task.assignment_status === 'revision') {
    html += `<div class="vm-task-feedback"><i class="fa-solid fa-comment-dots"></i> <strong>Ajuste solicitado:</strong> ${esc(task.feedback)}</div>`;
  }

  // Checklist preview
  if (checklist.length > 0) {
    html +=
      '<div class="vm-checklist-preview"><strong>Checklist:</strong><ul>' +
      checklist.map((c) => `<li>${esc(c.label)}</li>`).join('') +
      '</ul></div>';
  }

  // Action button
  if (canStart) {
    html += `<button class="vendor-btn-primary vm-start-btn" id="vmStartBtn">
      <i class="fa-solid fa-play"></i> Iniciar execução
    </button>`;
  } else if (isInProgress) {
    html += `<button class="vendor-btn-primary vm-start-btn" id="vmExecBtn">
      <i class="fa-solid fa-camera"></i> Continuar execução
    </button>`;
  } else if (isDone) {
    const st = STATUS_LABELS[task.assignment_status] || STATUS_LABELS.submitted;
    html += `<div class="vm-done-badge ${st.cls}">${st.label}</div>`;
  }

  container.innerHTML = html;

  document.getElementById('vmStartBtn')?.addEventListener('click', async () => {
    try {
      const { data: assignId, error } = await _sb.rpc('vendor_start_vm_task', { p_task_id: task.task_id });
      if (error) throw error;
      openExecution(task, assignId || task.assignment_id);
    } catch (err) {
      window._vendorToast?.(err?.message || 'Erro ao iniciar', 'error');
    }
  });

  document.getElementById('vmExecBtn')?.addEventListener('click', () => {
    openExecution(task, task.assignment_id);
  });
}

// ─── Task execution (camera + checklist) ───
function openExecution(task, assignmentId) {
  const body = document.getElementById('vmTaskBody');
  if (!body) return;

  const checklist = task.checklist || [];
  const checkStates = {};
  checklist.forEach((c) => {
    checkStates[c.id] = false;
  });
  const capturedPhotos = [];

  function render() {
    body.innerHTML = `
      <div class="vm-exec-section">
        <strong>Fotos da execução</strong>
        <div class="vm-exec-photos" id="vmExecPhotos">
          ${capturedPhotos
            .map(
              (p, i) => `<div class="vm-exec-photo-wrap">
            <img src="${p.preview}" class="vm-exec-photo">
            <button class="vm-exec-photo-remove" data-idx="${i}"><i class="fa-solid fa-xmark"></i></button>
          </div>`
            )
            .join('')}
          ${capturedPhotos.length < 3 ? '<button class="vm-exec-add-photo" id="vmExecAddPhoto"><i class="fa-solid fa-plus"></i></button>' : ''}
        </div>
      </div>
      ${
        checklist.length > 0
          ? `<div class="vm-exec-section">
        <strong>Checklist</strong>
        <div class="vm-exec-checklist">
          ${checklist
            .map(
              (c) => `<label class="vm-exec-check-item">
            <input type="checkbox" ${checkStates[c.id] ? 'checked' : ''} data-cid="${c.id}">
            <span>${esc(c.label)}</span>
          </label>`
            )
            .join('')}
        </div>
      </div>`
          : ''
      }
      <textarea id="vmExecNote" class="vm-desc-input" placeholder="Observação (opcional)" rows="2" maxlength="300"></textarea>
      <div class="vm-submit-actions">
        <button class="vendor-btn-ghost" id="vmExecCancel">Cancelar</button>
        <button class="vendor-btn-primary" id="vmExecSubmit" ${capturedPhotos.length === 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-paper-plane"></i> Enviar
        </button>
      </div>
    `;

    document.getElementById('vmExecAddPhoto')?.addEventListener('click', () => {
      const input = document.getElementById('vmPhotoInput');
      if (!input) return;
      input.value = '';
      input.onchange = async (ev) => {
        const f = ev.target.files?.[0];
        if (!f || capturedPhotos.length >= 3) return;
        if (f.size > MAX_UPLOAD_BYTES) {
          window._vendorToast?.(`Foto muito grande (máx ${MAX_UPLOAD_LABEL})`, 'error');
          return;
        }
        const preview = URL.createObjectURL(f);
        capturedPhotos.push({ file: f, preview });
        render();
      };
      input.click();
    });

    body.querySelectorAll('.vm-exec-photo-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        URL.revokeObjectURL(capturedPhotos[idx]?.preview);
        capturedPhotos.splice(idx, 1);
        render();
      });
    });

    body.querySelectorAll('.vm-exec-check-item input').forEach((cb) => {
      cb.addEventListener('change', () => {
        checkStates[cb.dataset.cid] = cb.checked;
      });
    });

    document.getElementById('vmExecCancel')?.addEventListener('click', () => {
      capturedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      closeTaskView();
    });

    document
      .getElementById('vmExecSubmit')
      ?.addEventListener('click', () => submitExecution(assignmentId, capturedPhotos, checkStates));
  }

  render();
}

async function submitExecution(assignmentId, photos, checkStates) {
  const submitBtn = document.getElementById('vmExecSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
  }
  const note = document.getElementById('vmExecNote')?.value?.trim() || '';

  try {
    const responses = [];

    // Upload photos. Cada foto já uploadada é marcada em `p.uploaded` pra
    // evitar re-upload em retry (user clicar Enviar de novo após falha
    // parcial). Sem isso, foto subia duplicada no Storage a cada tentativa.
    for (const p of photos) {
      if (p.uploaded) {
        responses.push({ photo_url: p.uploaded.url, photo_path: p.uploaded.path, note });
        continue;
      }
      const blob = await resizeImage(p.file, 800, 0.8);
      const uuid = crypto.randomUUID();
      const path = `${_ctx.tenant_id}/${_ctx.vendedor_id}/${uuid}.jpg`;
      const { error: upErr } = await _sb.storage.from('vm-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: urlData } = _sb.storage.from('vm-photos').getPublicUrl(path);
      const url = urlData?.publicUrl || '';
      p.uploaded = { url, path };
      responses.push({ photo_url: url, photo_path: path, note });
    }

    // Checklist responses
    for (const [itemId, checked] of Object.entries(checkStates)) {
      responses.push({ checklist_item_id: itemId, checked });
    }

    const { error } = await _sb.rpc('vendor_submit_vm_task', {
      p_assignment_id: assignmentId,
      p_responses: responses
    });
    if (error) throw error;

    // Sucesso — revoga todas as previews e zera o array pra prevenir leak
    // e re-submit acidental se o user reabrir a modal antes do close.
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    photos.length = 0;

    window._vendorToast?.('Tarefa enviada! Aguardando revisão.', 'success');
    closeTaskView();
    await refreshVmTasks();
    renderCard();
    renderSheetBody();
  } catch (err) {
    window._vendorToast?.(err?.message || 'Erro ao enviar', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    }
    // Em erro, mantém previews vivas pra retry (revoke só no cancel/close
    // ou no próximo sucesso). Fotos já uploadadas ficam marcadas em
    // `p.uploaded` e não serão re-enviadas.
  }
}

// ─── Free-form VM (existing Fase 6 flow) ───
function renderMyList() {
  const area = document.getElementById('vmListArea');
  if (!area) return;
  if (_myVms.length === 0) {
    area.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-image empty-state__icon"></i>
      <div class="empty-state__title">Nenhuma foto ainda</div>
      <div class="empty-state__prose">Toque em "Nova foto VM" pra começar e ganhar XP.</div>
    </div>`;
    return;
  }
  area.innerHTML =
    '<div class="vm-grid">' +
    _myVms
      .map((v) => {
        const st = STATUS_LABELS[v.status] || STATUS_LABELS.pending;
        const cat = VM_CATEGORIES.find((c) => c.id === v.category);
        return `<div class="vm-grid-item">
      <img src="${esc(v.photo_url)}" alt="VM" class="vm-thumb" loading="lazy">
      <div class="vm-grid-meta">
        <span class="vm-status-badge ${st.cls}">${st.label}</span>
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || v.category)}</span>
      </div>
      ${v.feedback ? `<div class="vm-feedback"><i class="fa-solid fa-comment"></i> ${esc(v.feedback)}</div>` : ''}
    </div>`;
      })
      .join('') +
    '</div>';
}

function renderGalleryList() {
  const area = document.getElementById('vmListArea');
  if (!area) return;
  if (_gallery.length === 0) {
    area.innerHTML = `<div class="empty-state empty-state--compact">
      <i class="fa-solid fa-images empty-state__icon"></i>
      <div class="empty-state__prose">Nenhuma foto aprovada ainda.</div>
    </div>`;
    return;
  }
  area.innerHTML =
    '<div class="vm-grid">' +
    _gallery
      .map((v) => {
        const cat = VM_CATEGORIES.find((c) => c.id === v.category);
        const nome = v.vendor_apelido || v.vendor_nome || '';
        return `<div class="vm-grid-item">
      <img src="${esc(v.photo_url)}" alt="VM" class="vm-thumb" loading="lazy">
      <div class="vm-grid-meta">
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || v.category)}</span>
        <span class="vm-author">${esc(nome)}</span>
      </div>
    </div>`;
      })
      .join('') +
    '</div>';
}

function startCapture() {
  const input = document.getElementById('vmPhotoInput');
  if (!input) return;
  input.value = '';
  input.onchange = onFreeFormSelected;
  input.click();
}

async function onFreeFormSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    window._vendorToast?.(`Foto muito grande (máx ${MAX_UPLOAD_LABEL})`, 'error');
    return;
  }
  const body = document.getElementById('vmSheetBody');
  if (!body) return;

  const previewUrl = URL.createObjectURL(file);
  body.innerHTML = `
    <div class="vm-submit-form">
      <img src="${previewUrl}" alt="Preview" class="vm-preview-img">
      <div class="vm-cat-picker">${VM_CATEGORIES.map((c) => `<button class="vm-cat-pill" data-cat="${c.id}"><i class="fa-solid ${c.icon}"></i> ${c.label}</button>`).join('')}</div>
      <textarea id="vmDesc" class="vm-desc-input" placeholder="Descrição (opcional)" rows="2" maxlength="200"></textarea>
      <div class="vm-submit-actions">
        <button class="vendor-btn-ghost" id="vmCancelBtn"><i class="fa-solid fa-xmark"></i> Cancelar</button>
        <button class="vendor-btn-primary" id="vmSubmitBtn" disabled><i class="fa-solid fa-paper-plane"></i> Enviar</button>
      </div>
    </div>
  `;

  let selectedCat = null;
  body.querySelectorAll('.vm-cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.vm-cat-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCat = btn.dataset.cat;
      document.getElementById('vmSubmitBtn').disabled = false;
    });
  });

  document.getElementById('vmCancelBtn')?.addEventListener('click', () => {
    URL.revokeObjectURL(previewUrl);
    renderSheetBody();
  });

  document.getElementById('vmSubmitBtn')?.addEventListener('click', async () => {
    if (!selectedCat) return;
    const desc = document.getElementById('vmDesc')?.value?.trim() || '';
    const submitBtn = document.getElementById('vmSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando…';
    }
    try {
      const blob = await resizeImage(file, 800, 0.8);
      URL.revokeObjectURL(previewUrl);
      const uuid = crypto.randomUUID();
      const path = `${_ctx.tenant_id}/${_ctx.vendedor_id}/${uuid}.jpg`;
      const { error: upErr } = await _sb.storage
        .from('vm-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = _sb.storage.from('vm-photos').getPublicUrl(path);
      const { error: rpcErr } = await _sb.rpc('vendor_submit_vm', {
        p_photo_url: urlData?.publicUrl,
        p_photo_path: path,
        p_category: selectedCat,
        p_description: desc
      });
      if (rpcErr) throw rpcErr;
      window._vendorToast?.('Foto enviada! Aguardando aprovação.', 'success');
      await refreshMyVms();
      renderSheetBody();
    } catch (err) {
      window._vendorToast?.(err?.message || 'Erro ao enviar foto', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar';
      }
    }
  });
}

// ─── Utils ───
function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
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
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objUrl);
          blob ? resolve(blob) : reject(new Error('Canvas toBlob falhou'));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Falha ao carregar imagem'));
    };
    img.src = objUrl;
  });
}

function formatDue(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diffH = Math.round((d - now) / 3600000);
  if (diffH < 0) return 'Atrasado';
  if (diffH < 24) return `${diffH}h restantes`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} dia${diffD !== 1 ? 's' : ''}`;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================
// minhavez Vendedor — VM Photos (Fase 6)
// Camera capture, client-side resize, upload, gallery.
// ============================================

let _sb = null;
let _ctx = null;
let _myVms = [];
let _gallery = [];
let _activeVmTab = 'mine';

const VM_CATEGORIES = [
  { id: 'vitrine',    label: 'Vitrine',    icon: 'fa-store' },
  { id: 'gondola',    label: 'Gôndola',    icon: 'fa-table-cells' },
  { id: 'display',    label: 'Display',    icon: 'fa-tv' },
  { id: 'prateleira', label: 'Prateleira', icon: 'fa-bars-staggered' },
  { id: 'checkout',   label: 'Checkout',   icon: 'fa-cash-register' },
  { id: 'fachada',    label: 'Fachada',    icon: 'fa-building' },
  { id: 'outro',      label: 'Outro',      icon: 'fa-ellipsis' }
];

const STATUS_LABELS = {
  pending:  { label: 'Pendente',  cls: 'vm-status-pending' },
  approved: { label: 'Aprovado',  cls: 'vm-status-approved' },
  rejected: { label: 'Rejeitado', cls: 'vm-status-rejected' }
};

export async function initVm(sb, ctx) {
  _sb = sb;
  _ctx = ctx;
  bindCard();
  bindSheet();
  await refreshMyVms();
}

export function unmountVm() {
  _sb = null;
  _ctx = null;
  _myVms = [];
  _gallery = [];
}

// ─── Data ───
async function refreshMyVms() {
  try {
    const { data, error } = await _sb.rpc('vendor_get_my_vms', { p_limit: 20 });
    if (error) throw error;
    _myVms = data || [];
  } catch (err) {
    console.warn('[vm] refresh falhou:', err);
    _myVms = [];
  }
  renderCard();
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

  const pending = _myVms.filter(v => v.status === 'pending').length;
  const approved = _myVms.filter(v => v.status === 'approved').length;

  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="vm-card-inner">
      <div class="vm-card-icon"><i class="fa-solid fa-camera-retro"></i></div>
      <div class="vm-card-text">
        <strong>VM Photos</strong>
        <span>${approved} aprovada${approved !== 1 ? 's' : ''}${pending > 0 ? ` · ${pending} pendente${pending !== 1 ? 's' : ''}` : ''}</span>
      </div>
      <i class="fa-solid fa-chevron-right vm-card-arrow"></i>
    </div>
  `;
}

// ─── Sheet ───
function bindSheet() {
  document.getElementById('vmOverlay')?.addEventListener('click', closeSheet);
}

function openSheet() {
  const overlay = document.getElementById('vmOverlay');
  const sheet = document.getElementById('vmSheet');
  if (!overlay || !sheet) return;
  _activeVmTab = 'mine';
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

  body.innerHTML = `
    <div class="vm-tabs">
      <button class="vm-tab${_activeVmTab === 'mine' ? ' active' : ''}" data-tab="mine">Minhas</button>
      <button class="vm-tab${_activeVmTab === 'gallery' ? ' active' : ''}" data-tab="gallery">Galeria</button>
    </div>
    <button class="vm-new-btn" id="vmNewBtn">
      <i class="fa-solid fa-camera"></i> Nova foto VM
    </button>
    <div id="vmListArea"></div>
  `;

  body.querySelectorAll('.vm-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      _activeVmTab = btn.dataset.tab;
      if (_activeVmTab === 'gallery' && _gallery.length === 0) await loadGallery();
      renderSheetBody();
    });
  });

  document.getElementById('vmNewBtn')?.addEventListener('click', startCapture);

  if (_activeVmTab === 'mine') {
    renderMyList();
  } else {
    renderGalleryList();
  }
}

function renderMyList() {
  const area = document.getElementById('vmListArea');
  if (!area) return;
  if (_myVms.length === 0) {
    area.innerHTML = '<div class="vm-empty">Nenhuma foto enviada ainda.<br>Toque em "Nova foto VM" pra começar!</div>';
    return;
  }
  area.innerHTML = '<div class="vm-grid">' + _myVms.map(v => {
    const st = STATUS_LABELS[v.status] || STATUS_LABELS.pending;
    const cat = VM_CATEGORIES.find(c => c.id === v.category);
    return `<div class="vm-grid-item">
      <img src="${esc(v.photo_url)}" alt="VM" class="vm-thumb" loading="lazy">
      <div class="vm-grid-meta">
        <span class="vm-status-badge ${st.cls}">${st.label}</span>
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || v.category)}</span>
      </div>
      ${v.feedback ? `<div class="vm-feedback"><i class="fa-solid fa-comment"></i> ${esc(v.feedback)}</div>` : ''}
    </div>`;
  }).join('') + '</div>';
}

function renderGalleryList() {
  const area = document.getElementById('vmListArea');
  if (!area) return;
  if (_gallery.length === 0) {
    area.innerHTML = '<div class="vm-empty">Nenhuma foto aprovada ainda.</div>';
    return;
  }
  area.innerHTML = '<div class="vm-grid">' + _gallery.map(v => {
    const cat = VM_CATEGORIES.find(c => c.id === v.category);
    const nome = v.vendor_apelido || v.vendor_nome || '';
    return `<div class="vm-grid-item">
      <img src="${esc(v.photo_url)}" alt="VM" class="vm-thumb" loading="lazy">
      <div class="vm-grid-meta">
        <span class="vm-cat-tag"><i class="fa-solid ${cat?.icon || 'fa-image'}"></i> ${esc(cat?.label || v.category)}</span>
        <span class="vm-author">${esc(nome)}</span>
      </div>
    </div>`;
  }).join('') + '</div>';
}

// ─── Camera capture + upload flow ───
function startCapture() {
  const input = document.getElementById('vmPhotoInput');
  if (!input) return;
  input.value = '';
  input.onchange = onFileSelected;
  input.click();
}

async function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const body = document.getElementById('vmSheetBody');
  if (!body) return;

  const previewUrl = URL.createObjectURL(file);
  body.innerHTML = `
    <div class="vm-submit-form">
      <img src="${previewUrl}" alt="Preview" class="vm-preview-img">
      <div class="vm-cat-picker" id="vmCatPicker">
        ${VM_CATEGORIES.map(c => `<button class="vm-cat-pill" data-cat="${c.id}"><i class="fa-solid ${c.icon}"></i> ${c.label}</button>`).join('')}
      </div>
      <textarea id="vmDesc" class="vm-desc-input" placeholder="Descrição (opcional)" rows="2" maxlength="200"></textarea>
      <div class="vm-submit-actions">
        <button class="vendor-btn-ghost" id="vmCancelBtn"><i class="fa-solid fa-xmark"></i> Cancelar</button>
        <button class="vendor-btn-primary" id="vmSubmitBtn" disabled><i class="fa-solid fa-paper-plane"></i> Enviar</button>
      </div>
    </div>
  `;

  let selectedCat = null;
  body.querySelectorAll('.vm-cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.vm-cat-pill').forEach(b => b.classList.remove('active'));
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
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando…'; }

    try {
      const blob = await resizeImage(file, 800, 0.8);
      URL.revokeObjectURL(previewUrl);
      const uuid = crypto.randomUUID();
      const path = `${_ctx.tenant_id}/${_ctx.vendedor_id}/${uuid}.jpg`;
      const { error: upErr } = await _sb.storage.from('vm-photos').upload(path, blob, {
        contentType: 'image/jpeg', upsert: false
      });
      if (upErr) throw upErr;

      const { data: urlData } = _sb.storage.from('vm-photos').getPublicUrl(path);
      const photoUrl = urlData?.publicUrl;
      if (!photoUrl) throw new Error('Não foi possível obter URL pública');

      const { error: rpcErr } = await _sb.rpc('vendor_submit_vm', {
        p_photo_url: photoUrl,
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
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Enviar'; }
    }
  });
}

// ─── Image resize (Canvas API) ───
function resizeImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(objUrl);
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob falhou'));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Falha ao carregar imagem'));
    };
    img.src = objUrl;
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

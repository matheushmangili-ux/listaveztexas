// ============================================
// minhavez Vendedor — Avatar RPG com Cosméticos (Fase 5)
// DiceBear pixel-art + catálogo de cosméticos vinculado a conquistas
// ============================================

let _sb = null;
let _ctx = null;
let _achievements = [];
let _currentConfig = {};
let _editorOpen = false;
let _activeTab = 'skinColor';

// ─── DiceBear URL builder ───
const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/pixel-art/svg';

export function buildAvatarUrl(config, size = 80) {
  if (!config || Object.keys(config).length === 0) return null;
  const p = new URLSearchParams();
  if (config.skinColor) p.set('skinColor', config.skinColor);
  if (config.hair) p.set('hair', config.hair);
  if (config.hairColor) p.set('hairColor', config.hairColor);
  if (config.eyes) p.set('eyes', config.eyes);
  if (config.mouth) p.set('mouth', config.mouth);
  if (config.clothing) p.set('clothing', config.clothing);
  if (config.clothingColor) p.set('clothingColor', config.clothingColor);
  if (config.glasses) { p.set('glasses', config.glasses); p.set('glassesProbability', '100'); }
  if (config.hat) { p.set('hat', config.hat); p.set('hatProbability', '100'); }
  if (config.accessories) { p.set('accessories', config.accessories); p.set('accessoriesProbability', '100'); }
  if (config.beard) { p.set('beard', config.beard); p.set('beardProbability', '100'); }
  p.set('size', String(size));
  return `${DICEBEAR_BASE}?${p}`;
}

// ─── Default config for new vendors ───
const DEFAULT_CONFIG = {
  skinColor: 'f5cfa0',
  hair: 'short04',
  hairColor: '603a14',
  eyes: 'variant01',
  mouth: 'happy01',
  clothing: 'variant01',
  clothingColor: '428bca'
};

// ─── Cosmetic Catalog ───
// requiredAchievement: null = free, string = achievement code needed
const CATEGORIES = [
  { id: 'skinColor', label: 'Pele', icon: 'fa-palette', type: 'color' },
  { id: 'hair', label: 'Cabelo', icon: 'fa-scissors', type: 'variant' },
  { id: 'hairColor', label: 'Cor Cabelo', icon: 'fa-droplet', type: 'color' },
  { id: 'eyes', label: 'Olhos', icon: 'fa-eye', type: 'variant' },
  { id: 'mouth', label: 'Boca', icon: 'fa-face-smile', type: 'variant' },
  { id: 'clothing', label: 'Roupa', icon: 'fa-shirt', type: 'variant' },
  { id: 'clothingColor', label: 'Cor Roupa', icon: 'fa-droplet', type: 'color' },
  { id: 'glasses', label: 'Óculos', icon: 'fa-glasses', type: 'variant', optional: true },
  { id: 'hat', label: 'Chapéu', icon: 'fa-hat-wizard', type: 'variant', optional: true },
  { id: 'accessories', label: 'Acessório', icon: 'fa-gem', type: 'variant', optional: true },
  { id: 'beard', label: 'Barba', icon: 'fa-face-grin-beam', type: 'variant', optional: true }
];

const CATALOG = buildCatalog();

function buildCatalog() {
  const items = [];
  const free = null;

  // ── Pele (all free) ──
  ['ffdbac','f5cfa0','eac393','e0b687','cb9e6e','b68655','a26d3d','8d5524'].forEach(v =>
    items.push({ category: 'skinColor', value: v, label: skinLabel(v), req: free, tier: null })
  );

  // ── Cabelo variants ──
  const hairFree = ['short01','short04','short08','short12','long01','long05','long09','long13'];
  const hairBronze = ['short02','short05','short09','short13','long02','long06','long10','long14'];
  const hairPrata = ['short03','short06','short10','short14','long03','long07','long11','long15'];
  const hairOuro = ['short07','short11','short15','short16','long04','long08','long12','long16'];
  const hairLend = ['short17','short18','short19','short20','short21','short22','short23','short24','long17','long18','long19','long20','long21'];
  addVariants(items, 'hair', hairFree, free, null);
  addVariants(items, 'hair', hairBronze, 'atendimentos_10', 'bronze');
  addVariants(items, 'hair', hairPrata, 'atendimentos_50', 'prata');
  addVariants(items, 'hair', hairOuro, 'atendimentos_200', 'ouro');
  addVariants(items, 'hair', hairLend, 'atendimentos_500', 'lendario');

  // ── Cor do cabelo ──
  const hcFree = ['603a14','83623b','28150a','cab188'];
  const hcBronze = ['a78961','611c17'];
  const hcPrata = ['603015','612616'];
  const hcOuro = ['009bbd','bd1700'];
  const hcLend = ['91cb15'];
  addColors(items, 'hairColor', hcFree, free, null);
  addColors(items, 'hairColor', hcBronze, 'vendas_5', 'bronze');
  addColors(items, 'hairColor', hcPrata, 'vendas_25', 'prata');
  addColors(items, 'hairColor', hcOuro, 'vendas_100', 'ouro');
  addColors(items, 'hairColor', hcLend, 'vendas_300', 'lendario');

  // ── Olhos ──
  const eyesFree = ['variant01','variant02','variant03','variant04'];
  const eyesBronze = ['variant05','variant06','variant07'];
  const eyesPrata = ['variant08','variant09','variant10'];
  const eyesOuro = ['variant11','variant12'];
  addVariants(items, 'eyes', eyesFree, free, null);
  addVariants(items, 'eyes', eyesBronze, 'primeiro_atendimento', 'bronze');
  addVariants(items, 'eyes', eyesPrata, 'xp_5000', 'prata');
  addVariants(items, 'eyes', eyesOuro, 'nivel_15', 'ouro');

  // ── Boca ──
  const mouthFree = ['happy01','happy02','happy03','happy04','happy05','happy06'];
  const mouthBronze = ['happy07','happy08','happy09','sad01','sad02','sad03'];
  const mouthPrata = ['happy10','happy11','happy12','sad04','sad05','sad06'];
  const mouthOuro = ['happy13','sad07','sad08','sad09','sad10'];
  addVariants(items, 'mouth', mouthFree, free, null);
  addVariants(items, 'mouth', mouthBronze, 'primeira_venda', 'bronze');
  addVariants(items, 'mouth', mouthPrata, 'conversao_alta', 'prata');
  addVariants(items, 'mouth', mouthOuro, 'vendas_dia_5', 'ouro');

  // ── Roupa ──
  const clothFree = ['variant01','variant02','variant03','variant04','variant05'];
  const clothBronze = ['variant06','variant07','variant08','variant09','variant10'];
  const clothPrata = ['variant11','variant12','variant13','variant14','variant15'];
  const clothOuro = ['variant16','variant17','variant18','variant19'];
  const clothLend = ['variant20','variant21','variant22','variant23'];
  addVariants(items, 'clothing', clothFree, free, null);
  addVariants(items, 'clothing', clothBronze, 'nivel_3', 'bronze');
  addVariants(items, 'clothing', clothPrata, 'nivel_7', 'prata');
  addVariants(items, 'clothing', clothOuro, 'nivel_15', 'ouro');
  addVariants(items, 'clothing', clothLend, 'nivel_25', 'lendario');

  // ── Cor da roupa ──
  const ccFree = ['428bca','44c585','ffd969','ff6f69','03396c'];
  const ccBronze = ['5bc0de','88d8b0','ffeead'];
  const ccPrata = ['00b159','d11141','ffc425'];
  const ccOuro = ['ae0001'];
  addColors(items, 'clothingColor', ccFree, free, null);
  addColors(items, 'clothingColor', ccBronze, 'missao_1', 'bronze');
  addColors(items, 'clothingColor', ccPrata, 'missoes_10', 'prata');
  addColors(items, 'clothingColor', ccOuro, 'missoes_50', 'ouro');

  // ── Óculos (all locked) ──
  const glassesBronze = ['light01','light02','light03','light04'];
  const glassesPrata = ['dark01','dark02','dark03','dark04'];
  const glassesOuro = ['light05','light06','light07'];
  const glassesLend = ['dark05','dark06','dark07'];
  addVariants(items, 'glasses', glassesBronze, 'atendimentos_10', 'bronze');
  addVariants(items, 'glasses', glassesPrata, 'xp_5000', 'prata');
  addVariants(items, 'glasses', glassesOuro, 'xp_30000', 'ouro');
  addVariants(items, 'glasses', glassesLend, 'xp_100000', 'lendario');

  // ── Chapéu (all locked) ──
  const hatBronze = ['variant01','variant02','variant03'];
  const hatPrata = ['variant04','variant05','variant06'];
  const hatOuro = ['variant07','variant08'];
  const hatLend = ['variant09','variant10'];
  addVariants(items, 'hat', hatBronze, 'missao_1', 'bronze');
  addVariants(items, 'hat', hatPrata, 'missoes_10', 'prata');
  addVariants(items, 'hat', hatOuro, 'missoes_50', 'ouro');
  addVariants(items, 'hat', hatLend, 'missoes_100', 'lendario');

  // ── Acessório (all locked) ──
  addVariants(items, 'accessories', ['variant01'], 'vendas_5', 'bronze');
  addVariants(items, 'accessories', ['variant02'], 'vendas_25', 'prata');
  addVariants(items, 'accessories', ['variant03'], 'vendas_100', 'ouro');
  addVariants(items, 'accessories', ['variant04'], 'vendas_300', 'lendario');

  // ── Barba (all locked) ──
  const beardBronze = ['variant01','variant02'];
  const beardPrata = ['variant03','variant04'];
  const beardOuro = ['variant05','variant06'];
  const beardLend = ['variant07','variant08'];
  addVariants(items, 'beard', beardBronze, 'atendimentos_10', 'bronze');
  addVariants(items, 'beard', beardPrata, 'atendimentos_50', 'prata');
  addVariants(items, 'beard', beardOuro, 'atendimentos_200', 'ouro');
  addVariants(items, 'beard', beardLend, 'atendimentos_500', 'lendario');

  return items;
}

function addVariants(items, category, values, req, tier) {
  values.forEach(v => items.push({ category, value: v, label: variantLabel(v), req, tier }));
}
function addColors(items, category, values, req, tier) {
  values.forEach(v => items.push({ category, value: v, label: v, req, tier }));
}
function variantLabel(v) {
  return v.replace(/^(variant|long|short|happy|sad|dark|light)0?/, (_, p) => {
    const names = { variant: '#', long: 'Longo ', short: 'Curto ', happy: 'Feliz ', sad: 'Triste ', dark: 'Escuro ', light: 'Claro ' };
    return names[p] || '#';
  });
}
function skinLabel(hex) {
  const map = { 'ffdbac': 'Clara', 'f5cfa0': 'Bege', 'eac393': 'Dourada', 'e0b687': 'Mel', 'cb9e6e': 'Canela', 'b68655': 'Morena', 'a26d3d': 'Castanha', '8d5524': 'Escura' };
  return map[hex] || hex;
}

// Achievement code → title (populated from API)
let _achievementTitles = {};

// ─── Public API ───
export async function initAvatar(sb, ctx) {
  _sb = sb;
  _ctx = ctx;
  _currentConfig = (ctx.avatar_config && Object.keys(ctx.avatar_config).length > 0)
    ? { ...ctx.avatar_config }
    : { ...DEFAULT_CONFIG };

  if (!ctx.avatar_config || Object.keys(ctx.avatar_config).length === 0) {
    _ctx.avatar_config = { ..._currentConfig };
  }

  await loadAchievements();
  bindEditor();
  renderHeaderAvatar();
}

export function unmountAvatar() {
  if (_boundOpenEditor) {
    document.getElementById('headerAvatar')?.removeEventListener('click', _boundOpenEditor);
    _boundOpenEditor = null;
  }
  if (_boundClose) {
    document.getElementById('avatarEditorClose')?.removeEventListener('click', _boundClose);
    _boundClose = null;
  }
  if (_boundSave) {
    document.getElementById('avatarEditorSave')?.removeEventListener('click', _boundSave);
    _boundSave = null;
  }
  _sb = null;
  _ctx = null;
  _achievements = [];
  _currentConfig = {};
  _editorOpen = false;
}

// ─── Load achievements for unlock check ───
async function loadAchievements() {
  try {
    const { data, error } = await _sb.rpc('get_my_achievements');
    if (error) throw error;
    _achievements = (data || []).filter(a => a.unlocked);
    _achievementTitles = {};
    (data || []).forEach(a => { _achievementTitles[a.code] = a.title; });
  } catch (err) {
    console.warn('[avatar] load achievements failed:', err);
    _achievements = [];
  }
}

function isUnlocked(req) {
  if (!req) return true;
  return _achievements.some(a => a.code === req);
}

// ─── Header avatar rendering ───
function renderHeaderAvatar() {
  const el = document.getElementById('headerAvatar');
  if (!el) return;
  const url = buildAvatarUrl(_ctx.avatar_config);
  if (url) {
    el.innerHTML = `<img src="${esc(url)}" alt="Avatar">`;
    el.classList.add('has-avatar');
  }
}

// ─── Editor binding ───
let _boundOpenEditor = null;
let _boundClose = null;
let _boundSave = null;

function bindEditor() {
  const el = document.getElementById('headerAvatar');
  if (!el) return;
  _boundOpenEditor = openEditor;
  el.addEventListener('click', _boundOpenEditor);
  window._vendorAvatarOpen = openEditor;
}

function openEditor() {
  if (_editorOpen) return;
  _editorOpen = true;
  _currentConfig = { ...(_ctx.avatar_config || DEFAULT_CONFIG) };
  _activeTab = 'skinColor';

  const editor = document.getElementById('avatarEditor');
  if (!editor) return;
  editor.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  renderEditorPreview();
  renderTabs();
  renderGrid();

  const closeBtn = document.getElementById('avatarEditorClose');
  const saveBtn = document.getElementById('avatarEditorSave');
  if (_boundClose) closeBtn?.removeEventListener('click', _boundClose);
  if (_boundSave) saveBtn?.removeEventListener('click', _boundSave);
  _boundClose = closeEditor;
  _boundSave = saveAvatar;
  closeBtn?.addEventListener('click', _boundClose);
  saveBtn?.addEventListener('click', _boundSave);
}

function closeEditor() {
  _editorOpen = false;
  const editor = document.getElementById('avatarEditor');
  if (editor) editor.classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveAvatar() {
  const saveBtn = document.getElementById('avatarEditorSave');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

  try {
    const { error } = await _sb.rpc('vendor_save_avatar', { p_config: _currentConfig });
    if (error) throw error;
    _ctx.avatar_config = { ..._currentConfig };
    renderHeaderAvatar();
    closeEditor();
    window._vendorToast?.('Avatar salvo!', 'success');
  } catch (err) {
    window._vendorToast?.(err?.message || 'Erro ao salvar avatar', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar'; }
  }
}

// ─── Editor: Preview ───
function renderEditorPreview() {
  const container = document.getElementById('avatarPreview');
  if (!container) return;
  const url = buildAvatarUrl(_currentConfig, 200);
  if (url) {
    container.innerHTML = `<img src="${esc(url)}" alt="Avatar Preview" class="avatar-preview-img">`;
  } else {
    container.innerHTML = '<div class="avatar-preview-placeholder">?</div>';
  }
}

// ─── Editor: Tabs ───
function renderTabs() {
  const container = document.getElementById('avatarTabs');
  if (!container) return;

  container.innerHTML = CATEGORIES.map(cat => {
    const active = cat.id === _activeTab ? ' active' : '';
    const catItems = CATALOG.filter(i => i.category === cat.id);
    const hasUnlocked = catItems.some(i => isUnlocked(i.req));
    const allLocked = !hasUnlocked;
    return `<button class="avatar-tab${active}${allLocked ? ' all-locked' : ''}" data-cat="${cat.id}">
      <i class="fa-solid ${cat.icon}"></i>
      <span>${cat.label}</span>
    </button>`;
  }).join('');

  container.querySelectorAll('.avatar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.cat;
      renderTabs();
      renderGrid();
    });
  });
}

// ─── Editor: Grid ───
function renderGrid() {
  const container = document.getElementById('avatarGrid');
  if (!container) return;

  const catDef = CATEGORIES.find(c => c.id === _activeTab);
  const items = CATALOG.filter(i => i.category === _activeTab);
  const isColor = catDef?.type === 'color';
  const isOptional = catDef?.optional;

  let html = '';

  if (isOptional) {
    const isNone = !_currentConfig[_activeTab];
    html += `<button class="avatar-item avatar-item-none${isNone ? ' selected' : ''}" data-value="">
      <i class="fa-solid fa-ban"></i>
      <span class="avatar-item-label">Nenhum</span>
    </button>`;
  }

  items.forEach(item => {
    const unlocked = isUnlocked(item.req);
    const selected = _currentConfig[_activeTab] === item.value;
    const tierClass = item.tier ? ` tier-${item.tier}` : '';

    if (isColor) {
      html += `<button class="avatar-item avatar-item-color${selected ? ' selected' : ''}${!unlocked ? ' locked' : ''}${tierClass}"
        data-value="${item.value}" ${!unlocked ? 'disabled' : ''}>
        <div class="avatar-color-swatch" style="background:#${item.value}"></div>
        ${!unlocked ? `<div class="avatar-lock"><i class="fa-solid fa-lock"></i></div>` : ''}
        ${!unlocked && item.req ? `<div class="avatar-lock-hint">${esc(_achievementTitles[item.req] || item.req)}</div>` : ''}
      </button>`;
    } else {
      const previewUrl = buildItemPreviewUrl(_activeTab, item.value);
      html += `<button class="avatar-item${selected ? ' selected' : ''}${!unlocked ? ' locked' : ''}${tierClass}"
        data-value="${item.value}" ${!unlocked ? 'disabled' : ''}>
        <img src="${esc(previewUrl)}" alt="${esc(item.label)}" class="avatar-item-preview" loading="lazy">
        <span class="avatar-item-label">${esc(item.label)}</span>
        ${!unlocked ? `<div class="avatar-lock"><i class="fa-solid fa-lock"></i></div>` : ''}
        ${!unlocked && item.req ? `<div class="avatar-lock-hint">${esc(_achievementTitles[item.req] || item.req)}</div>` : ''}
      </button>`;
    }
  });

  container.innerHTML = html;

  container.querySelectorAll('.avatar-item:not(.locked)').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (val === '') {
        delete _currentConfig[_activeTab];
      } else {
        _currentConfig[_activeTab] = val;
      }
      renderEditorPreview();
      renderGrid();
    });
  });
}

function buildItemPreviewUrl(category, value) {
  const previewConfig = { ...DEFAULT_CONFIG };
  previewConfig[category] = value;
  if (category === 'glasses') { previewConfig.glasses = value; }
  if (category === 'hat') { previewConfig.hat = value; }
  if (category === 'accessories') { previewConfig.accessories = value; }
  if (category === 'beard') { previewConfig.beard = value; }
  return buildAvatarUrl(previewConfig, 64) || '';
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

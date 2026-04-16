// ============================================
// MinhaVez — Ruptura Picker (v2)
// Cascata tipo → marca → tamanho → cor como chips.
// Fallback: se tenant não tem catálogo, expõe input de texto livre (legado).
// Usado dentro do outcome sheet do tablet quando motivo=ruptura.
// ============================================

import { escapeHtml } from '/js/utils.js';

let _catalog = null; // { tipos, grades, marcas, cores } cached
let _loading = null;
let _selection = { tipo_id: null, marca_id: null, cor_id: null, tamanho: null, produto_text: null };
let _showAllMarcas = false;

export async function loadCatalog(sb) {
  if (_catalog) return _catalog;
  if (_loading) return _loading;
  _loading = (async () => {
    const [tipos, grades, marcas, cores] = await Promise.all([
      sb.from('ruptura_tipos').select('id,nome,ordem').eq('ativo', true).order('ordem'),
      sb.from('ruptura_tipo_grades').select('id,tipo_id,tamanho,ordem').order('ordem'),
      sb.from('ruptura_marcas').select('id,nome,destaque,ordem').eq('ativo', true).order('ordem').order('nome'),
      sb.from('ruptura_cores').select('id,nome,hex,ordem').eq('ativo', true).order('ordem')
    ]);
    _catalog = {
      tipos: tipos.data || [],
      grades: grades.data || [],
      marcas: marcas.data || [],
      cores: cores.data || []
    };
    return _catalog;
  })();
  return _loading;
}

export function hasCatalog() {
  return !!(_catalog && _catalog.tipos.length > 0);
}

export function resetSelection() {
  _selection = { tipo_id: null, marca_id: null, cor_id: null, tamanho: null, produto_text: null };
  _showAllMarcas = false;
}

export function getSelection() {
  return { ..._selection };
}

// ─── Rendering ───────────────────────────────────────────────

function chipHtml(id, label, selected, extraStyle = '') {
  return `<button type="button" class="rp-chip ${selected ? 'active' : ''}" data-id="${id}" style="${extraStyle}">${escapeHtml(label)}</button>`;
}

function renderTipos(container) {
  container.innerHTML = _catalog.tipos.map((t) => chipHtml(t.id, t.nome, _selection.tipo_id === t.id)).join('');
}

function renderMarcas(container) {
  const destaque = _catalog.marcas.filter((m) => m.destaque);
  const resto = _catalog.marcas.filter((m) => !m.destaque);
  const list = _showAllMarcas ? _catalog.marcas : destaque;
  const chips = list.map((m) => chipHtml(m.id, m.nome, _selection.marca_id === m.id)).join('');
  const toggle =
    !_showAllMarcas && resto.length
      ? `<button type="button" class="rp-chip rp-chip--ghost" data-more="1">+ ${resto.length} marcas</button>`
      : '';
  container.innerHTML = chips + toggle;
}

function renderTamanhos(section, container) {
  if (!_selection.tipo_id) {
    section.style.display = 'none';
    return;
  }
  const grade = _catalog.grades.filter((g) => g.tipo_id === _selection.tipo_id);
  if (!grade.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  container.innerHTML = grade.map((g) => chipHtml(g.tamanho, g.tamanho, _selection.tamanho === g.tamanho)).join('');
}

function renderCores(container) {
  container.innerHTML = _catalog.cores
    .map((c) => {
      const dot = c.hex
        ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.hex};border:1px solid rgba(255,255,255,.2);margin-right:6px;vertical-align:middle"></span>`
        : '';
      return `<button type="button" class="rp-chip ${_selection.cor_id === c.id ? 'active' : ''}" data-id="${c.id}">${dot}${escapeHtml(c.nome)}</button>`;
    })
    .join('');
}

// ─── Main mount ───────────────────────────────────────────────

/**
 * Mount the picker inside the given container. Assumes hasCatalog() is true.
 * Must be called every time the picker opens (rebuilds from current _selection).
 */
export function mountPicker(root) {
  root.innerHTML = `
    <div class="rp-section">
      <div class="rp-label">Tipo</div>
      <div class="rp-chips" id="rpTipos"></div>
    </div>
    <div class="rp-section">
      <div class="rp-label">Marca <span class="rp-optional">(opcional)</span></div>
      <div class="rp-chips" id="rpMarcas"></div>
    </div>
    <div class="rp-section" id="rpTamanhoSection" style="display:none">
      <div class="rp-label">Tamanho <span class="rp-optional">(opcional)</span></div>
      <div class="rp-chips" id="rpTamanhos"></div>
    </div>
    <details class="rp-color-details">
      <summary class="rp-color-summary">+ Cor <span class="rp-optional">(opcional)</span></summary>
      <div class="rp-chips rp-chips--wrap" id="rpCores" style="margin-top:8px"></div>
    </details>
  `;
  const tiposEl = root.querySelector('#rpTipos');
  const marcasEl = root.querySelector('#rpMarcas');
  const tamanhoSection = root.querySelector('#rpTamanhoSection');
  const tamanhosEl = root.querySelector('#rpTamanhos');
  const coresEl = root.querySelector('#rpCores');

  renderTipos(tiposEl);
  renderMarcas(marcasEl);
  renderTamanhos(tamanhoSection, tamanhosEl);
  renderCores(coresEl);

  tiposEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    _selection.tipo_id = _selection.tipo_id === id ? null : id;
    if (!_selection.tipo_id) _selection.tamanho = null;
    renderTipos(tiposEl);
    renderTamanhos(tamanhoSection, tamanhosEl);
  });

  marcasEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) {
      _showAllMarcas = true;
      renderMarcas(marcasEl);
      return;
    }
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    _selection.marca_id = _selection.marca_id === id ? null : id;
    renderMarcas(marcasEl);
  });

  tamanhosEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const val = btn.dataset.id;
    _selection.tamanho = _selection.tamanho === val ? null : val;
    renderTamanhos(tamanhoSection, tamanhosEl);
  });

  coresEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    _selection.cor_id = _selection.cor_id === id ? null : id;
    renderCores(coresEl);
  });
}

/**
 * Returns display text equivalent of current selection (for historical produto_ruptura TEXT backward compat).
 * Ex: "BOTA ARIAT 42 MARROM"
 */
export function selectionToText() {
  if (!_catalog || !_selection.tipo_id) return null;
  const tipo = _catalog.tipos.find((t) => t.id === _selection.tipo_id);
  const marca = _catalog.marcas.find((m) => m.id === _selection.marca_id);
  const cor = _catalog.cores.find((c) => c.id === _selection.cor_id);
  return [tipo?.nome, marca?.nome, _selection.tamanho, cor?.nome].filter(Boolean).join(' ');
}

// ============================================
// MinhaVez — Turno Management
// Open/close turno, check-in, turno summary
// ============================================

import { toast, initials, escapeHtml } from '/js/utils.js';

let _ctx = null;

/**
 * Initialize turno module with shared dependencies.
 * @param {object} ctx - Context with state accessors and helpers
 */
export function initTurno(ctx) {
  _ctx = ctx;

  // Expose to window for onclick handlers in HTML
  window.toggleTurno = toggleTurno;
  window.closeTurnoSummary = closeTurnoSummary;
  window.confirmCloseTurno = confirmCloseTurno;
  window.closeCheckin = closeCheckin;
  window.confirmCheckin = confirmCheckin;
}

// ─── Turno Switch ───

export function updateTurnoSwitch(isOn) {
  const sw = document.getElementById('turnoSwitch');
  const label = document.getElementById('turnoSwitchLabel');
  const icon = document.getElementById('turnoIcon');
  if (sw) sw.classList.toggle('on', isOn);
  if (label) label.textContent = isOn ? 'Encerrar' : 'Iniciar';
  if (icon) icon.className = isOn ? 'fa-solid fa-stop' : 'fa-solid fa-play';
}

// ─── Toggle turno (open or show summary to close) ───

async function toggleTurno() {
  _ctx.markLocal();
  if (_ctx.currentTurno) {
    const activeCount = _ctx.activeAtendimentos.length;
    if (activeCount > 0) {
      toast(`${activeCount} atendimento(s) ativo(s) serão finalizados automaticamente`, 'warning', 3000);
    }
    openTurnoSummary();
    return;
  } else {
    openCheckin();
  }
}

// ─── Turno Summary (resumo ao fechar) ───

async function openTurnoSummary() {
  if (!_ctx.currentTurno) return;
  const content = document.getElementById('turnoSummaryContent');
  content.innerHTML = '<div style="text-align:center;padding:16px"><div class="spinner"></div></div>';
  document.getElementById('turnoSummaryOverlay').classList.add('open');
  document.getElementById('turnoSummarySheet').classList.add('open');
  try {
    const turnoStart = _ctx.currentTurno.abertura || _ctx.currentTurno.created_at;
    const { data: stats } = await _ctx.sb.rpc('get_conversion_stats', { p_inicio: turnoStart, p_fim: new Date().toISOString() });
    const s = (Array.isArray(stats) ? stats[0] : stats) || { total_atendimentos: 0, total_vendas: 0, total_nao_convertido: 0, taxa_conversao: 0 };
    // Tempo médio
    const { data: atends } = await _ctx.sb.from('atendimentos').select('inicio, fim').eq('turno_id', _ctx.currentTurno.id).neq('resultado', 'em_andamento').not('fim', 'is', null);
    let tempoMedio = 0;
    if (atends && atends.length > 0) {
      const totalSec = atends.reduce((sum, a) => sum + (new Date(a.fim) - new Date(a.inicio)) / 1000, 0);
      tempoMedio = Math.round(totalSec / atends.length / 60);
    }
    // Top vendedor
    const { data: ranking } = await _ctx.sb.from('atendimentos').select('vendedor_id, resultado, vendedores(nome, apelido)').eq('turno_id', _ctx.currentTurno.id).eq('resultado', 'venda');
    let topVendedor = null;
    if (ranking && ranking.length > 0) {
      const countMap = new Map();
      ranking.forEach(r => {
        const vid = r.vendedor_id;
        if (!countMap.has(vid)) countMap.set(vid, { nome: r.vendedores?.apelido || r.vendedores?.nome || '?', vendas: 0 });
        countMap.get(vid).vendas++;
      });
      topVendedor = [...countMap.values()].sort((a, b) => b.vendas - a.vendas)[0];
    }
    const inQueueCount = _ctx.vendedores.filter(v => v.status === 'disponivel' && v.posicao_fila != null).length;
    // Conversão inclui vendas + trocas com valor (mesma fórmula do dashboard)
    const { data: trocasData } = await _ctx.sb.from('atendimentos').select('valor_venda').eq('turno_id', _ctx.currentTurno.id).eq('resultado', 'troca');
    const trocasComValor = (trocasData || []).filter(t => t.valor_venda && t.valor_venda > 0).length;
    const totalReal = s.total_atendimentos || 0;
    const conv = totalReal > 0 ? Math.round(((s.total_vendas || 0) + trocasComValor) / totalReal * 100) : 0;
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--bg-surface);border-radius:10px;padding:14px;text-align:center">
          <div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:var(--text-primary)">${s.total_atendimentos}</div>
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Atendimentos</div>
        </div>
        <div style="background:var(--bg-surface);border-radius:10px;padding:14px;text-align:center">
          <div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:var(--success)">${s.total_vendas || 0}</div>
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Vendas</div>
        </div>
        <div style="background:var(--bg-surface);border-radius:10px;padding:14px;text-align:center">
          <div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:${conv >= 50 ? 'var(--success)' : conv >= 30 ? 'var(--warning)' : 'var(--accent)'}">${conv}%</div>
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Conversão</div>
        </div>
        <div style="background:var(--bg-surface);border-radius:10px;padding:14px;text-align:center">
          <div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:var(--text-primary)">${tempoMedio}min</div>
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Tempo Médio</div>
        </div>
      </div>
      ${topVendedor ? `<div style="background:rgba(251,191,36,.08);border-radius:10px;padding:12px;text-align:center;margin-bottom:12px">
        <span style="font-size:18px;margin-right:6px">🏆</span>
        <span style="font-weight:700;font-size:14px">${escapeHtml(topVendedor.nome)}</span>
        <span style="font-family:var(--font-mono);font-size:13px;color:var(--success);margin-left:6px">${topVendedor.vendas} venda${topVendedor.vendas > 1 ? 's' : ''}</span>
      </div>` : ''}
      ${inQueueCount > 0 ? `<div style="background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.2);border-radius:10px;padding:10px;text-align:center;font-size:13px;color:var(--warning);font-weight:600">
        <i class="fa-solid fa-triangle-exclamation" style="margin-right:4px"></i>${inQueueCount} vendedor${inQueueCount > 1 ? 'es' : ''} na fila ser${inQueueCount > 1 ? 'ão' : 'á'} removido${inQueueCount > 1 ? 's' : ''}
      </div>` : ''}
    `;
  } catch (e) {
    content.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px">Erro ao carregar resumo</div>';
  }
}

function closeTurnoSummary() {
  document.getElementById('turnoSummaryOverlay').classList.remove('open');
  document.getElementById('turnoSummarySheet').classList.remove('open');
}

async function confirmCloseTurno() {
  const btn = document.getElementById('btnConfirmCloseTurno');
  const resetBtn = () => { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-power-off" style="margin-right:4px"></i>Encerrar Turno'; } };
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Encerrando...'; }
  try {
    _ctx.markLocal();
    const { data, error } = await _ctx.sb.rpc('fechar_turno_seguro', { p_turno_id: _ctx.currentTurno.id });
    if (error) { toast('Erro ao fechar turno: ' + (error.message || ''), 'error'); resetBtn(); return; }
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (result.atendimentos_finalizados > 0) {
      toast(result.atendimentos_finalizados + ' atendimento(s) finalizado(s) automaticamente', 'warning', 3000);
    }
    _ctx.logPosition(null, 'turno', 'Turno encerrado');
    _ctx.currentTurno = null;
    _ctx.activeAtendimentos = [];
    _ctx.pauseStartTimes.clear();
    _ctx.queueEntryTimes.clear();
    _ctx.renderActiveAtendimentos();
    updateTurnoSwitch(false);
    closeTurnoSummary();
    toast('Turno encerrado', 'info');
    await _ctx.loadVendedores();
  } catch (e) {
    toast('Erro inesperado ao fechar turno', 'error');
    console.error('confirmCloseTurno:', e);
  } finally {
    resetBtn();
  }
}

// ─── Check-in de abertura ───

function openCheckin() {
  const allV = _ctx.vendedores.filter(v => (v.setor || 'loja') === _ctx.currentSetor);
  const list = document.getElementById('checkinList');
  list.innerHTML = allV.map(v => {
    const ini = initials(v.apelido || v.nome);
    const nome = v.apelido || v.nome;
    return `<label class="checkin-item" data-id="${v.id}">
      <div style="display:flex;align-items:center;gap:12px;flex:1">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-weight:700;font-size:12px;color:var(--text-secondary);flex-shrink:0">${ini}</div>
        <span style="font-weight:600;font-size:14px">${escapeHtml(nome)}</span>
      </div>
      <input type="checkbox" class="checkin-toggle" value="${v.id}" style="display:none">
      <div class="checkin-switch">
        <div class="checkin-switch-thumb"></div>
      </div>
    </label>`;
  }).join('');

  // Toggle visual (event delegation no container)
  list.onclick = (e) => {
    const item = e.target.closest('.checkin-item');
    if (!item) return;
    const cb = item.querySelector('.checkin-toggle');
    cb.checked = !cb.checked;
    item.classList.toggle('checked', cb.checked);
  };

  document.getElementById('checkinOverlay').classList.add('open');
  document.getElementById('checkinSheet').classList.add('open');
}

function closeCheckin() {
  document.getElementById('checkinOverlay').classList.remove('open');
  document.getElementById('checkinSheet').classList.remove('open');
}

async function confirmCheckin() {
  const checked = [...document.querySelectorAll('.checkin-toggle:checked')].map(cb => cb.value);
  if (checked.length === 0) { toast('Selecione pelo menos um vendedor', 'warning'); return; }

  const btn = document.getElementById('btnCheckin');
  const resetBtn = () => { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check" style="margin-right:4px"></i>Iniciar Turno'; };
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Abrindo...';

  try {
    const { data, error } = await _ctx.sb.from('turnos').insert({ data: new Date().toISOString().split('T')[0], tenant_id: _ctx.tenantId }).select().single();
    if (error) { toast('Erro ao abrir turno', 'error'); resetBtn(); return; }
    _ctx.currentTurno = data;

    _ctx.markLocal();
    const { error: errFila } = await _ctx.sb.rpc('reordenar_fila', { p_ids: checked });
    if (errFila) { toast('Erro ao montar fila', 'error'); resetBtn(); return; }

    updateTurnoSwitch(true);
    closeCheckin();
    await _ctx.loadVendedores();
    toast(`Turno aberto com ${checked.length} vendedor${checked.length > 1 ? 'es' : ''}!`, 'success');
  } catch (e) {
    toast('Erro inesperado ao abrir turno', 'error');
    console.error('confirmCheckin:', e);
  } finally {
    resetBtn();
  }
}

// ─── Check for existing open turno ───

export async function checkExistingTurno() {
  const today = new Date().toISOString().split('T')[0];
  let tq = _ctx.sb.from('turnos').select('*').eq('data', today).is('fechamento', null);
  if (_ctx.tenantId) tq = tq.eq('tenant_id', _ctx.tenantId);
  const { data } = await tq.order('abertura', { ascending: false }).limit(1);
  if (data && data.length > 0) {
    _ctx.currentTurno = data[0];
    updateTurnoSwitch(true);
  }
}

// ============================================
// MinhaVez — Dashboard Cards (listas DOM, sem ApexCharts)
// ============================================
// B4-lite do design-audit: os cards de LISTA que crescem junto com as features
// (Demanda Perdida, Leads Perdidos, % canal informado) moram aqui — separados
// do motor de charts. Pausas/Rupturas ficam no dashboard-charts.js de propósito:
// dependem de BRAND_PALETTE/formatTempo de lá (mover criaria ciclo de import).
// Consumido via re-export pelo dashboard-charts.js — dashboard-init.js não muda.

import { escapeHtml } from '/js/utils.js';

let _ctx = null;

export function initDashboardCards(ctx) {
  _ctx = ctx;
}

// ─── Demanda perdida (P1-A) ───
// "O que os clientes pediram e não fechamos" — produto × motivo × quantidade.
// Lê get_demand_report (COALESCE produto_desejado, produto_ruptura). Card só
// existe em dashboard-operacional.html; esconde se não houver dados.
const DEMAND_MOTIVO_LABELS = {
  preco: 'Preço',
  ruptura: 'Ruptura',
  indecisao: 'Indecisão',
  so_olhando: 'Só olhando',
  outro: 'Outro'
};

let _demandData = [];

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export async function loadDemandReport(range) {
  const sb = _ctx.sb;
  const card = document.getElementById('demandCard');
  const list = document.getElementById('demandList');
  const counter = document.getElementById('demandCount');
  if (!card || !list) return;

  const { data, error } = await sb.rpc('get_demand_report', {
    p_inicio: range.start,
    p_fim: range.end,
    p_limit: 15
  });
  if (error || !data || data.length === 0) {
    card.style.display = 'none';
    _demandData = [];
    return;
  }
  card.style.display = '';
  _demandData = data;
  const totalPedidos = data.reduce((acc, r) => acc + Number(r.total), 0);
  const totalValor = data.reduce((acc, r) => acc + Number(r.valor_estimado || 0), 0);
  if (counter) {
    counter.textContent =
      totalValor > 0
        ? `${totalPedidos} ${totalPedidos === 1 ? 'PEDIDO' : 'PEDIDOS'} · ~${fmtBRL(totalValor)} PERDIDO`
        : `${totalPedidos} ${totalPedidos === 1 ? 'PEDIDO' : 'PEDIDOS'}`;
  }

  list.innerHTML = data
    .map((r) => {
      const motivoLabel = DEMAND_MOTIVO_LABELS[r.motivo] || r.motivo || '—';
      const noun = Number(r.total) === 1 ? 'vez' : 'vezes';
      const valor = Number(r.valor_estimado || 0);
      const tot = Number(r.total);
      const rec = Number(r.recentes || 0);
      // "↑ subindo": maioria dos pedidos na 2ª metade do período (momentum →
      // sinal de compra). Threshold evita ruído em amostra pequena.
      const rising = tot >= 4 && rec >= 2 && rec * 2 > tot;
      const trendBadge = rising
        ? ` <span class="item-trend"><i class="fa-solid fa-arrow-trend-up"></i> subindo</span>`
        : '';
      // R$ é o headline (escala da perda); qtd vira subtexto. Sem valor (ticket
      // mediano 0), cai no badge de contagem simples.
      const right =
        valor > 0
          ? `<div class="item-end">
               <div class="item-end-value">${fmtBRL(valor)}</div>
               <div class="item-end-sub">${r.total} ${noun}</div>
             </div>`
          : `<div class="rupture-count">${r.total}</div>`;
      return `<div class="rupture-item">
        <div class="item-main">
          <div class="item-title">${escapeHtml(r.produto)}</div>
          <div class="item-meta">${escapeHtml(motivoLabel)}${trendBadge}</div>
        </div>
        ${right}
      </div>`;
    })
    .join('');
}

// Export CSV da demanda perdida. Separador ';' + BOM UTF-8 → Excel BR abre com acento certo.
window._dashDemandExport = function () {
  if (!_demandData || _demandData.length === 0) return;
  const head = ['Produto', 'Motivo', 'Pedidos', 'Recentes (2a metade)', 'Valor estimado perdido (R$)'];
  const rows = _demandData.map((r) => [
    r.produto,
    DEMAND_MOTIVO_LABELS[r.motivo] || r.motivo || '',
    r.total,
    r.recentes || 0,
    Math.round(Number(r.valor_estimado || 0))
  ]);
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [head, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'demanda-perdida.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ─── Leads Perdidos (F1: recuperação) ───
// Lê get_lost_leads (nao_convertido + contato_autorizado capturados na F0).
// Card só existe no operacional; esconde se vazio. WhatsApp 1-toque + marcar
// recuperado (F2-A) por item. _leadsRange guarda o período pra recarregar.
let _leadsData = [];
let _leadsRange = null;

const fmtTelBR = (d) => {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return d || '';
};

export async function loadLostLeads(range) {
  const sb = _ctx.sb;
  const card = document.getElementById('leadsCard');
  const list = document.getElementById('leadsList');
  const counter = document.getElementById('leadsCount');
  if (!card || !list) return;
  _leadsRange = range;

  const { data, error } = await sb.rpc('get_lost_leads', {
    p_inicio: range.start,
    p_fim: range.end,
    p_limit: 50
  });
  if (error || !data || data.length === 0) {
    card.style.display = 'none';
    _leadsData = [];
    return;
  }
  card.style.display = '';
  _leadsData = data;
  const recuperados = data.filter((r) => r.recuperado).length;
  const pendentes = data.length - recuperados;
  if (counter) {
    counter.textContent =
      `${pendentes} PRA RECUPERAR` +
      (recuperados > 0 ? ` · ${recuperados} RECUPERADO${recuperados === 1 ? '' : 'S'}` : '');
  }

  list.innerHTML = data
    .map((r, i) => {
      const motivoLabel = DEMAND_MOTIVO_LABELS[r.motivo] || r.motivo || '—';
      const prod = r.produto ? escapeHtml(r.produto) : '<span style="opacity:.55">sem produto</span>';
      const quando = new Date(r.quando).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const nome = escapeHtml(r.cliente_nome || 'Cliente');
      const actions = r.recuperado
        ? `<button class="lead-check-btn is-done" type="button" onclick="window._dashLeadMarkRecuperado(${i}, false)" title="Voltar pra pendente" aria-label="Desfazer recuperado de ${nome}">
            <i class="fa-solid fa-check" aria-hidden="true"></i>
          </button>`
        : `<button class="lead-wa-btn" type="button" onclick="window._dashLeadWhatsapp(${i})" title="Chamar no WhatsApp" aria-label="Chamar ${nome} no WhatsApp">
            <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
          </button>
          <button class="lead-check-btn" type="button" onclick="window._dashLeadMarkRecuperado(${i}, true)" title="Marcar como recuperado" aria-label="Marcar ${nome} como recuperado">
            <i class="fa-solid fa-check" aria-hidden="true"></i>
          </button>`;
      return `<div class="rupture-item${r.recuperado ? ' is-recovered' : ''}">
        <div class="item-main">
          <div class="item-title">${nome}</div>
          <div class="item-sub">${prod} · ${escapeHtml(motivoLabel)}</div>
          <div class="item-meta">${escapeHtml(fmtTelBR(r.cliente_telefone))} · ${escapeHtml(r.vendedor || '—')} · ${quando}</div>
        </div>
        <div class="lead-actions">${actions}</div>
      </div>`;
    })
    .join('');
}

// Abre o WhatsApp com mensagem pronta de recuperação. Telefone guardado só com
// dígitos (DDD+número) na F0 → prefixa 55 se não vier com DDI.
window._dashLeadWhatsapp = function (i) {
  const r = _leadsData[i];
  if (!r) return;
  const tel = String(r.cliente_telefone || '').replace(/\D/g, '');
  if (!tel) return;
  const nome = (r.cliente_nome || '').trim().split(/\s+/)[0] || '';
  const prod = r.produto ? ` procurando ${r.produto}` : '';
  const msg = `Oi ${nome}! 👋 Vi que você passou aqui na loja${prod}. Deu tudo certo na sua busca ou posso te ajudar a encontrar?`;
  const fone = tel.length >= 12 ? tel : '55' + tel;
  window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};

// Marca/desmarca o lead como recuperado e recarrega a lista (pendentes primeiro).
window._dashLeadMarkRecuperado = async function (i, recuperado) {
  const r = _leadsData[i];
  if (!r || !r.atend_id) return;
  try {
    const { error } = await _ctx.sb.rpc('mark_lead_recuperado', {
      p_atend_id: r.atend_id,
      p_recuperado: !!recuperado
    });
    if (error) throw error;
    if (_leadsRange) await loadLostLeads(_leadsRange);
  } catch (e) {
    console.error('[leads] mark recuperado falhou:', e);
  }
};

// % de atendimentos COM canal informado (métrica do teste "vendor-only": com o
// tablet fora, o canal vira auto-report do vendedor — isto mede se o dado segura).
// Fonte própria porque get_canal_stats só conta quem TEM canal. Cor por faixa.
export async function loadCanalFillRate(range) {
  const box = document.getElementById('canalFillRate');
  if (!box) return;
  const { data, error } = await _ctx.sb.rpc('get_canal_fill_rate', {
    p_inicio: range.start,
    p_fim: range.end
  });
  const row = Array.isArray(data) ? data[0] : data;
  const total = Number(row?.total || 0);
  if (error || total === 0) {
    box.style.display = 'none';
    return;
  }
  const com = Number(row?.com_canal || 0);
  const pct = Math.round((com / total) * 100);
  box.style.color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
  box.style.display = '';
  box.innerHTML =
    `<i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> <strong>${pct}%</strong> dos atendimentos com canal informado ` +
    `<span style="opacity:.6;font-weight:400">(${com}/${total})</span>`;
}

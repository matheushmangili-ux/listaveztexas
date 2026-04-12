// ============================================
// minhavez Dashboard — IA Assist (Fase 7)
// Resumo do turno, sugestão de missões, previsão de fluxo.
// ============================================

(function () {
  let sb = null;
  let _activeTab = 'summary';

  window._dashAiOpen = async function () {
    sb = window._supabase;
    if (!sb) return;
    document.getElementById('aiModal')?.classList.add('visible');
    renderModal();
  };

  window._dashAiClose = function () {
    document.getElementById('aiModal')?.classList.remove('visible');
  };

  function renderModal() {
    const body = document.getElementById('aiModalBody');
    if (!body) return;

    body.innerHTML = `
      <div class="vm-admin-tabs" style="margin-bottom:16px">
        <button class="vm-admin-tab${_activeTab === 'summary' ? ' active' : ''}" data-t="summary">Resumo do Turno</button>
        <button class="vm-admin-tab${_activeTab === 'missions' ? ' active' : ''}" data-t="missions">Sugerir Missões</button>
        <button class="vm-admin-tab${_activeTab === 'flow' ? ' active' : ''}" data-t="flow">Previsão Fluxo</button>
      </div>
      <div id="aiTabContent"></div>
    `;

    body.querySelectorAll('.vm-admin-tab').forEach(btn => {
      btn.addEventListener('click', () => { _activeTab = btn.dataset.t; renderModal(); });
    });

    const area = document.getElementById('aiTabContent');
    if (_activeTab === 'summary') renderSummary(area);
    else if (_activeTab === 'missions') renderMissions(area);
    else renderFlow(area);
  }

  // ─── Resumo do Turno ───
  async function renderSummary(area) {
    area.innerHTML = '<div class="ai-loading"><i class="fa-solid fa-spinner fa-spin"></i> Gerando resumo inteligente…</div>';

    try {
      const state = window._dashboardState;
      const turnoId = state?.turno?.id;
      if (!turnoId) { area.innerHTML = '<div class="ai-empty">Nenhum turno ativo para analisar.</div>'; return; }

      const { data, error } = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'turno-summary',
          payload: {
            turno_id: turnoId,
            duracao: 8,
            total_atend: state?.quickStats?.total || 0,
            vendas: state?.quickStats?.vendas || 0,
            conversao: state?.quickStats?.total > 0 ? Math.round((state.quickStats.vendas / state.quickStats.total) * 100) : 0,
            tempo_medio: 0,
            ranking: [],
            motivos: []
          }
        }
      });

      if (error || !data?.ok) throw new Error(data?.message || 'IA indisponível');
      const r = data.result;
      area.innerHTML = `
        <div class="ai-result-card">
          <div class="ai-result-section">
            <h4><i class="fa-solid fa-chart-line"></i> Resumo</h4>
            <p>${esc(r.resumo)}</p>
          </div>
          <div class="ai-result-row">
            <div class="ai-result-highlight good">
              <strong><i class="fa-solid fa-arrow-up"></i> Destaque</strong>
              <p>${esc(r.destaque)}</p>
            </div>
            <div class="ai-result-highlight improve">
              <strong><i class="fa-solid fa-lightbulb"></i> Oportunidade</strong>
              <p>${esc(r.oportunidade)}</p>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="ai-error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(err?.message || 'Erro ao gerar resumo')}</div>`;
    }
  }

  // ─── Sugestão de Missões ───
  async function renderMissions(area) {
    area.innerHTML = '<div class="ai-loading"><i class="fa-solid fa-spinner fa-spin"></i> Gerando sugestões de missões…</div>';

    try {
      const { data, error } = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'mission-suggestions',
          payload: {
            avg_atend: 10,
            avg_vendas: 4,
            avg_conv: 40,
            current_missions: []
          }
        }
      });

      if (error || !data?.ok) throw new Error(data?.message || 'IA indisponível');
      const missions = data.result?.missions || [];

      area.innerHTML = `
        <div class="ai-missions-list">
          ${missions.map(m => `
            <div class="ai-mission-card">
              <div class="ai-mission-top">
                <strong>${esc(m.title)}</strong>
                <span class="ai-mission-xp"><i class="fa-solid fa-bolt"></i> ${m.xp} XP</span>
              </div>
              <p>${esc(m.description)}</p>
              <div class="ai-mission-meta">
                <span>${esc(m.goal_type)}: ${m.goal_value}</span>
                <button class="ai-mission-use" data-mission='${JSON.stringify(m).replace(/'/g, "&#39;")}'>
                  <i class="fa-solid fa-plus"></i> Criar missão
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      area.querySelectorAll('.ai-mission-use').forEach(btn => {
        btn.addEventListener('click', () => {
          window._toast?.('Abra "Missões" no menu lateral pra criar a missão sugerida', 'info');
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="ai-error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(err?.message || 'Erro ao sugerir missões')}</div>`;
    }
  }

  // ─── Previsão de Fluxo ───
  async function renderFlow(area) {
    area.innerHTML = '<div class="ai-loading"><i class="fa-solid fa-spinner fa-spin"></i> Analisando padrões de fluxo…</div>';

    try {
      const dayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
      const today = dayNames[new Date().getDay()];

      const { data, error } = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'flow-prediction',
          payload: {
            target_day: today,
            hourly_data: { note: 'dados insuficientes — usar estimativas gerais de varejo' }
          }
        }
      });

      if (error || !data?.ok) throw new Error(data?.message || 'IA indisponível');
      const r = data.result;

      const peaks = r.peaks || [];
      const preds = r.predictions || [];

      area.innerHTML = `
        <div class="ai-result-card">
          <div class="ai-result-section">
            <h4><i class="fa-solid fa-chart-bar"></i> Previsão para ${esc(today)}</h4>
            <p>${esc(r.insight)}</p>
          </div>
          ${peaks.length > 0 ? `
            <div class="ai-peaks">
              <strong>Horários de pico:</strong>
              ${peaks.map(p => `<div class="ai-peak-item">
                <span class="ai-peak-hour">${p.hour}h</span>
                <span class="ai-peak-expected">${p.expected} atend.</span>
                <span class="ai-peak-tip">${esc(p.suggestion)}</span>
              </div>`).join('')}
            </div>
          ` : ''}
          ${preds.length > 0 ? `
            <div class="ai-flow-chart">
              ${preds.map(p => {
                const pct = Math.min(100, (p.expected / Math.max(...preds.map(x => x.expected || 1))) * 100);
                return `<div class="ai-flow-bar-row">
                  <span class="ai-flow-hour">${p.hour}h</span>
                  <div class="ai-flow-bar"><div class="ai-flow-fill" style="width:${pct}%"></div></div>
                  <span class="ai-flow-val">${p.expected}</span>
                </div>`;
              }).join('')}
            </div>
          ` : ''}
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="ai-error"><i class="fa-solid fa-circle-exclamation"></i> ${esc(err?.message || 'Erro na previsão')}</div>`;
    }
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
})();

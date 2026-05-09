// ============================================
// minhavez Dashboard — IA Assist
// Coleta métricas via RPCs antes de chamar a IA pra evitar respostas genéricas.
// ============================================

(function () {
  let sb = null;
  let _activeTab = 'summary';

  function todayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  function yesterdayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  function last4WeeksRange() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 28);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  function lastSameWeekday() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  window._dashAiOpen = async function () {
    sb = window._supabase;
    if (!sb) return;
    document.getElementById('aiModal')?.classList.add('open');
    renderModal();
  };

  window._dashAiClose = function () {
    document.getElementById('aiModal')?.classList.remove('open');
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
    body.querySelectorAll('.vm-admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.t;
        renderModal();
      });
    });

    const area = document.getElementById('aiTabContent');
    if (_activeTab === 'summary') renderSummary(area);
    else if (_activeTab === 'missions') renderMissions(area);
    else renderFlow(area);
  }

  function loadingHtml(msg) {
    return `<div class="ai-loading-rich">
      <div class="ai-spinner"></div>
      <div class="ai-loading-msg">${msg}</div>
      <div class="ai-loading-sub">Coletando dados reais e processando com IA...</div>
    </div>`;
  }

  // ─── Resumo do Turno (com dados reais) ───
  async function renderSummary(area) {
    area.innerHTML = loadingHtml('Analisando turno em andamento');

    try {
      const range = todayRange();
      const yRange = yesterdayRange();
      const wRange = last4WeeksRange(); // baseline 28 dias pro comparador por vendedor

      const [convToday, convYest, convBaseline, ranking, rankingBaseline, motivos, motivosBaseline, hourly] =
        await Promise.all([
          sb.rpc('get_conversion_stats', { p_inicio: range.start, p_fim: range.end }),
          sb.rpc('get_conversion_stats', { p_inicio: yRange.start, p_fim: yRange.end }),
          sb.rpc('get_conversion_stats', { p_inicio: wRange.start, p_fim: wRange.end }),
          sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end }),
          sb.rpc('get_seller_ranking', { p_inicio: wRange.start, p_fim: wRange.end }),
          sb.rpc('get_loss_reasons', { p_inicio: range.start, p_fim: range.end }),
          sb.rpc('get_loss_reasons', { p_inicio: wRange.start, p_fim: wRange.end }),
          sb.rpc('get_hourly_flow', { p_inicio: range.start, p_fim: range.end })
        ]);

      const t = convToday.data?.[0] || {};
      const y = convYest.data?.[0] || {};
      const base = convBaseline.data?.[0] || {};

      if (convToday.error) console.error('[ai] conv today:', convToday.error);
      if (ranking.error) console.error('[ai] ranking:', ranking.error);
      if (motivos.error) console.error('[ai] motivos:', motivos.error);
      if (hourly.error) console.error('[ai] hourly:', hourly.error);

      const total_atend = Number(t.total_atendimentos) || 0;
      if (total_atend === 0) {
        area.innerHTML = `<div class="ai-empty-rich">
          <i class="fa-solid fa-clock"></i>
          <strong>Sem atendimentos hoje ainda</strong>
          <p>Volte depois de iniciar o turno e atender alguns clientes pra IA gerar análise.</p>
        </div>`;
        return;
      }

      const vendas = Number(t.total_vendas) || 0;
      const conversao = total_atend > 0 ? Math.round((vendas / total_atend) * 100) : 0;
      const yConv =
        Number(y.total_atendimentos) > 0
          ? Math.round((Number(y.total_vendas) / Number(y.total_atendimentos)) * 100)
          : 0;

      // Baseline 28 dias pra comparar vendedor vs ele mesmo
      const baselineByVendor = {};
      (rankingBaseline.data || []).forEach((v) => {
        const atend28 = Number(v.total_atendimentos) || 0;
        const vendas28 = Number(v.total_vendas) || 0;
        baselineByVendor[v.nome] = {
          atend_dia_avg: Math.round((atend28 / 28) * 10) / 10,
          vendas_dia_avg: Math.round((vendas28 / 28) * 10) / 10,
          conv_28d: atend28 > 0 ? Math.round((vendas28 / atend28) * 100) : 0
        };
      });

      const rankingTop = (ranking.data || []).slice(0, 5).map((v) => {
        const b = baselineByVendor[v.nome] || {};
        const atendHoje = Number(v.total_atendimentos) || 0;
        const vendasHoje = Number(v.total_vendas) || 0;
        const convHoje = Number(v.taxa_conversao) || 0;
        return {
          nome: v.nome,
          atendimentos: atendHoje,
          vendas: vendasHoje,
          conversao: convHoje,
          tempo_medio: Number(v.tempo_medio_min) || 0,
          // Deltas vs baseline pessoal (últimos 28 dias)
          atend_vs_self_avg: b.atend_dia_avg ? Math.round((atendHoje / b.atend_dia_avg - 1) * 100) : null,
          conv_vs_self: b.conv_28d != null ? convHoje - b.conv_28d : null
        };
      });

      // Motivos com comparação vs baseline (% do motivo no período atual vs 28d)
      const totalMotTodayAll = (motivos.data || []).reduce((a, m) => a + (Number(m.total) || 0), 0);
      const totalMotBaseAll = (motivosBaseline.data || []).reduce((a, m) => a + (Number(m.total) || 0), 0);
      const motivosBaseMap = {};
      (motivosBaseline.data || []).forEach((m) => {
        motivosBaseMap[m.motivo] = Number(m.total) || 0;
      });
      const motivosTop = (motivos.data || []).slice(0, 5).map((m) => {
        const qtd = Number(m.total) || 0;
        const pctToday = totalMotTodayAll > 0 ? Math.round((qtd / totalMotTodayAll) * 100) : 0;
        const baseQtd = motivosBaseMap[m.motivo] || 0;
        const pctBase = totalMotBaseAll > 0 ? Math.round((baseQtd / totalMotBaseAll) * 100) : 0;
        return {
          motivo: m.motivo,
          qtd,
          pct_hoje: pctToday,
          pct_baseline: pctBase,
          delta_pct: pctToday - pctBase
        };
      });

      // Breakdown horário (ajuda IA detectar padrão de pico/vale)
      const hourlyFlow = (hourly.data || []).map((h) => ({
        hora: Number(h.hora),
        atend: Number(h.atendimentos) || 0,
        vendas: Number(h.vendas) || 0
      }));
      const peakHour = hourlyFlow.length
        ? hourlyFlow.reduce((a, b) => (b.atend > a.atend ? b : a), hourlyFlow[0])
        : null;

      const snapshotHash = `${total_atend}-${vendas}-${rankingTop.length}-${motivosTop.length}-v2`;

      const invokeRes = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'turno-summary',
          payload: {
            turno_id: range.start,
            snapshot_hash: snapshotHash,
            duracao: Math.max(1, Math.round((Date.now() - new Date(range.start).getTime()) / 3600000)),
            total_atend,
            vendas,
            conversao,
            tempo_medio: Math.round(Number(t.tempo_medio_min) || 0),
            ticket_medio: Math.round(Number(t.ticket_medio) || 0),
            ranking: rankingTop,
            motivos: motivosTop,
            delta_conv: conversao - yConv,
            delta_vendas: vendas - (Number(y.total_vendas) || 0),
            // Campos novos pra contexto mais rico:
            conv_baseline_28d:
              base.total_atendimentos > 0
                ? Math.round((Number(base.total_vendas) / Number(base.total_atendimentos)) * 100)
                : 0,
            hourly_flow: hourlyFlow,
            peak_hour: peakHour ? { hora: peakHour.hora, atend: peakHour.atend } : null
          }
        }
      });

      const { data, error } = invokeRes;
      if (error) console.error('[ai-assist invoke error]', error);
      if (data && !data.ok) console.error('[ai-assist payload error]', data);
      if (error || !data?.ok) throw new Error(data?.message || error?.message || 'IA indisponível');
      const r = data.result;

      const scoreColor = r.score >= 80 ? 'good' : r.score >= 60 ? 'mid' : 'bad';

      area.innerHTML = `
        <div class="ai-result-rich">
          <div class="ai-headline">
            <div class="ai-headline-text">${esc(r.headline)}</div>
            <div class="ai-score-badge ${scoreColor}">
              <span class="ai-score-num">${r.score || 0}</span>
              <span class="ai-score-label">SCORE</span>
            </div>
          </div>

          <div class="ai-cards-row">
            <div class="ai-card-rich good">
              <div class="ai-card-icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
              <div class="ai-card-body">
                <strong>${esc(r.destaque?.titulo || 'Destaque')}</strong>
                <p>${esc(r.destaque?.detalhe || '')}</p>
              </div>
            </div>

            <div class="ai-card-rich warn">
              <div class="ai-card-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div class="ai-card-body">
                <strong>${esc(r.alerta?.titulo || 'Alerta')}</strong>
                <p>${esc(r.alerta?.detalhe || '')}</p>
              </div>
            </div>
          </div>

          ${
            r.acao_imediata
              ? `
          <div class="ai-action">
            <div class="ai-action-tag"><i class="fa-solid fa-bolt"></i> AÇÃO AGORA</div>
            <div class="ai-action-text">${esc(r.acao_imediata)}</div>
          </div>`
              : ''
          }
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="ai-error-rich">
        <i class="fa-solid fa-circle-exclamation"></i>
        <strong>Não foi possível gerar a análise</strong>
        <p>${esc(err?.message || 'Erro desconhecido')}</p>
      </div>`;
    }
  }

  // ─── Sugestão de Missões (com média semanal real) ───
  async function renderMissions(area) {
    area.innerHTML = loadingHtml('Calibrando missões com base no time');

    try {
      const wRange = last4WeeksRange();
      const [conv, ranking] = await Promise.all([
        sb.rpc('get_conversion_stats', { p_inicio: wRange.start, p_fim: wRange.end }),
        sb.rpc('get_seller_ranking', { p_inicio: wRange.start, p_fim: wRange.end })
      ]);

      if (conv.error) console.error('[ai] conv 4w:', conv.error);
      if (ranking.error) console.error('[ai] ranking 4w:', ranking.error);

      const c = conv.data?.[0] || {};
      const totalAtend = Number(c.total_atendimentos) || 0;
      const totalVendas = Number(c.total_vendas) || 0;
      const ticketMedio = Number(c.ticket_medio) || 0;
      const numVendors = (ranking.data || []).length || 1;
      const days = 28;

      const avg_atend = Math.round((totalAtend / numVendors / days) * 10) / 10;
      const avg_vendas = Math.round((totalVendas / numVendors / days) * 10) / 10;
      const avg_conv = totalAtend > 0 ? Math.round((totalVendas / totalAtend) * 100) : 0;
      const avg_ticket = Math.round(ticketMedio);

      const snapshotHash = `${totalAtend}-${totalVendas}-${numVendors}`;

      const invokeRes2 = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'mission-suggestions',
          payload: {
            snapshot_hash: snapshotHash,
            avg_atend,
            avg_vendas,
            avg_conv,
            avg_ticket,
            total_vendors: numVendors,
            current_missions: []
          }
        }
      });

      const { data, error } = invokeRes2;
      if (error) console.error('[ai-assist missions error]', error);
      if (data && !data.ok) console.error('[ai-assist missions payload err]', data);
      if (error || !data?.ok) throw new Error(data?.message || error?.message || 'IA indisponível');
      const missions = data.result?.missions || [];

      area.innerHTML = `
        <div class="ai-context-strip">
          <span><i class="fa-solid fa-database"></i> Calibrado em ${numVendors} vendedor(es), 28 dias</span>
          <span>Média: ${avg_atend} atend/dia · ${avg_vendas} vendas/dia · ${avg_conv}% conv · R$ ${avg_ticket} ticket</span>
        </div>
        <div class="ai-missions-rich">
          ${missions
            .map((m) => {
              const d = (m.difficulty || 'medium').toLowerCase();
              const dLabel = d === 'easy' ? 'Fácil' : d === 'hard' ? 'Difícil' : 'Médio';
              return `
            <div class="ai-mission-rich ${d}">
              <div class="ai-mission-head">
                <span class="ai-mission-diff">${dLabel}</span>
                <span class="ai-mission-xp"><i class="fa-solid fa-bolt"></i> ${m.xp} XP</span>
              </div>
              <h4>${esc(m.title)}</h4>
              <p>${esc(m.description)}</p>
              <div class="ai-mission-meta">
                <span class="ai-mission-target">
                  <i class="fa-solid fa-bullseye"></i>
                  Meta: ${m.goal_value} ${goalLabel(m.goal_type)}
                </span>
                ${
                  m.rationale
                    ? `<span class="ai-mission-why" title="${esc(m.rationale)}">
                  <i class="fa-solid fa-info-circle"></i>
                </span>`
                    : ''
                }
              </div>
              <button class="ai-mission-use" data-mission='${JSON.stringify(m).replace(/'/g, '&#39;')}'>
                <i class="fa-solid fa-plus"></i> Criar essa missão
              </button>
            </div>`;
            })
            .join('')}
        </div>
      `;

      area.querySelectorAll('.ai-mission-use').forEach((btn) => {
        btn.addEventListener('click', () => {
          window._toast?.('Abra "Missões" no menu lateral pra criar a missão sugerida', 'info');
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="ai-error-rich">
        <i class="fa-solid fa-circle-exclamation"></i>
        <strong>Não foi possível gerar sugestões</strong>
        <p>${esc(err?.message || 'Erro desconhecido')}</p>
      </div>`;
    }
  }

  // ─── Previsão de Fluxo (com hourly real das últimas 4 semanas) ───
  async function renderFlow(area) {
    area.innerHTML = loadingHtml('Analisando padrões de fluxo');

    try {
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const today = dayNames[new Date().getDay()];

      const wRange = last4WeeksRange();
      const sameDayRange = lastSameWeekday();

      const [hourly4w, hourlySameDay] = await Promise.all([
        sb.rpc('get_hourly_flow', { p_inicio: wRange.start, p_fim: wRange.end }),
        sb.rpc('get_hourly_flow', { p_inicio: sameDayRange.start, p_fim: sameDayRange.end })
      ]);

      if (hourly4w.error) console.error('[ai] hourly 4w:', hourly4w.error);
      if (hourlySameDay.error) console.error('[ai] hourly same:', hourlySameDay.error);

      const buckets = {};
      (hourly4w.data || []).forEach((row) => {
        const h = Number(row.hora);
        if (!buckets[h]) buckets[h] = { count: 0, samples: 0 };
        buckets[h].count += Number(row.atendimentos || 0);
        buckets[h].samples++;
      });

      const hourly_data = {};
      Object.keys(buckets).forEach((h) => {
        hourly_data[h] = Math.round(buckets[h].count / Math.max(1, buckets[h].samples));
      });

      const last_same_day = {};
      (hourlySameDay.data || []).forEach((row) => {
        last_same_day[Number(row.hora)] = Number(row.atendimentos || 0);
      });

      const snapshotHash = `${Object.keys(hourly_data).length}-${today}`;

      const invokeRes3 = await sb.functions.invoke('ai-assist', {
        body: {
          type: 'flow-prediction',
          payload: {
            snapshot_hash: snapshotHash,
            target_day: today,
            hourly_data,
            last_same_day,
            total_vendors: 0
          }
        }
      });

      const { data, error } = invokeRes3;
      if (error) console.error('[ai-assist flow error]', error);
      if (data && !data.ok) console.error('[ai-assist flow payload err]', data);
      if (error || !data?.ok) throw new Error(data?.message || error?.message || 'IA indisponível');
      const r = data.result;
      const peaks = r.peaks || [];
      const vales = r.vales || [];
      const preds = r.predictions || [];
      const maxExpected = Math.max(1, ...preds.map((x) => x.expected || 1));

      area.innerHTML = `
        <div class="ai-result-rich">
          <div class="ai-headline">
            <div class="ai-headline-text">${esc(r.headline || `Previsão pra ${today}`)}</div>
            <div class="ai-headline-tag"><i class="fa-solid fa-calendar-day"></i> ${esc(today)}</div>
          </div>

          ${
            r.comparativo
              ? `
          <div class="ai-compare">
            <i class="fa-solid fa-arrows-left-right"></i>
            <span>${esc(r.comparativo)}</span>
          </div>`
              : ''
          }

          ${
            preds.length > 0
              ? `
          <div class="ai-flow-chart">
            <div class="ai-flow-title">Distribuição esperada</div>
            ${preds
              .map((p) => {
                const pct = Math.min(100, ((p.expected || 0) / maxExpected) * 100);
                const cls = p.type === 'pico' ? 'peak' : p.type === 'vale' ? 'valley' : '';
                return `<div class="ai-flow-bar-row ${cls}">
                <span class="ai-flow-hour">${p.hour}h</span>
                <div class="ai-flow-bar"><div class="ai-flow-fill" style="width:${pct}%"></div></div>
                <span class="ai-flow-val">${p.expected}</span>
              </div>`;
              })
              .join('')}
          </div>`
              : ''
          }

          ${
            peaks.length > 0
              ? `
          <div class="ai-peaks-rich">
            <div class="ai-section-label"><i class="fa-solid fa-bolt"></i> AÇÕES PROS PICOS</div>
            ${peaks
              .map(
                (p) => `
              <div class="ai-peak-rich ${p.priority || ''}">
                <span class="ai-peak-hour">${p.hour}h</span>
                <span class="ai-peak-detail"><strong>${p.expected} atend.</strong> ${esc(p.action || '')}</span>
              </div>
            `
              )
              .join('')}
          </div>`
              : ''
          }

          ${
            vales.length > 0
              ? `
          <div class="ai-vales-rich">
            <div class="ai-section-label"><i class="fa-solid fa-coffee"></i> APROVEITE OS VALES</div>
            ${vales
              .map(
                (v) => `
              <div class="ai-vale-rich">
                <span class="ai-peak-hour">${v.hour}h</span>
                <span class="ai-peak-detail">${esc(v.action || '')}</span>
              </div>
            `
              )
              .join('')}
          </div>`
              : ''
          }

          ${
            r.insight
              ? `
          <div class="ai-insight">
            <i class="fa-solid fa-lightbulb"></i>
            <span>${esc(r.insight)}</span>
          </div>`
              : ''
          }
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="ai-error-rich">
        <i class="fa-solid fa-circle-exclamation"></i>
        <strong>Não foi possível gerar a previsão</strong>
        <p>${esc(err?.message || 'Erro desconhecido')}</p>
      </div>`;
    }
  }

  function goalLabel(t) {
    return (
      {
        atendimentos_count: 'atendimentos',
        vendas_count: 'vendas',
        vendas_canal_count: 'vendas no canal',
        valor_vendido_total: 'em vendas (R$)'
      }[t] || t
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

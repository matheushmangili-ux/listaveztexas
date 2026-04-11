// ============================================
// minhavez Vendedor — Home screen + real-time + actions
// ============================================

let _sb = null;
let _ctx = null;        // resultado de get_my_vendedor_context()
let _atendId = null;    // id do atendimento ativo (se houver)
let _atendStartMs = 0;  // epoch ms do início do atendimento ativo
let _attendingTimer = null;
let _pausaSinceTimer = null;
let _realtimeChannel = null;
let _canais = [];

// ─── DOM refs ───
const el = {};
function grabRefs() {
  el.headerAvatar = document.getElementById('headerAvatar');
  el.headerName = document.getElementById('headerName');
  el.headerStatus = document.getElementById('headerStatus');
  el.headerDot = document.getElementById('headerDot');
  el.btnRefresh = document.getElementById('btnRefresh');

  el.idleCard = document.getElementById('homeIdleCard');
  el.attendingCard = document.getElementById('homeAttendingCard');
  el.pausaCard = document.getElementById('homePausaCard');
  el.offCard = document.getElementById('homeOffCard');

  el.bigPos = document.getElementById('bigPos');
  el.bigLabel = document.getElementById('bigLabel');
  el.queuePeek = document.getElementById('queuePeek');
  el.btnStart = document.getElementById('btnStartAttendance');
  el.btnStartPref = document.getElementById('btnStartPreferencial');

  el.attendingTimer = document.getElementById('attendingTimer');
  el.btnFinish = document.getElementById('btnFinishAttendance');
  el.btnCancel = document.getElementById('btnCancelAttendance');

  el.pausaIcon = document.getElementById('pausaIcon');
  el.pausaLabel = document.getElementById('pausaLabel');
  el.pausaSince = document.getElementById('pausaSince');
  el.btnReturn = document.getElementById('btnReturnFromPausa');

  el.offSub = document.getElementById('offSub');

  el.statVendas = document.getElementById('statVendas');
  el.statAtend = document.getElementById('statAtend');
  el.statConv = document.getElementById('statConv');

  el.btnPausa = document.getElementById('btnPausa');
  el.btnLogout = document.getElementById('btnLogout');

  el.canalOverlay = document.getElementById('canalOverlay');
  el.canalSheet = document.getElementById('canalSheet');
  el.canalGrid = document.getElementById('canalGrid');

  el.outcomeOverlay = document.getElementById('outcomeOverlay');
  el.outcomeSheet = document.getElementById('outcomeSheet');

  el.pausaOverlay = document.getElementById('pausaOverlay');
  el.pausaSheet = document.getElementById('pausaSheet');

  el.pushPromptCard = document.getElementById('pushPromptCard');
  el.pushPromptTitle = document.getElementById('pushPromptTitle');
  el.pushPromptSub = document.getElementById('pushPromptSub');
  el.btnEnablePush = document.getElementById('btnEnablePush');
}

const SAIDA_META = {
  almoco: { icon: 'fa-utensils', label: 'Almoço' },
  banheiro: { icon: 'fa-restroom', label: 'Banheiro' },
  operacional: { icon: 'fa-wrench', label: 'Operacional' },
  finalizar: { icon: 'fa-door-open', label: 'Finalizou' },
  outro: { icon: 'fa-ellipsis', label: 'Outro' }
};

// ─── Public API ───
export async function initHome(sb) {
  _sb = sb;
  grabRefs();
  wireActions();

  try {
    await loadContext();
    // canais + stats em paralelo (independentes entre si, só dependem do ctx)
    await Promise.all([loadCanais(), loadStats()]);
    renderAll();
    subscribeRealtime();
    setupPushNotifications();
  } catch (err) {
    console.error('[initHome] erro:', err);
    window._vendorToast('Erro ao carregar: ' + (err?.message || err), 'error');
  }
}

export function unmountHome() {
  stopAttendingTimer();
  stopPausaSinceTimer();
  if (_realtimeChannel) {
    _sb?.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  _ctx = null;
  _atendId = null;
  _atendStartMs = 0;
}

// ─── Data loading ───
async function loadContext() {
  const { data, error } = await _sb.rpc('get_my_vendedor_context');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Vendedor não vinculado a esta conta');
  }
  _ctx = data[0];
  if (!_ctx.has_access) {
    throw new Error('Sua loja não tem acesso ao minhavez Vendedor (plano ' + _ctx.tenant_plano + ')');
  }

  // Se está em atendimento, busca o atendimento ativo dele
  if (_ctx.status === 'em_atendimento') {
    const { data: atends } = await _sb
      .from('atendimentos')
      .select('id, inicio')
      .eq('vendedor_id', _ctx.vendedor_id)
      .eq('resultado', 'em_andamento')
      .order('inicio', { ascending: false })
      .limit(1);
    if (atends && atends[0]) {
      _atendId = atends[0].id;
      _atendStartMs = new Date(atends[0].inicio).getTime();
    }
  } else {
    _atendId = null;
    _atendStartMs = 0;
  }
}

async function loadCanais() {
  const { data } = await _sb
    .from('canais_origem')
    .select('id, nome, icone, ordem')
    .eq('tenant_id', _ctx.tenant_id)
    .eq('ativo', true)
    .order('ordem');
  _canais = data || [];
}

async function loadStats() {
  if (!_ctx.turno_aberto_id) {
    el.statVendas.textContent = '0';
    el.statAtend.textContent = '0';
    el.statConv.textContent = '0%';
    return;
  }
  const { data } = await _sb
    .from('atendimentos')
    .select('resultado')
    .eq('vendedor_id', _ctx.vendedor_id)
    .eq('turno_id', _ctx.turno_aberto_id);
  const finalized = (data || []).filter((a) => a.resultado !== 'em_andamento');
  const vendas = finalized.filter((a) => a.resultado === 'venda' || a.resultado === 'troca').length;
  const total = finalized.length;
  el.statVendas.textContent = String(vendas);
  el.statAtend.textContent = String(total);
  el.statConv.textContent = total > 0 ? Math.round((vendas / total) * 100) + '%' : '0%';
}

// ─── Rendering ───
function renderAll() {
  renderHeader();
  renderMainCard();
}

function renderHeader() {
  const nome = _ctx.apelido || _ctx.nome;
  el.headerName.textContent = nome;
  // Avatar
  if (_ctx.foto_url) {
    el.headerAvatar.innerHTML = `<img src="${escape(_ctx.foto_url)}" alt="${escape(nome)}">`;
  } else {
    el.headerAvatar.textContent = initials(nome);
  }
  // Status dot + label
  el.headerDot.className = 'fa-solid fa-circle vendor-dot ' + dotClassFor(_ctx.status);
  el.headerStatus.textContent = statusLabelFor(_ctx.status);
  // Botão preferencial: só quando está na fila como disponível
  const canPreferencial = _ctx.status === 'disponivel' && _ctx.posicao_fila != null;
  if (canPreferencial) {
    el.btnStartPref.classList.remove('hidden');
  } else {
    el.btnStartPref.classList.add('hidden');
  }
}

function dotClassFor(status) {
  if (status === 'disponivel') return '';
  if (status === 'em_atendimento') return 'busy';
  if (status === 'pausa') return 'pausa';
  return 'off';
}
function statusLabelFor(status) {
  if (status === 'disponivel') return 'Na fila';
  if (status === 'em_atendimento') return 'Atendendo';
  if (status === 'pausa') return 'Em pausa';
  return 'Fora do turno';
}

function hideAllCards() {
  el.idleCard.classList.add('hidden');
  el.attendingCard.classList.add('hidden');
  el.pausaCard.classList.add('hidden');
  el.offCard.classList.add('hidden');
}

function renderMainCard() {
  hideAllCards();

  if (!_ctx.turno_aberto_id) {
    el.offCard.classList.remove('hidden');
    el.offSub.textContent = 'Aguardando a abertura do turno pela recepção';
    return;
  }

  switch (_ctx.status) {
    case 'disponivel':
      renderIdle();
      break;
    case 'em_atendimento':
      renderAttending();
      break;
    case 'pausa':
      renderPausa();
      break;
    default:
      el.offCard.classList.remove('hidden');
      el.offSub.textContent = 'Peça pra recepção te colocar na fila';
  }
}

async function renderIdle() {
  el.idleCard.classList.remove('hidden');

  const pos = _ctx.posicao_fila;
  if (pos == null) {
    el.bigPos.textContent = '—';
    el.bigPos.classList.remove('next-pulse');
    el.bigLabel.textContent = 'Fora da fila — peça pra recepção te adicionar';
    el.btnStart.classList.add('hidden');
    el.btnStartPref.classList.add('hidden');
    el.queuePeek.innerHTML = '';
    return;
  }

  el.bigPos.textContent = String(pos);
  if (pos === 1) {
    el.bigPos.classList.add('next-pulse');
    el.bigLabel.textContent = 'É a sua vez!';
    el.btnStart.classList.remove('hidden');
  } else {
    el.bigPos.classList.remove('next-pulse');
    el.bigLabel.textContent = (pos - 1) === 1 ? '1 pessoa na sua frente' : (pos - 1) + ' pessoas na sua frente';
    el.btnStart.classList.add('hidden');
  }

  // Peek da fila (top 3 do setor do vendedor)
  const { data } = await _sb
    .from('vendedores')
    .select('id, nome, apelido, posicao_fila')
    .eq('tenant_id', _ctx.tenant_id)
    .eq('setor', _ctx.setor || 'loja')
    .eq('status', 'disponivel')
    .not('posicao_fila', 'is', null)
    .order('posicao_fila')
    .limit(3);

  el.queuePeek.innerHTML = (data || [])
    .map((v) => {
      const isSelf = v.id === _ctx.vendedor_id;
      const name = isSelf ? 'Você' : (v.apelido || v.nome);
      return `<div class="peek-item${isSelf ? ' self' : ''}">
        <span class="peek-pos">#${v.posicao_fila}</span>
        <span class="peek-name">${escape(name)}</span>
      </div>`;
    })
    .join('');
}

function renderAttending() {
  el.attendingCard.classList.remove('hidden');
  startAttendingTimer();
}

function renderPausa() {
  el.pausaCard.classList.remove('hidden');

  // Busca a última pausa aberta pra mostrar o motivo + tempo
  _sb.from('pausas')
    .select('motivo, inicio')
    .eq('vendedor_id', _ctx.vendedor_id)
    .is('fim', null)
    .order('inicio', { ascending: false })
    .limit(1)
    .then(({ data }) => {
      const p = data && data[0];
      if (!p) {
        el.pausaIcon.className = 'fa-solid fa-pause';
        el.pausaLabel.textContent = 'Em pausa';
        return;
      }
      const meta = SAIDA_META[p.motivo] || SAIDA_META.outro;
      el.pausaIcon.className = 'fa-solid ' + meta.icon;
      el.pausaLabel.textContent = meta.label;
      const startMs = new Date(p.inicio).getTime();
      startPausaSinceTimer(startMs);
    });
}

// ─── Timers ───
function startAttendingTimer() {
  stopAttendingTimer();
  if (!_atendStartMs) return;
  const tick = () => {
    const s = Math.floor((Date.now() - _atendStartMs) / 1000);
    el.attendingTimer.textContent = formatMMSS(s);
  };
  tick();
  _attendingTimer = setInterval(tick, 1000);
}
function stopAttendingTimer() {
  if (_attendingTimer) { clearInterval(_attendingTimer); _attendingTimer = null; }
}

function startPausaSinceTimer(startMs) {
  stopPausaSinceTimer();
  const tick = () => {
    const mins = Math.floor((Date.now() - startMs) / 60000);
    el.pausaSince.textContent = mins === 0 ? 'há menos de 1 min' : 'há ' + mins + ' min';
  };
  tick();
  _pausaSinceTimer = setInterval(tick, 30000);
}
function stopPausaSinceTimer() {
  if (_pausaSinceTimer) { clearInterval(_pausaSinceTimer); _pausaSinceTimer = null; }
}

// ─── Realtime ───
function subscribeRealtime() {
  if (_realtimeChannel) _sb.removeChannel(_realtimeChannel);

  _realtimeChannel = _sb
    .channel('vendor-' + _ctx.vendedor_id)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'vendedores',
      filter: 'tenant_id=eq.' + _ctx.tenant_id
    }, async () => {
      // Qualquer mudança de vendedor do tenant pode afetar a posição na fila
      await loadContext();
      renderAll();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'atendimentos',
      filter: 'tenant_id=eq.' + _ctx.tenant_id
    }, async () => {
      await loadStats();
    })
    .subscribe();
}

// ─── Actions wiring ───
function wireActions() {
  el.btnStart.addEventListener('click', () => onStartAttendance(false));
  el.btnStartPref.addEventListener('click', () => onStartAttendance(true));
  el.btnFinish.addEventListener('click', () => openOutcomeSheet());
  el.btnCancel.addEventListener('click', onCancelAttendance);
  el.btnReturn.addEventListener('click', onReturnFromPausa);
  el.btnPausa.addEventListener('click', () => openPausaSheet());
  el.btnLogout.addEventListener('click', () => window._vendorLogout && window._vendorLogout());
  el.btnRefresh.addEventListener('click', onRefresh);

  // Outcome buttons
  el.outcomeSheet.querySelectorAll('.vendor-outcome-btn').forEach((btn) => {
    btn.addEventListener('click', () => onFinishAttendance(btn.dataset.outcome));
  });

  // Pausa buttons
  el.pausaSheet.querySelectorAll('.vendor-pausa-btn').forEach((btn) => {
    btn.addEventListener('click', () => onGoPausa(btn.dataset.motivo));
  });

  // Overlays fecham bottom sheets
  el.canalOverlay.addEventListener('click', closeAllSheets);
  el.outcomeOverlay.addEventListener('click', closeAllSheets);
  el.pausaOverlay.addEventListener('click', closeAllSheets);

  // Helper pro botão "Não informar" canal
  window._vendorStartWithoutCanal = () => {
    closeAllSheets();
    callStartAttendance(null);  // _pendingPreferencial já foi setado no onStartAttendance
  };
}

function openCanalSheet() {
  if (!_canais || _canais.length === 0) {
    // Sem canais configurados, vai direto
    callStartAttendance(null);
    return;
  }
  el.canalGrid.innerHTML = _canais.map((c) => `
    <button class="vendor-canal-btn" data-canal="${c.id}">
      <i class="fa-solid ${escape(c.icone || 'fa-circle-question')}"></i>
      <span>${escape(c.nome)}</span>
    </button>
  `).join('');
  el.canalGrid.querySelectorAll('.vendor-canal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const canalId = btn.dataset.canal;
      closeAllSheets();
      callStartAttendance(canalId);
    });
  });
  el.canalOverlay.classList.remove('hidden');
  el.canalSheet.classList.remove('hidden');
}

function openOutcomeSheet() {
  if (!_atendStartMs) return;
  const elapsed = Math.floor((Date.now() - _atendStartMs) / 1000);
  if (elapsed < 120) {
    window._vendorToast('Aguarde pelo menos 2 minutos antes de finalizar', 'error');
    return;
  }
  el.outcomeOverlay.classList.remove('hidden');
  el.outcomeSheet.classList.remove('hidden');
}

function openPausaSheet() {
  if (_ctx.status === 'em_atendimento') {
    window._vendorToast('Termine o atendimento antes de entrar em pausa', 'error');
    return;
  }
  el.pausaOverlay.classList.remove('hidden');
  el.pausaSheet.classList.remove('hidden');
}

function closeAllSheets() {
  el.canalOverlay.classList.add('hidden');
  el.canalSheet.classList.add('hidden');
  el.outcomeOverlay.classList.add('hidden');
  el.outcomeSheet.classList.add('hidden');
  el.pausaOverlay.classList.add('hidden');
  el.pausaSheet.classList.add('hidden');
}

// ─── Action handlers ───
let _pendingPreferencial = false;

function onStartAttendance(preferencial) {
  // Regular: só quem tá no #1
  if (!preferencial && _ctx.posicao_fila !== 1) {
    window._vendorToast('Você não é o próximo da fila', 'error');
    return;
  }
  // Preferencial: precisa estar na fila (qualquer posição)
  if (preferencial && (_ctx.posicao_fila == null || _ctx.status !== 'disponivel')) {
    window._vendorToast('Você precisa estar na fila pra atender preferencial', 'error');
    return;
  }
  _pendingPreferencial = !!preferencial;
  openCanalSheet();
}

async function callStartAttendance(canalId) {
  try {
    const { data, error } = await _sb.rpc('vendor_start_attendance', {
      p_canal_id: canalId,
      p_preferencial: _pendingPreferencial
    });
    if (error) throw error;
    _atendId = data;
    _atendStartMs = Date.now();
    const wasPref = _pendingPreferencial;
    _pendingPreferencial = false;
    await loadContext();
    renderAll();
    window._vendorToast(wasPref ? 'Atendimento preferencial iniciado ⭐' : 'Atendimento iniciado', 'success');
  } catch (err) {
    _pendingPreferencial = false;
    window._vendorToast(err?.message || 'Erro ao iniciar', 'error');
  }
}

async function onRefresh() {
  if (el.btnRefresh.classList.contains('refreshing')) return;
  el.btnRefresh.classList.add('refreshing');
  try {
    await loadContext();
    await Promise.all([loadCanais(), loadStats()]);
    renderAll();
    window._vendorToast('Atualizado', 'success', 1200);
  } catch (err) {
    window._vendorToast('Erro: ' + (err?.message || err), 'error');
  } finally {
    setTimeout(() => el.btnRefresh.classList.remove('refreshing'), 400);
  }
}

async function onFinishAttendance(resultado) {
  closeAllSheets();
  try {
    const { error } = await _sb.rpc('vendor_finish_attendance', {
      p_atend_id: _atendId,
      p_resultado: resultado,
      p_valor: null,
      p_motivo: null,
      p_detalhe: null,
      p_produto: null,
      p_fidelizado: false
    });
    if (error) throw error;
    _atendId = null;
    _atendStartMs = 0;
    stopAttendingTimer();
    await loadContext();
    await loadStats();
    renderAll();
    window._vendorToast('Atendimento finalizado', 'success');
  } catch (err) {
    window._vendorToast(err?.message || 'Erro ao finalizar', 'error');
  }
}

async function onCancelAttendance() {
  if (!_atendId) return;
  if (!confirm('Cancelar atendimento? O registro será apagado.')) return;
  try {
    const { error } = await _sb.rpc('vendor_finish_attendance', {
      p_atend_id: _atendId,
      p_resultado: 'cancelar'
    });
    if (error) throw error;
    _atendId = null;
    _atendStartMs = 0;
    stopAttendingTimer();
    await loadContext();
    renderAll();
    window._vendorToast('Atendimento cancelado', 'info');
  } catch (err) {
    window._vendorToast(err?.message || 'Erro ao cancelar', 'error');
  }
}

async function onGoPausa(motivo) {
  closeAllSheets();
  try {
    const { error } = await _sb.rpc('vendor_go_pausa', { p_motivo: motivo });
    if (error) throw error;
    await loadContext();
    renderAll();
    window._vendorToast('Entrou em pausa', 'info');
  } catch (err) {
    window._vendorToast(err?.message || 'Erro ao entrar em pausa', 'error');
  }
}

async function onReturnFromPausa() {
  try {
    const { error } = await _sb.rpc('vendor_return_from_pausa');
    if (error) throw error;
    stopPausaSinceTimer();
    await loadContext();
    renderAll();
    window._vendorToast('Voltou pra fila', 'success');
  } catch (err) {
    window._vendorToast(err?.message || 'Erro ao voltar', 'error');
  }
}

// ─── Web Push notifications ───
async function setupPushNotifications() {
  // Detecta suporte
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    console.log('[push] Web Push não suportado nesse browser');
    return;
  }

  // iOS: só funciona em PWA instalada na tela inicial (Safari 16.4+)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !isStandalone) {
    showPushCard('ios-tip', 'Adicione à Tela de Início', 'Toque em Compartilhar → Adicionar à Tela de Início pra receber alertas');
    return;
  }

  // Aguarda SW estar ativo
  let registration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('[push] SW não disponível:', err);
    return;
  }

  // Já tem subscription? Reenvia pro DB (garante sync) e mostra tudo OK
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await saveSubscriptionToDB(existing);
    hidePushCard();
    return;
  }

  if (Notification.permission === 'denied') {
    showPushCard('denied', 'Notificações bloqueadas', 'Habilite nas configurações do navegador pra não perder a vez');
    return;
  }

  if (Notification.permission === 'granted') {
    // Permissão já dada mas sem subscription — subscreve silenciosamente
    await subscribeToPush(registration);
    hidePushCard();
    return;
  }

  // Permission = 'default' → mostra card de prompt
  showPushCard('default', 'Ative as notificações', 'pra saber quando é a sua vez');
  el.btnEnablePush.onclick = async () => {
    el.btnEnablePush.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showPushCard('denied', 'Notificações bloqueadas', 'Habilite nas configurações do navegador pra não perder a vez');
        return;
      }
      await subscribeToPush(registration);
      hidePushCard();
      window._vendorToast('Notificações ativadas 🔔', 'success');
    } catch (err) {
      console.error('[push] enable falhou:', err);
      window._vendorToast('Erro: ' + (err?.message || err), 'error');
    } finally {
      el.btnEnablePush.disabled = false;
    }
  };
}

function showPushCard(variant, title, subtitle) {
  el.pushPromptCard.className = 'vendor-push-prompt' + (variant && variant !== 'default' ? ' ' + variant : '');
  el.pushPromptTitle.textContent = title;
  el.pushPromptSub.textContent = subtitle;
  el.pushPromptCard.classList.remove('hidden');
}

function hidePushCard() {
  el.pushPromptCard.classList.add('hidden');
}

async function subscribeToPush(registration) {
  const { data: vapidPublicKey, error } = await _sb.rpc('get_vapid_public_key');
  if (error || !vapidPublicKey) throw new Error('VAPID key não disponível');

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
  await saveSubscriptionToDB(sub);
}

async function saveSubscriptionToDB(sub) {
  const p256dhKey = sub.getKey('p256dh');
  const authKey = sub.getKey('auth');
  if (!p256dhKey || !authKey) return;
  const { error } = await _sb.rpc('vendor_save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: arrayBufferToBase64Url(p256dhKey),
    p_auth: arrayBufferToBase64Url(authKey),
    p_user_agent: (navigator.userAgent || '').slice(0, 200)
  });
  if (error) console.warn('[push] save subscription falhou:', error);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Utils ───
function formatMMSS(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function escape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// MinhaVez — mv-sync (Broadcast por tenant)
// ============================================
// Substitui as subscriptions postgres_changes de vendedores/atendimentos.
//
// MOTIVO (incidente 2026-06-11): postgres_changes passa TODO write do banco
// pelo decodificador de WAL do Realtime — a carga crônica dominante do projeto
// (~13h de CPU acumuladas; picos de 12s por lote) que saturou o free tier e
// derrubou a loja por 2h30. Broadcast vai client→client pelo servidor de
// realtime SEM tocar no Postgres/WAL: escala com mensagens, não com writes.
//
// Modelo: quem executa uma ação publica 'sync' ({kind, ...}); os demais
// clients recarregam (debounced de quem recebe). Broadcast é o EMPURRÃO
// rápido, não a única fonte — os fallbacks de poll continuam (tablet 30s,
// vendor resync ao focar/online, botão de refresh).
//
// Após o deploy dos clients, sql/67 tira vendedores/atendimentos da
// publication supabase_realtime → o decodificador fica praticamente ocioso.

let _ch = null;
let _sb = null;

/**
 * Abre (ou reabre) o canal de sync do tenant.
 * @param {object} sb - client supabase
 * @param {string} tenantId
 * @param {(payload: object) => void} onEvent - chamado a cada 'sync' recebido
 * @param {(status: string) => void} [onStatus] - status do subscribe (banner/retry)
 */
export function initSync(sb, tenantId, onEvent, onStatus) {
  _sb = sb;
  if (_ch) {
    try {
      sb.removeChannel(_ch);
    } catch (_e) {
      /* no-op */
    }
    _ch = null;
  }
  _ch = sb.channel('mv-sync:' + (tenantId || 'default'), { config: { broadcast: { self: false } } });
  _ch.on('broadcast', { event: 'sync' }, (msg) => onEvent((msg && msg.payload) || {}));
  _ch.subscribe(onStatus);
  return _ch;
}

/** Publica um evento de sync pros outros clients do tenant. Nunca lança. */
export function publishSync(payload) {
  try {
    if (_ch) _ch.send({ type: 'broadcast', event: 'sync', payload: payload || {} });
  } catch (_e) {
    /* no-op — sync é hint; os polls de fallback cobrem */
  }
}

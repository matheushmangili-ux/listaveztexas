// ============================================
// minhavez — AI Assist (Gemini proxy client)
// Shared helper for all AI features. Handles timeouts, fallbacks, errors.
// ============================================

export async function callAI(sb, type, payload, options = {}) {
  const { timeout = 15000, fallback = null } = options;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const { data, error } = await sb.functions.invoke('ai-assist', {
      body: { type, payload }
    });
    clearTimeout(timer);

    if (error) throw error;
    if (!data?.ok) return fallback;
    return data.result;
  } catch (err) {
    console.warn(`[ai-assist] ${type} falhou:`, err);
    return fallback;
  }
}

/**
 * Utilitários para handoff humano via WhatsApp.
 *
 * NÃO envia mensagens. Apenas normaliza telefones e monta links wa.me que um
 * atendente humano clica para abrir a conversa manualmente.
 */

/**
 * Normaliza um telefone brasileiro para o formato exigido pelo wa.me:
 * 55 + DDD + número, somente dígitos. Retorna null se não for plausível.
 */
export function normalizePhoneBR(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');

  // Remove zeros de tronco / prefixos comuns.
  digits = digits.replace(/^0+/, '');

  // Já vem com código do país?
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // DDD + número (10 ou 11 dígitos) -> prefixa 55.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

/**
 * Monta um link wa.me com mensagem opcional pré-preenchida.
 * @param {string} phone - telefone (será normalizado)
 * @param {string} [text]
 * @returns {string|null}
 */
export function buildWaMeLink(phone, text) {
  const normalized = normalizePhoneBR(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

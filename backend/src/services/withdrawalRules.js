/**
 * Direito de arrependimento (art. 49 do CDC; Decreto 7.962/2013, art. 5º):
 * 7 dias a contar do pagamento, pelo próprio app. Regra pura, usada no
 * histórico (até quando aparece o botão) e na desistência em si.
 *
 * Só compras pagas pelo Mercado Pago, aprovadas e ainda sem reembolso. No
 * mensal, só a primeira cobrança da assinatura (first_charge).
 */
export const WITHDRAWAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** → Date até quando dá para desistir, ou null */
export function withdrawableUntil(row, now = Date.now()) {
  if (!row || row.status !== 'approved' || row.refunded_at || !row.paid_at) return null
  if (row.provider !== 'mercadopago' || !row.external_id || row.first_charge === false) return null
  const until = new Date(new Date(row.paid_at).getTime() + WITHDRAWAL_DAYS * DAY_MS)
  return until.getTime() > now ? until : null
}

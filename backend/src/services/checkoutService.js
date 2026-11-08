import crypto from 'node:crypto'
import { db } from '../database/connection.js'
import { CHECKOUT_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import * as mercadoPago from './mercadoPago.js'
import * as subscriptionService from './subscriptionService.js'
import * as termsService from './termsService.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Checkout: anual, fundador anual e fundador vitalício por cartão ou Pix
 * (Checkout Pro), e o mensal como assinatura no cartão (preapproval). Sempre
 * por redirecionamento: nenhum script do Mercado Pago no site.
 *
 * 1. Reserva (offer_reservations) com a linha da oferta travada: a vaga de
 *    fundador é presa aqui, então a 101 nunca chega a ser vendida.
 * 2. Preferência no Mercado Pago com external_reference = reserva.
 * 3. Quem decide o Pro é o webhook (consultando a API), nunca a volta do
 *    navegador.
 * Checkout não pago até expires_at: o job reservations.release devolve a vaga.
 */
export const ONE_OFF_OFFERS = ['annual', 'founder_annual', 'founder_lifetime']
export const CHECKOUT_OFFERS = ['monthly', ...ONE_OFF_OFFERS]
export const CHECKOUT_TTL_MINUTES = Number(process.env.CHECKOUT_TTL_MINUTES) || 30

const TITLES = {
  monthly: 'Librishelf Pro — mensal',
  annual: 'Librishelf Pro — anual',
  founder_annual: 'Librishelf Pro — fundador anual',
  founder_lifetime: 'Librishelf Pro — fundador vitalício'
}

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '')
const notificationUrl = () => process.env.MP_NOTIFICATION_URL?.trim() || `${appUrl()}/api/webhooks/mercadopago`
const iso = date => (date ? new Date(date).toISOString() : null)

/** Página de preços: preço, vagas restantes e se dá para comprar agora */
export async function offers() {
  const { rows } = await db.query(q.OFFERS_PUBLIC)
  return rows.map(row => ({
    code: row.code,
    priceCents: row.price_cents,
    currency: row.currency,
    duration: row.duration,
    autoRenew: row.auto_renew,
    slotsTotal: row.slots_total,
    slotsLeft: row.slots_total === null ? null : Math.max(row.slots_total - row.slots_used, 0),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    available: row.available
  }))
}

/** → { url, reference, expiresAt } */
export async function start(userId, offerCode) {
  if (!CHECKOUT_OFFERS.includes(offerCode)) {
    throw httpError('Oferta inválida.', STATUS.BAD_REQUEST, 'OFFER_INVALID')
  }
  if (!mercadoPago.isConfigured()) {
    throw httpError('Pagamentos indisponíveis no momento.', 503, 'PAYMENTS_UNAVAILABLE')
  }

  const reservation = await transaction(async (client) => {
    const buyer = (await client.query(q.BUYER, [userId])).rows[0]
    if (!buyer) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
    if (!buyer.email_verified_at) {
      throw httpError('Confirme seu e-mail para assinar o Pro.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_CHECKOUT')
    }
    // Compra só com os termos vigentes aceitos (preço, renovação e reembolso)
    await termsService.assertAccepted(userId, client)

    const paid = (await client.query(q.ACTIVE_PAID, [userId])).rows[0]
    if (paid.lifetime) throw httpError('Você já tem o Pro vitalício.', STATUS.CONFLICT, 'ALREADY_LIFETIME')
    if (offerCode === 'monthly' && await subscriptionService.hasActive(userId, client)) {
      throw httpError('Você já tem uma assinatura mensal ativa.', STATUS.CONFLICT, 'SUBSCRIPTION_ACTIVE')
    }

    const offer = (await client.query(q.OFFER_LOCK, [offerCode])).rows[0]
    // Fundador anual: o preço vale enquanto renovar antes de vencer, mesmo
    // depois da janela e sem gastar outra vaga
    const founderRenewal = offerCode === 'founder_annual' && paid.founder_annual
    if (!offer || (!offer.open && !founderRenewal)) {
      throw httpError('Esta oferta não está disponível.', STATUS.CONFLICT, 'OFFER_UNAVAILABLE')
    }

    // Clicou de novo: a reserva anterior sai (e devolve a vaga, se tinha)
    const previous = (await client.query(q.OPEN_RESERVATION, [userId, offerCode])).rows[0]
    let staleSubscription = null
    if (previous) {
      // Assinatura aberta e abandonada: cancela no Mercado Pago (depois do COMMIT)
      if (offerCode === 'monthly') staleSubscription = previous.preference_id
      await client.query(q.RELEASE_ONE, [previous.id])
      if (previous.holds_slot) {
        await client.query(q.SLOT_GIVE_BACK, [offerCode])
        offer.slots_used -= 1
      }
    }

    const holdsSlot = offer.slots_total !== null && !founderRenewal
    if (holdsSlot) {
      if (offer.slots_used >= offer.slots_total) {
        throw httpError('As vagas desta oferta acabaram.', STATUS.CONFLICT, 'OFFER_SOLD_OUT')
      }
      await client.query(q.SLOT_TAKE, [offerCode])
    }

    const reference = crypto.randomUUID()
    const { rows } = await client.query(q.INSERT_RESERVATION, [userId, offerCode, reference, CHECKOUT_TTL_MINUTES, holdsSlot, offer.price_cents])
    return { ...rows[0], email: buyer.email, priceCents: offer.price_cents, paidUntil: paid.paid_until, staleSubscription }
  })

  if (reservation.staleSubscription) {
    mercadoPago.cancelPreapproval(reservation.staleSubscription)
      .catch(err => logger.warn('Não foi possível cancelar a assinatura abandonada', { preapprovalId: reservation.staleSubscription, message: err.message }))
  }

  try {
    // Mensal: assinatura (preapproval); o resto: preferência do Checkout Pro
    const created = offerCode === 'monthly'
      ? await mercadoPago.createPreapproval(subscriptionService.preapprovalBody({
        reference: reservation.reference,
        email: reservation.email,
        priceCents: reservation.priceCents,
        backUrl: `${appUrl()}/plan/return?result=subscription&ref=${reservation.reference}`,
        // Com anual em dia, a primeira cobrança espera ele acabar
        startDate: reservation.paidUntil && new Date(reservation.paidUntil) > new Date() ? reservation.paidUntil : null
      }), reservation.reference)
      : await mercadoPago.createPreference(preferenceBody(offerCode, reservation), reservation.reference)
    const url = mercadoPago.checkoutUrlOf(created)
    if (!url) throw new Error('Resposta sem init_point')

    await db.query(q.SET_CHECKOUT, [reservation.id, url, String(created.id ?? '')])
    logger.info('Checkout iniciado', { userId, offer: offerCode, reservationId: reservation.id })
    return { url, reference: reservation.reference, expiresAt: iso(reservation.expires_at) }
  } catch (err) {
    // A vaga não fica presa por um checkout que nem abriu
    await db.query(q.ABORT_RESERVATION, [reservation.id]).catch(() => { })
    if (err.status === 503) throw err
    logger.error('Falha ao criar o checkout no Mercado Pago', { userId, offer: offerCode, message: err.message })
    throw httpError('Não foi possível abrir o pagamento agora. Tente de novo em instantes.', 502, 'PAYMENT_PROVIDER_ERROR')
  }
}

function preferenceBody(offerCode, reservation) {
  const back = result => `${appUrl()}/plan/return?result=${result}&ref=${reservation.reference}`
  return {
    items: [{
      id: offerCode,
      title: TITLES[offerCode],
      quantity: 1,
      currency_id: 'BRL',
      unit_price: reservation.priceCents / 100
    }],
    payer: { email: reservation.email },
    external_reference: reservation.reference,
    notification_url: notificationUrl(),
    back_urls: { success: back('success'), pending: back('pending'), failure: back('failure') },
    auto_return: 'approved',
    // Só cartão e Pix: sem boleto (ticket) nem pagamento em lotérica (atm); à vista
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 1
    },
    // A preferência vence junto com a reserva da vaga
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(reservation.expires_at).toISOString(),
    statement_descriptor: 'LIBRISHELF'
  }
}

/** Página de retorno: o que o servidor sabe da compra (nunca da URL de volta) */
export async function status(userId, reference) {
  const { rows } = await db.query(q.RESERVATION_OF_USER, [reference, userId])
  const row = rows[0]
  if (!row) throw httpError('Compra não encontrada.', STATUS.NOT_FOUND, 'CHECKOUT_NOT_FOUND')

  const state = row.entitlement_id ? 'active'
    : row.problem ? 'problem'
      : row.payment_status === 'approved' ? 'processing'
        : ['pending', 'in_process', 'authorized'].includes(row.payment_status) ? 'pending'
          : ['rejected', 'cancelled'].includes(row.payment_status) ? 'rejected'
            : row.status === 'released' ? 'expired'
              : 'waiting'

  return {
    reference: row.reference,
    offer: row.offer_code,
    subscription: row.offer_code === 'monthly',
    state,
    method: row.payment_method,
    expiresAt: iso(row.expires_at),
    // Reabrir o mesmo checkout enquanto a reserva vale
    url: row.status === 'pending' && new Date(row.expires_at) > new Date() ? row.checkout_url : null
  }
}

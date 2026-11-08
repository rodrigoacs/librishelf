import { expect } from '@playwright/test'
import { FAKES_URL } from './env.js'

/**
 * Compra do Pro contra o Mercado Pago falso (e2e/fakes/mercadoPago.js), que
 * abre uma página com "Pagar com cartão", "Pagar com Pix" e "Recusar pagamento"
 * e volta para /plan/return como o Checkout Pro.
 */
export const PAY_CARD = 'Pagar com cartão'
export const PAY_PIX = 'Pagar com Pix'
export const REJECT = 'Recusar pagamento'

/** Preços → Comprar (anual) → página de pagamento do Mercado Pago falso */
export async function openAnnualCheckout(page) {
  await page.goto('/pricing')
  await page.getByRole('article', { name: 'Anual', exact: true }).getByRole('button', { name: 'Comprar' }).click()
  await page.waitForURL(url => url.href.startsWith(`${FAKES_URL}/checkout/`))
  await expect(page.getByRole('heading', { name: 'Librishelf Pro — anual' })).toBeVisible()
}

/** Escolhe na página do Mercado Pago falso e espera a volta para o Librishelf */
export async function payOnFake(page, choice) {
  await page.getByRole('button', { name: choice }).click()
  await page.waitForURL(/\/plan\/return\?/)
}

/** → id do pagamento no Mercado Pago (o payment_id da volta) */
export async function buyAnnual(page, choice = PAY_CARD) {
  await openAnnualCheckout(page)
  await payOnFake(page, choice)
  await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible()
  return Number(new URL(page.url()).searchParams.get('payment_id'))
}

/** Checkout aberto pela API: { url, reference } (o teste vê o resto pela tela) */
export async function startCheckout(api, offer = 'annual') {
  const res = await api.post('/api/plan/checkout', { data: { offer } })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

/** Paga direto no falso, sem o navegador voltar: só o webhook avisa o Librishelf */
export async function payWithoutReturning(api, checkoutUrl, method = 'card') {
  const res = await api.post(`${checkoutUrl}/pay`, { form: { method }, maxRedirects: 0 })
  expect(res.status()).toBe(303)
}

export async function fakePayment(api, id) {
  const { payments } = await (await api.get(`${FAKES_URL}/__fake/payments`)).json()
  return payments.find(payment => payment.id === id)
}

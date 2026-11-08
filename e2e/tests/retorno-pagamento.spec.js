import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'
import { openAnnualCheckout, payOnFake, payWithoutReturning, startCheckout, PAY_CARD, REJECT } from '../support/checkout.js'

test('pagamento recusado: nada de Pro e tentar de novo', async ({ page }) => {
  await createAccount(page.request, { prefix: 'rec' })

  await openAnnualCheckout(page)
  await payOnFake(page, REJECT)
  await expect(page.getByRole('heading', { name: 'Pagamento recusado' })).toBeVisible()
  // O e-mail de recusa espera 30 min (DECLINED_DELAY_MINUTES) e não sai se a
  // compra for paga nesse meio-tempo: fica com os testes de integração

  const { user: me } = await (await page.request.get('/api/auth/me')).json()
  expect(me.plan.features.stats_advanced).toBe(false)

  // Tentar de novo volta aos preços; o checkout novo passa
  await page.getByRole('link', { name: 'Tentar de novo' }).click()
  await expect(page).toHaveURL(/\/pricing/)
  await openAnnualCheckout(page)
  await payOnFake(page, PAY_CARD)
  await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible()
})

test('volta sem pagar e reabre o mesmo pagamento', async ({ page }) => {
  await createAccount(page.request, { prefix: 'vol' })
  const { reference } = await startCheckout(page.request)

  // Fechou o Mercado Pago sem pagar e voltou pelo histórico
  await page.goto(`/plan/return?ref=${reference}`)
  await expect(page.getByRole('heading', { name: 'Esperando o pagamento' })).toBeVisible()

  await page.getByRole('button', { name: 'Abrir o pagamento de novo' }).click()
  await expect(page.getByRole('heading', { name: 'Librishelf Pro — anual' })).toBeVisible()
  await payOnFake(page, PAY_CARD)
  await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible()
})

test('só o webhook avisa: o retorno confirma sem payment_id na URL', async ({ page }) => {
  await createAccount(page.request, { prefix: 'whk' })
  const { url, reference } = await startCheckout(page.request)

  // Pago no Mercado Pago, mas o navegador nunca voltou com os dados: o
  // webhook assinado chega, o worker confere na API e libera o Pro
  await payWithoutReturning(page.request, url)
  await page.goto(`/plan/return?ref=${reference}`)
  await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible({ timeout: 20_000 })
})

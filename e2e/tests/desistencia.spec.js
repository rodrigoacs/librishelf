import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'
import { waitForMail } from '../support/mail.js'
import { buyAnnual, fakePayment } from '../support/checkout.js'

test('desistir da compra em até 7 dias: estorno, fim do Pro e e-mail', async ({ page }) => {
  const user = await createAccount(page.request, { prefix: 'des' })
  const paymentId = await buyAnnual(page)

  await page.goto('/settings')
  const plan = page.getByRole('region', { name: 'Plano' })
  await expect(plan.getByRole('button', { name: /^Plano atual .*Anual/ })).toBeVisible()

  // Linha "Desistir da compra" com o prazo; a confirmação diz o valor
  await plan.getByRole('button', { name: /^Desistir da compra Você pode desistir até/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Desistir da compra?' })
  await expect(dialog.getByText(/estorno de R\$\s49,90/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Desistir e pedir estorno' }).click()

  await expect(page.getByText(/Desistência confirmada\. O estorno de R\$\s49,90 foi pedido ao Mercado Pago/)).toBeVisible()
  await expect(plan.getByRole('button', { name: /^Plano atual .*Grátis/ })).toBeVisible()
  await expect(plan.getByRole('button', { name: /^Desistir da compra/ })).toHaveCount(0)

  // O Mercado Pago recebeu o estorno do valor inteiro
  expect(await fakePayment(page.request, paymentId)).toMatchObject({ status: 'refunded', transaction_amount_refunded: 49.9 })

  await waitForMail(page.request, user.email, /Desistência confirmada no Librishelf/)
  const { user: me } = await (await page.request.get('/api/auth/me')).json()
  expect(me.plan.features.stats_advanced).toBe(false)
})

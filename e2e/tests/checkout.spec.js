import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'
import { waitForMail } from '../support/mail.js'
import { openAnnualCheckout, payOnFake, PAY_PIX } from '../support/checkout.js'

test('comprar o anual com Pix no checkout do Mercado Pago', async ({ page }) => {
  const user = await createAccount(page.request, { prefix: 'buy' })

  // A página de pagamento recebe o valor e o nome da oferta
  await openAnnualCheckout(page)
  await expect(page.getByText('R$ 49,90')).toBeVisible()
  await payOnFake(page, PAY_PIX)

  await expect(page.getByRole('heading', { name: 'Pagamento confirmado' })).toBeVisible()
  await expect(page.getByText(/Seu Pro está ativo até/)).toBeVisible()

  // Conta mostra o plano, e o recibo vai por e-mail (fila do worker)
  await page.getByRole('link', { name: 'Ir para Conta' }).click()
  await expect(page.getByRole('region', { name: 'Plano' }).getByRole('button', { name: /^Plano atual .*Anual/ })).toBeVisible()
  await waitForMail(page.request, user.email, /Pagamento confirmado no Librishelf/)

  const { user: me } = await (await page.request.get('/api/auth/me')).json()
  expect(me.plan.features).toMatchObject({ stats_advanced: true, personalization: true })
})

test('sem e-mail confirmado, o checkout não abre', async ({ page }) => {
  await createAccount(page.request, { prefix: 'nov', verified: false })

  await page.goto('/pricing')
  await page.getByRole('article', { name: 'Anual', exact: true }).getByRole('button', { name: 'Comprar' }).click()
  await expect(page.getByText('Confirme seu e-mail para assinar o Pro.')).toBeVisible()
  await expect(page).toHaveURL(/\/pricing$/)
})

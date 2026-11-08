import { test, expect } from '../support/test.js'
import { newIdentity } from '../support/accounts.js'
import { linkIn, waitForMail } from '../support/mail.js'

test('cadastro com aceite dos termos e confirmação do e-mail', async ({ page }) => {
  const user = newIdentity('cad')

  await page.goto('/register')
  await page.getByLabel('Nome de usuário').fill(user.username)
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByLabel('Confirmar senha').fill(user.password)

  // Sem o aceite dos termos, a conta não é criada
  const terms = page.getByRole('checkbox', { name: /aceito os termos de uso/ })
  await page.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByText('Aceite os termos de uso e a política de privacidade para criar a conta.')).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)

  // Os links dos termos levam aos textos
  await expect(page.getByRole('link', { name: 'termos de uso' })).toHaveAttribute('href', '/terms')
  await expect(page.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute('href', '/privacy')

  await terms.check()
  await page.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByText('Conta criada. Enviamos um link para confirmar seu e-mail.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  // Link do e-mail de confirmação (servidor SMTP falso)
  const mail = await waitForMail(page.request, user.email, /Confirme seu e-mail/)
  const link = linkIn(mail, '/verify-email')
  await page.goto(link.pathname + link.search)
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible()

  // Entra com a conta nova
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByLabel('E-mail ou usuário').fill(user.username)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)

  // O servidor guardou o aceite da versão vigente e o e-mail confirmado
  const me = await (await page.request.get('/api/auth/me')).json()
  expect(me.user).toMatchObject({ name: user.username, emailVerified: true, terms: { accepted: true } })
})

import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'
import { addBook } from '../support/library.js'

// Primeiros passos (pacote 42): depois de confirmar o e-mail, o Início leva a eles
test('primeiros passos: como começar, 3 livros, biblioteca pública e pronto', async ({ page }) => {
  await createAccount(page.request, { prefix: 'onb', onboarding: true })

  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByText('Passo 1 de 4')).toBeVisible()
  await page.getByRole('radio', { name: /Buscar pelo título/ }).click()

  // Passo 2: o Adicionar livro já abre na busca por título
  await expect(page.getByRole('heading', { name: 'Seus primeiros livros' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Faltam 3 livros' })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar livro' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Título ou autor' })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(dialog).toBeHidden()

  // O passo fica no servidor: recarregar volta ao mesmo lugar, com os livros novos
  for (const title of ['Dom Casmurro', 'Vidas Secas', 'Quincas Borba']) {
    await addBook(page.request, { title, author: 'Autor' })
  }
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: '3 livros na estante' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Passo 3: biblioteca pública, opcional
  await expect(page.getByRole('heading', { name: 'Quer mostrar sua estante?' })).toBeVisible()
  const publicSwitch = page.getByRole('switch', { name: 'Biblioteca pública' })
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'false')
  await publicSwitch.click()
  await expect(publicSwitch).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.isPublic).toBe(true)
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Passo 4: pronto; depois disso o Início não leva mais aos primeiros passos
  await expect(page.getByRole('heading', { name: 'Tudo pronto' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir para o início' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: 'Continuar os primeiros passos' })).toHaveCount(0)
})

test('primeiros passos: pular e retomar de onde parou', async ({ page }) => {
  await createAccount(page.request, { prefix: 'onp', onboarding: true })

  await page.goto('/')
  await page.getByRole('radio', { name: /Ler o código de barras/ }).click()
  await expect(page.getByRole('heading', { name: 'Seus primeiros livros' })).toBeVisible()
  await page.getByRole('button', { name: 'Pular por agora' }).click()

  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Continuar os primeiros passos' }).click()
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { name: 'Seus primeiros livros' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ler código de barras' })).toBeVisible()
})

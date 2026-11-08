import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'
import { addBook, makePublic } from '../support/library.js'

// Dono pelo `request` (sessão própria); a página do teste é o visitante, sem sessão
test('página pública sem sessão: filtros na URL, convite e compartilhar', async ({ page, request, baseURL }) => {
  const owner = await createAccount(request, { prefix: 'pub' })
  await addBook(request, { title: 'Dom Casmurro', author: 'Machado de Assis', read: true })
  await addBook(request, { title: 'Dom Quixote', author: 'Miguel de Cervantes' })
  await addBook(request, { title: 'Grande Sertão: Veredas', author: 'Guimarães Rosa', read: true })
  await makePublic(request)

  // Compartilhar abre a folha do sistema (celular) ou copia (computador):
  // as duas ficam registradas aqui em vez de sair do navegador
  await page.addInitScript(() => {
    window.__shared = []
    const record = (type, url) => window.__shared.push({ type, url })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => record('share', data.url) })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => record('copy', text) } })
  })

  const path = `/u/${owner.username}`
  const shelf = page.getByRole('tabpanel', { name: /Estante/ })
  const book = title => shelf.getByRole('button', { name: new RegExp(`^${title}`) })

  // Link com filtros: só os lidos com "Dom"
  await page.goto(`${path}?status=read&q=Dom`)
  await expect(page.getByRole('heading', { level: 1, name: `Biblioteca de ${owner.username}` })).toBeVisible()
  await expect(shelf.getByRole('button', { name: 'Lidos' })).toHaveAttribute('aria-pressed', 'true')
  await expect(shelf.getByRole('searchbox', { name: 'Buscar por título ou autor' })).toHaveValue('Dom')
  await expect(book('Dom Casmurro')).toBeVisible()
  await expect(book('Dom Quixote')).toHaveCount(0)
  await expect(book('Grande Sertão')).toHaveCount(0)

  // Trocar o filtro atualiza a URL, e o estado volta depois de recarregar
  await shelf.getByRole('button', { name: 'Todos' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}\\?q=Dom$`))
  await expect(book('Dom Quixote')).toBeVisible()
  await page.reload()
  await expect(shelf.getByRole('searchbox', { name: 'Buscar por título ou autor' })).toHaveValue('Dom')
  await expect(book('Dom Quixote')).toBeVisible()
  await expect(book('Grande Sertão')).toHaveCount(0)

  await shelf.getByRole('button', { name: 'Limpar busca' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(book('Grande Sertão')).toBeVisible()

  // Compartilhar leva o link da página, sem os filtros
  await page.getByRole('button', { name: 'Compartilhar' }).first().click()
  await expect.poll(() => page.evaluate(() => window.__shared.at(-1))).toMatchObject({ url: `${new URL(baseURL).origin}${path}` })
  if ((await page.evaluate(() => window.__shared.at(-1).type)) === 'copy') {
    await expect(page.getByText('Link copiado.')).toBeVisible()
  }

  // Convite para quem chega sem conta: cadastro e login voltam para a página
  const invite = page.getByRole('complementary', { name: 'Monte a sua estante no Librishelf' })
  await expect(invite).toBeVisible()
  await expect(invite.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', `/login?redirect=${path}`)
  await invite.getByRole('link', { name: 'Criar conta' }).click()
  await expect(page).toHaveURL(`/register?redirect=${path}`)
  await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible()

  // Fechado, o convite não volta na mesma visita
  await page.goBack()
  await invite.getByRole('button', { name: 'Fechar convite' }).click()
  await expect(invite).toBeHidden()
  await page.reload()
  await expect(book('Dom Casmurro')).toBeVisible()
  await expect(invite).toBeHidden()
})

test('biblioteca privada não aparece para quem não é o dono', async ({ page, request }) => {
  const owner = await createAccount(request, { prefix: 'pri' })
  await addBook(request, { title: 'Diário secreto', author: 'Ninguém' })

  await page.goto(`/u/${owner.username}`)
  await expect(page.getByRole('heading', { name: 'Esta biblioteca não existe ou não é pública.' })).toBeVisible()
  await expect(page.getByText('Diário secreto')).toHaveCount(0)
})

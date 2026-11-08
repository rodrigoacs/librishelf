import { test, expect } from '../support/test.js'
import { createAccount } from '../support/accounts.js'

test('adicionar livro à mão e encontrar na biblioteca', async ({ page }) => {
  await createAccount(page.request, { prefix: 'liv' })
  const title = `Memórias de um teste ${Date.now().toString(36)}`

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sua estante está vazia' })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar o primeiro livro' }).click()

  // Sem ISBN: preenche os campos à mão (nada sai para o Open Library)
  const dialog = page.getByRole('dialog', { name: 'Adicionar livro' })
  await dialog.getByLabel('Título').fill(title)
  await dialog.getByLabel('Autores').fill('Machado de Assis')
  await dialog.getByLabel('Autores').press('Enter')
  await dialog.getByLabel('Editora').fill('Editora Teste')
  await dialog.getByLabel('Páginas').fill('256')
  await dialog.getByLabel('Categorias').fill('Ficção, Clássicos')
  await dialog.getByRole('group', { name: 'Status de leitura' }).getByRole('button', { name: 'Lido' }).click()
  await dialog.getByRole('button', { name: 'Dar 4 de 5 estrelas' }).click()
  await dialog.getByRole('button', { name: 'Adicionar livro', exact: true }).click()
  await expect(dialog).toBeHidden()

  // A biblioteca mostra o livro, com o autor e o status
  await page.goto('/books')
  await expect(page.getByRole('button', { name: new RegExp(`${title}.*Machado de Assis.*Lido`) })).toBeVisible()

  // E o servidor guardou o que foi preenchido
  const { result } = await (await page.request.get('/api/library')).json()
  expect(result).toEqual([expect.objectContaining({
    title,
    author_names: ['Machado de Assis'],
    publisher_name: 'Editora Teste',
    page_count: 256,
    tag_names: ['Clássicos', 'Ficção'],
    rating: 4,
    read_count: 1
  })])
})

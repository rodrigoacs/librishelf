import { expect } from '@playwright/test'

/** Livro pela API (o teste "adicionar livro" cobre a tela). read = já lido. */
export async function addBook(api, { title, author, read = false }) {
  const multipart = { title, authors: author }
  if (read) multipart.readDate = new Date().toISOString().slice(0, 10)
  const res = await api.post('/api/library', { multipart })
  expect(res.status(), await res.text()).toBe(201)
}

/** Liga a biblioteca pública (Conta → Privacidade). Pede e-mail confirmado. */
export async function makePublic(api) {
  const res = await api.patch('/api/auth/me/visibility', { data: { isPublic: true } })
  expect(res.ok(), await res.text()).toBeTruthy()
}

import { expect } from '@playwright/test'
import { FAKES_URL } from './env.js'

/**
 * Caixa de e-mail falsa (e2e/fakes/mail.js). Cada teste usa um endereço
 * próprio, então não precisa esvaziar a caixa entre um e outro.
 */
export async function messagesTo(request, to) {
  const res = await request.get(`${FAKES_URL}/__fake/mail`, { params: { to } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).messages
}

/** Espera chegar um e-mail para `to` cujo assunto bate com `subject`. */
export async function waitForMail(request, to, subject) {
  let found
  await expect.poll(async () => {
    found = (await messagesTo(request, to)).findLast(message => subject.test(message.subject))
    return Boolean(found)
  }, { message: `e-mail "${subject}" para ${to}`, timeout: 15_000 }).toBe(true)
  return found
}

/** Primeiro link do texto do e-mail que começa com `path` (ex.: /verify-email). */
export function linkIn(message, path) {
  const link = message.text.match(/https?:\/\/\S+/g)?.find(url => new URL(url).pathname === path)
  expect(link, `link ${path} no e-mail "${message.subject}"`).toBeTruthy()
  return new URL(link)
}

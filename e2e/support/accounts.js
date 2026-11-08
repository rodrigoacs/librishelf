import { expect } from '@playwright/test'
import { linkIn, waitForMail } from './mail.js'

let sequence = 0

/**
 * Usuário novo a cada chamada: os testes rodam em paralelo e o banco não é
 * limpo entre execuções. Nome curto (o perfil público mostra na URL).
 */
export function newIdentity(prefix) {
  const id = `${prefix}${Date.now().toString(36)}${(sequence++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
  return { username: id, email: `${id}@librishelf.test`, password: 'Estante2026e2e' }
}

/**
 * Conta pronta pela API, sem passar pela tela de cadastro (que tem o próprio
 * teste): cadastro com aceite dos termos, confirmação pelo link do e-mail e
 * login. `api` é o page.request (a sessão vale na página) ou outro contexto
 * (o dono de uma página pública, enquanto a página do teste é o visitante).
 */
export async function createAccount(api, { prefix = 'e2e', verified = true } = {}) {
  const user = newIdentity(prefix)

  const created = await api.post('/api/auth/register', {
    data: { username: user.username, email: user.email, password: user.password, locale: 'pt', acceptTerms: true }
  })
  expect(created.status(), await created.text()).toBe(201)

  if (verified) {
    const mail = await waitForMail(api, user.email, /Confirme seu e-mail/)
    const token = linkIn(mail, '/verify-email').searchParams.get('token')
    expect((await api.post('/api/auth/email/verify', { data: { token } })).ok()).toBeTruthy()
  }

  await login(api, user)
  return user
}

export async function login(api, user) {
  const res = await api.post('/api/auth/login', { data: { username: user.username, password: user.password } })
  expect(res.ok(), await res.text()).toBeTruthy()
}

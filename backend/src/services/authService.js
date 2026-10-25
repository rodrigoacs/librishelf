import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { validatePassword } from '../utils/passwordPolicy.js'
import { deleteBookCover } from '../utils/imageProcessor.js'
import logger from '../utils/logger.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import * as tokenRepository from '../repositories/tokenRepository.js'
import { sendMail } from './mailService.js'
import { resetPasswordEmail, verifyEmailEmail, emailChangedEmail } from './emailTemplates.js'
import * as followEmailService from './followEmailService.js'
import { httpError } from '../utils/httpError.js'
import { isReservedUsername } from '../utils/reservedNames.js'

const SECRET_KEY = process.env.SECRET_KEY
const TOKEN_TTL = '7d'
const BCRYPT_ROUNDS = 10
const UNIQUE_VIOLATION = '23505'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_USERNAME_LENGTH = 50
// Mesmo formato aceito pela rota pública /u/:username no frontend.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u

// Hash fixo usado quando o usuário não existe: o bcrypt.compare roda com o
// mesmo custo e a resposta leva o mesmo tempo, sem permitir enumerar usuários.
const DUMMY_HASH = bcrypt.hashSync('librishelf-dummy-password', BCRYPT_ROUNDS)

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const RESET_TTL_MS = 60 * 60 * 1000             // 1 hora
const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000   // 3 dias
const INVALID_LINK = 'Este link é inválido ou expirou. Peça um novo.'

/** Endereço público do app, usado nos links dos e-mails. */
function appUrl() {
  return (process.env.APP_URL?.trim() || 'http://localhost:5173').replace(/\/$/, '')
}

const hashToken = raw => crypto.createHash('sha256').update(raw).digest('hex')

/** Gera um link de uso único; só o hash vai para o banco. */
async function createLinkToken(userId, purpose, ttlMs) {
  const raw = crypto.randomBytes(32).toString('base64url')
  await tokenRepository.replaceToken(userId, purpose, hashToken(raw), new Date(Date.now() + ttlMs))
  return raw
}

async function consumeLinkToken(raw, purpose) {
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 200) return null
  return tokenRepository.consumeToken(hashToken(raw), purpose)
}

function issueToken(user) {
  return jwt.sign({ id: user.id, username: user.name }, SECRET_KEY, { expiresIn: TOKEN_TTL })
}

function toProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isPublic: Boolean(user.is_public),
    showInCommunity: Boolean(user.show_in_community),
    showActivity: Boolean(user.show_activity),
    allowIndexing: Boolean(user.allow_indexing),
    followEmails: Boolean(user.follow_emails),
    emailVerified: Boolean(user.email_verified_at)
  }
}

async function verifyCurrentPassword(userId, password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw httpError('Informe a senha atual.', STATUS.BAD_REQUEST, 'CURRENT_PASSWORD_REQUIRED')
  }

  const user = await authRepository.getPasswordHashById(userId)
  const isValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)

  if (!user || !isValid) {
    throw httpError('Senha atual incorreta.', STATUS.UNAUTHORIZED, 'CURRENT_PASSWORD_WRONG')
  }

  return user.password_hash
}

async function loginUser(username, password) {
  if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
    throw httpError('Informe usuário e senha.', STATUS.BAD_REQUEST, 'CREDENTIALS_REQUIRED')
  }

  const user = await authRepository.getUserByUsername(username.trim())

  const isPasswordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)

  if (!user || !isPasswordValid) {
    throw httpError('Usuário ou senha inválidos.', STATUS.UNAUTHORIZED, 'INVALID_CREDENTIALS')
  }

  return {
    token: issueToken(user),
    user: { id: user.id, name: user.name, email: user.email }
  }
}

async function getUserProfile(id) {
  const user = await authRepository.getUserById(id)
  return user ? toProfile(user) : null
}

async function registerUser(username, password, email, locale) {
  if (!isNonEmptyString(username) || !isNonEmptyString(email)) {
    throw httpError('Informe usuário, senha e e-mail.', STATUS.BAD_REQUEST, 'REGISTER_FIELDS_REQUIRED')
  }

  const cleanUsername = username.trim()
  const cleanEmail = email.trim()

  if (cleanUsername.length > MAX_USERNAME_LENGTH) {
    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'USERNAME_TOO_LONG', { max: MAX_USERNAME_LENGTH })
  }

  // Letras, números, ponto, hífen e sublinhado. Isso também impede "@" (o login
  // aceita usuário OU e-mail no mesmo campo) e barras no link público.
  if (!USERNAME_PATTERN.test(cleanUsername)) {
    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST, 'USERNAME_INVALID')
  }

  if (isReservedUsername(cleanUsername)) {
    throw httpError('Este nome de usuário é reservado. Escolha outro.', STATUS.BAD_REQUEST, 'USERNAME_RESERVED')
  }

  if (!EMAIL_PATTERN.test(cleanEmail)) {
    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
  }

  const passwordCheck = validatePassword(password)
  if (!passwordCheck.valid) {
    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
  }

  const existingUser = await authRepository.getUserByUsername(cleanUsername)
  if (existingUser) {
    throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT, 'USERNAME_TAKEN')
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

  let created
  try {
    created = await authRepository.createUser(cleanUsername, hashedPassword, cleanEmail)
  } catch (err) {
    // Duas requisições simultâneas passam pela checagem acima; a constraint
    // UNIQUE do banco é quem decide, e a violação vira 409 em vez de 500.
    if (err.code === UNIQUE_VIOLATION) {
      throw httpError('Usuário ou e-mail já em uso.', STATUS.CONFLICT, 'USERNAME_OR_EMAIL_TAKEN')
    }
    throw err
  }

  // A conta existe mesmo se o e-mail falhar: dá para reenviar depois.
  try {
    await deliverVerification(created, locale)
  } catch (err) {
    logger.error('Falha ao enviar confirmação de e-mail no cadastro', { userId: created.id, message: err.message })
  }

  return toProfile(created)
}

async function deliverVerification(user, locale) {
  const raw = await createLinkToken(user.id, 'verify_email', VERIFY_TTL_MS)
  const mail = verifyEmailEmail({
    name: user.name,
    link: `${appUrl()}/verify-email?token=${raw}`,
    locale
  })
  await sendMail({ to: user.email, ...mail })
}

/** Reenvia a confirmação para quem está logado. */
async function resendVerification(userId, locale) {
  const user = await authRepository.getUserById(userId)
  if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (user.email_verified_at) return { alreadyVerified: true }

  try {
    await deliverVerification(user, locale)
  } catch (err) {
    logger.error('Falha ao reenviar confirmação de e-mail', { userId, message: err.message })
    throw httpError('Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.', 502, 'EMAIL_SEND_FAILED')
  }
  return { alreadyVerified: false }
}

async function verifyEmail(token) {
  const userId = await consumeLinkToken(token, 'verify_email')
  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST, 'LINK_INVALID')
  await authRepository.markEmailVerified(userId)
  logger.info('E-mail confirmado', { userId })
}

/**
 * "Esqueci minha senha". A resposta é sempre a mesma, exista ou não a conta,
 * para não revelar quais e-mails estão cadastrados.
 */
async function requestPasswordReset(email, locale) {
  if (!isNonEmptyString(email) || !EMAIL_PATTERN.test(email.trim())) {
    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
  }

  const user = await authRepository.getUserByEmail(email.trim())
  if (!user) {
    logger.info('Recuperação de senha para e-mail sem conta')
    return
  }

  try {
    const raw = await createLinkToken(user.id, 'reset_password', RESET_TTL_MS)
    const mail = resetPasswordEmail({
      name: user.name,
      link: `${appUrl()}/reset-password?token=${raw}`,
      locale
    })
    await sendMail({ to: user.email, ...mail })
  } catch (err) {
    // Mesmo assim responde igual: o erro fica no log para quem administra.
    logger.error('Falha ao enviar e-mail de recuperação de senha', { userId: user.id, message: err.message })
  }
}

/** Troca a senha pelo link do e-mail. Derruba todas as sessões abertas. */
async function resetPassword(token, newPassword) {
  const passwordCheck = validatePassword(newPassword)
  if (!passwordCheck.valid) {
    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
  }

  const userId = await consumeLinkToken(token, 'reset_password')
  if (!userId) throw httpError(INVALID_LINK, STATUS.BAD_REQUEST, 'LINK_INVALID')

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await authRepository.updatePassword(userId, hashedPassword)
  // Quem recebeu o link no e-mail provou que o e-mail é dele.
  await authRepository.markEmailVerified(userId)
  logger.info('Senha redefinida pelo e-mail', { userId })
}

/**
 * Troca a senha e devolve um token novo para a sessão atual. O
 * password_changed_at faz o middleware recusar todos os tokens anteriores,
 * derrubando as outras sessões.
 */
async function changePassword(userId, currentPassword, newPassword) {
  const currentHash = await verifyCurrentPassword(userId, currentPassword)

  const passwordCheck = validatePassword(newPassword)
  if (!passwordCheck.valid) {
    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST, passwordCheck.code, passwordCheck.params)
  }

  if (await bcrypt.compare(newPassword, currentHash)) {
    throw httpError('A nova senha precisa ser diferente da atual.', STATUS.BAD_REQUEST, 'PASSWORD_SAME')
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await authRepository.updatePassword(userId, hashedPassword)

  const user = await authRepository.getUserById(userId)

  return { token: issueToken(user), user: toProfile(user) }
}

/**
 * Opções de privacidade. Só altera o que vier no corpo:
 *   isPublic         → biblioteca visível em /u/<usuário>
 *   showInCommunity  → aparecer em "quem mais tem", "em comum" e recomendações
 *                      (só vale com a biblioteca pública)
 *   showActivity     → aceitar seguidores e mostrar atividade a quem foi aprovado
 *   allowIndexing    → biblioteca pública pode aparecer em buscadores
 *                      (só vale com a biblioteca pública; padrão: noindex)
 */
async function setPrivacy(userId, body = {}) {
  const fields = ['isPublic', 'showInCommunity', 'showActivity', 'allowIndexing']
  const provided = fields.filter(field => body[field] !== undefined)

  if (provided.length === 0) {
    throw httpError('Nada para alterar.', STATUS.BAD_REQUEST, 'NOTHING_TO_UPDATE')
  }

  const invalid = provided.find(field => typeof body[field] !== 'boolean')
  if (invalid) {
    throw httpError(`Campo '${invalid}' precisa ser true ou false.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: invalid })
  }

  // Ligar qualquer opção pública exige e-mail confirmado; desligar, sempre pode.
  if (provided.some(field => body[field] === true)) {
    const user = await authRepository.getUserById(userId)
    if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
    if (!user.email_verified_at) {
      throw httpError('Confirme seu e-mail para deixar a biblioteca pública ou participar da comunidade.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_PUBLIC')
    }
  }

  const result = await authRepository.setPrivacy(userId, {
    isPublic: body.isPublic ?? null,
    showInCommunity: body.showInCommunity ?? null,
    showActivity: body.showActivity ?? null,
    allowIndexing: body.allowIndexing ?? null
  })
  if (!result) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')

  return {
    isPublic: result.is_public,
    showInCommunity: result.show_in_community,
    showActivity: result.show_activity,
    allowIndexing: result.allow_indexing
  }
}

/**
 * Avisos por e-mail (opt-in): followEmails liga/desliga os avisos de
 * seguidores; locale é o idioma dos e-mails (o do app quando ligou).
 * Ligar exige e-mail confirmado.
 */
async function setNotifications(userId, body = {}) {
  const { followEmails, locale } = body
  if (followEmails === undefined && locale === undefined) {
    throw httpError('Nada para alterar.', STATUS.BAD_REQUEST, 'NOTHING_TO_UPDATE')
  }
  if (followEmails !== undefined && typeof followEmails !== 'boolean') {
    throw httpError("Campo 'followEmails' precisa ser true ou false.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'followEmails' })
  }
  if (locale !== undefined && !['pt', 'en'].includes(locale)) {
    throw httpError("Campo 'locale' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'locale' })
  }
  if (followEmails === true) {
    const user = await authRepository.getUserById(userId)
    if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
    if (!user.email_verified_at) {
      throw httpError('Confirme seu e-mail para receber avisos.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_NOTIFY')
    }
  }
  const result = await followEmailService.setPreferences(userId, { followEmails, locale })
  if (!result) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return result
}

/** ro•••@gmail.com: o aviso ao e-mail antigo não entrega o endereço novo inteiro. */
function maskEmail(email) {
  const [local, domain] = String(email).split('@')
  return `${local.slice(0, 2)}•••@${domain}`
}

/**
 * Trocar o e-mail: pede a senha, o novo começa sem confirmação (recebe o link)
 * e o endereço antigo recebe um aviso. Opções públicas já ligadas continuam;
 * ligar de novo exige confirmar o e-mail novo.
 */
async function changeEmail(userId, password, newEmail, locale) {
  await verifyCurrentPassword(userId, password)

  const email = typeof newEmail === 'string' ? newEmail.trim() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST, 'EMAIL_INVALID')
  }

  const current = await authRepository.getUserById(userId)
  if (!current) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  if (current.email.toLowerCase() === email.toLowerCase()) {
    throw httpError('Este já é o seu e-mail.', STATUS.BAD_REQUEST, 'EMAIL_SAME')
  }
  if (await authRepository.isEmailTaken(email, userId)) {
    throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT, 'EMAIL_TAKEN')
  }

  let updated
  try {
    updated = await authRepository.updateEmail(userId, email)
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) throw httpError('Este e-mail já está em uso em outra conta.', STATUS.CONFLICT, 'EMAIL_TAKEN')
    throw err
  }

  try {
    await deliverVerification(updated, locale)
  } catch (err) {
    logger.error('Falha ao enviar confirmação do e-mail novo', { userId, message: err.message })
  }
  try {
    const notice = emailChangedEmail({ name: updated.name, link: `${appUrl()}/forgot-password`, locale, newEmail: maskEmail(email) })
    await sendMail({ to: current.email, ...notice })
  } catch (err) {
    logger.error('Falha ao avisar o e-mail antigo', { userId, message: err.message })
  }

  logger.info('E-mail da conta trocado', { userId })
  return toProfile(updated)
}

/**
 * Trocar o nome de usuário (também muda o link /u/<nome>). Mesmas regras do
 * cadastro; não pode repetir o de outra pessoa nem com outras maiúsculas.
 */
async function changeUsername(userId, password, newName) {
  await verifyCurrentPassword(userId, password)

  const name = typeof newName === 'string' ? newName.trim() : ''
  if (!name) throw httpError('Informe o novo nome de usuário.', STATUS.BAD_REQUEST, 'USERNAME_REQUIRED')
  if (name.length > MAX_USERNAME_LENGTH) {
    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'USERNAME_TOO_LONG', { max: MAX_USERNAME_LENGTH })
  }
  if (!USERNAME_PATTERN.test(name)) {
    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST, 'USERNAME_INVALID')
  }
  if (isReservedUsername(name)) {
    throw httpError('Este nome de usuário é reservado. Escolha outro.', STATUS.BAD_REQUEST, 'USERNAME_RESERVED')
  }
  if (await authRepository.isNameTaken(name, userId)) {
    throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT, 'USERNAME_TAKEN')
  }

  let updated
  try {
    updated = await authRepository.updateName(userId, name)
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) throw httpError('Este nome de usuário já está em uso.', STATUS.CONFLICT, 'USERNAME_TAKEN')
    throw err
  }
  if (!updated) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')

  logger.info('Nome de usuário trocado', { userId })
  return { token: issueToken(updated), user: toProfile(updated) }
}

async function deleteAccount(userId, password) {
  await verifyCurrentPassword(userId, password)

  const bookIds = await authRepository.deleteUser(userId)

  // As capas ficam fora do banco. Falha ao apagar um arquivo não desfaz a
  // exclusão da conta; só é registrada.
  const results = await Promise.allSettled(bookIds.map(id => deleteBookCover(id)))
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    logger.warn('Algumas capas não foram removidas na exclusão de conta', { userId, failed })
  }

  logger.info('Conta excluída', { userId, books: bookIds.length })
}

export {
  loginUser,
  registerUser,
  resendVerification,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getUserProfile,
  changePassword,
  changeEmail,
  changeUsername,
  setPrivacy,
  setNotifications,
  deleteAccount,
  USERNAME_PATTERN
}

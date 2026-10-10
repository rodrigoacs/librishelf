import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { validatePassword } from '../utils/passwordPolicy.js'
import { deleteBookCover } from '../utils/imageProcessor.js'
import logger from '../utils/logger.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

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

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function issueToken(user) {
  return jwt.sign({ id: user.id, username: user.name }, SECRET_KEY, { expiresIn: TOKEN_TTL })
}

function toProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isPublic: Boolean(user.is_public)
  }
}

async function verifyCurrentPassword(userId, password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw httpError('Informe a senha atual.', STATUS.BAD_REQUEST)
  }

  const user = await authRepository.getPasswordHashById(userId)
  const isValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)

  if (!user || !isValid) {
    throw httpError('Senha atual incorreta.', STATUS.UNAUTHORIZED)
  }

  return user.password_hash
}

async function loginUser(username, password) {
  if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
    throw httpError('Username and password are required.', STATUS.BAD_REQUEST)
  }

  const user = await authRepository.getUserByUsername(username.trim())

  const isPasswordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)

  if (!user || !isPasswordValid) {
    throw httpError('User or password invalid.', STATUS.UNAUTHORIZED)
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

async function registerUser(username, password, email) {
  if (!isNonEmptyString(username) || !isNonEmptyString(email)) {
    throw httpError('Username, password, and email are required.', STATUS.BAD_REQUEST)
  }

  const cleanUsername = username.trim()
  const cleanEmail = email.trim()

  if (cleanUsername.length > MAX_USERNAME_LENGTH) {
    throw httpError(`O usuário pode ter no máximo ${MAX_USERNAME_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
  }

  // Letras, números, ponto, hífen e sublinhado. Isso também impede "@" (o login
  // aceita usuário OU e-mail no mesmo campo) e barras no link público.
  if (!USERNAME_PATTERN.test(cleanUsername)) {
    throw httpError('O usuário só pode ter letras, números, ponto, hífen e sublinhado.', STATUS.BAD_REQUEST)
  }

  if (!EMAIL_PATTERN.test(cleanEmail)) {
    throw httpError('E-mail inválido.', STATUS.BAD_REQUEST)
  }

  const passwordCheck = validatePassword(password)
  if (!passwordCheck.valid) {
    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
  }

  const existingUser = await authRepository.getUserByUsername(cleanUsername)
  if (existingUser) {
    throw httpError('Username already taken.', STATUS.CONFLICT)
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

  try {
    return toProfile(await authRepository.createUser(cleanUsername, hashedPassword, cleanEmail))
  } catch (err) {
    // Duas requisições simultâneas passam pela checagem acima; a constraint
    // UNIQUE do banco é quem decide, e a violação vira 409 em vez de 500.
    if (err.code === UNIQUE_VIOLATION) {
      throw httpError('Username or email already taken.', STATUS.CONFLICT)
    }
    throw err
  }
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
    throw httpError(passwordCheck.reason, STATUS.BAD_REQUEST)
  }

  if (await bcrypt.compare(newPassword, currentHash)) {
    throw httpError('A nova senha precisa ser diferente da atual.', STATUS.BAD_REQUEST)
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await authRepository.updatePassword(userId, hashedPassword)

  const user = await authRepository.getUserById(userId)

  return { token: issueToken(user), user: toProfile(user) }
}

async function setLibraryVisibility(userId, isPublic) {
  if (typeof isPublic !== 'boolean') {
    throw httpError("Campo 'isPublic' precisa ser true ou false.", STATUS.BAD_REQUEST)
  }

  const result = await authRepository.setVisibility(userId, isPublic)
  if (!result) throw httpError('User not found.', STATUS.NOT_FOUND)

  return { isPublic: result.is_public }
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
  getUserProfile,
  changePassword,
  setLibraryVisibility,
  deleteAccount,
  USERNAME_PATTERN
}

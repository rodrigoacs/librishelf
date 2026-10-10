import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { validatePassword } from '../utils/passwordPolicy.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const SECRET_KEY = process.env.SECRET_KEY
const BCRYPT_ROUNDS = 10
const UNIQUE_VIOLATION = '23505'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_USERNAME_LENGTH = 50

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

async function loginUser(username, password) {
  if (!isNonEmptyString(username) || typeof password !== 'string' || password.length === 0) {
    throw httpError('Username and password are required.', STATUS.BAD_REQUEST)
  }

  const user = await authRepository.getUserByUsername(username.trim())

  const isPasswordValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)

  if (!user || !isPasswordValid) {
    throw httpError('User or password invalid.', STATUS.UNAUTHORIZED)
  }

  const token = jwt.sign({ id: user.id, username: user.name }, SECRET_KEY, { expiresIn: '7d' })

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  }
}

async function getUserProfile(id) {
  const user = await authRepository.getUserById(id)

  if (!user) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email
  }
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

  // O login aceita usuário OU e-mail no mesmo campo; um username com "@" poderia
  // colidir com o e-mail de outra conta.
  if (cleanUsername.includes('@')) {
    throw httpError('O usuário não pode conter "@".', STATUS.BAD_REQUEST)
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
    return await authRepository.createUser(cleanUsername, hashedPassword, cleanEmail)
  } catch (err) {
    // Duas requisições simultâneas passam pela checagem acima; a constraint
    // UNIQUE do banco é quem decide, e a violação vira 409 em vez de 500.
    if (err.code === UNIQUE_VIOLATION) {
      throw httpError('Username or email already taken.', STATUS.CONFLICT)
    }
    throw err
  }
}

export { loginUser, registerUser, getUserProfile }

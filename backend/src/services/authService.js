import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { validatePassword } from '../utils/passwordPolicy.js'
import bcryptjs from 'bcryptjs'
import jwt from 'jsonwebtoken'

const SECRET_KEY = process.env.SECRET_KEY

async function loginUser(username, password) {
  const user = await authRepository.getUserByUsername(username)

  const validUser = user || {}
  const isPasswordValid = await bcryptjs.compare(password, validUser.password_hash || "")

  if (!user || !isPasswordValid) {
    const error = new Error('User or password invalid.')
    error.status = STATUS.UNAUTHORIZED
    throw error
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' })

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
  const passwordCheck = validatePassword(password)
  if (!passwordCheck.valid) {
    const error = new Error(passwordCheck.reason)
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  const existingUser = await authRepository.getUserByUsername(username)
  if (existingUser) {
    const error = new Error('Username already taken.')
    error.status = STATUS.CONFLICT
    throw error
  }

  const hashedPassword = await bcryptjs.hash(password, 10)
  const user = await authRepository.createUser(username, hashedPassword, email)

  return user
}

export { loginUser, registerUser, getUserProfile }
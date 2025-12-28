import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
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

  const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' })
  return token
}

async function registerUser(username, password, email) {
  const existingUser = await authRepository.getUserByUsername(username)
  if (existingUser) {
    const error = new Error('Username already taken.')
    error.status = STATUS.CONFLICT
    throw error
  }

  const hashedPassword = await bcryptjs.hash(password, 10)
  const user = await authRepository.createUser( username, hashedPassword, email )

  return user
}

export { loginUser, registerUser }
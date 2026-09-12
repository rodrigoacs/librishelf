import express from 'express'
import * as authService from '../services/authService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js'
import { authenticateToken } from '../middlewares/auth.js'
import { AUTH_COOKIE_NAME, authCookieOptions } from '../config/cookieOptions.js'

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body

    const result = await authService.loginUser(username, password)

    res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions)
    res.status(STATUS.OK).json({ user: result.user })

  } catch (error) {
    sendError(res, error, 'Erro no login')
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions, maxAge: undefined })
  res.status(STATUS.OK).json({ message: 'Logout realizado com sucesso' })
})

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getUserProfile(req.user.id)

    if (!user) {
      const error = new Error('User not found.')
      error.status = STATUS.NOT_FOUND
      throw error
    }

    res.status(STATUS.OK).json({ user })
  } catch (error) {
    sendError(res, error, 'Erro ao buscar usuário')
  }
})

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body

    if (!username || !password || !email) {
      const error = new Error('Username, password, and email are required.')
      error.status = STATUS.BAD_REQUEST
      throw error
    }

    const user = await authService.registerUser(username, password, email)

    res.status(STATUS.CREATED).json({ message: 'User registered successfully', user })
  } catch (error) {
    sendError(res, error, 'Erro no registro')
  }
})

export default router
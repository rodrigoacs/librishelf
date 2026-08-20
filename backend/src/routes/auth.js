import express from 'express'
import * as authService from '../services/authService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body

    const result = await authService.loginUser(username, password)

    res.status(STATUS.OK).json(result)

  } catch (error) {
    sendError(res, error, 'Erro no login')
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
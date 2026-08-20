import express from 'express'
import * as authService from '../services/authService.js'
import STATUS from '../utils/statusCodes.js'
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body

    const result = await authService.loginUser(username, password)

    res.status(STATUS.OK).json(result)

  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
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
    res.status(error.status || 500).json({ error: error.message })
  }
})

export default router
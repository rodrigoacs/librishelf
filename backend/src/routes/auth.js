import express from 'express'
import * as authService from '../services/authService.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

// POST: Login de usuário
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    const result = await authService.loginUser(username, password)

    res.status(STATUS.OK).json(result)

  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// POST: Registro de novo usuário
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body

  if (!username || !password || !email) {
    const error = new Error('Username, password, and email are required.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  const user = await authService.registerUser(username, password, email)

  res.status(STATUS.CREATED).json({ message: 'User registered successfully', user })
})

export default router
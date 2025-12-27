import express from 'express'
import * as authService from '../services/authService.js'
import catchAsync from '../utils/catchAsync.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

// POST: Login de usuário
router.post('/login', catchAsync(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    const error = new Error('Username and password are required.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  const token = await authService.loginUser(username, password)

  res.status(STATUS.OK).json({ message: 'Login successful', token })
}))

// POST: Registro de novo usuário
router.post('/register', catchAsync(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    const error = new Error('Username and password are required.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  const user = await authService.registerUser(username, password)

  res.status(STATUS.CREATED).json({ message: 'User registered successfully', user })
}))

export default router
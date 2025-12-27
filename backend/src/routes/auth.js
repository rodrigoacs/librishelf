import * as authService from '../services/authService.js'
import catchAsync from '../utils/catchAsync.js'
import express from 'express'

const router = express.Router()

// POST: Login de usuário
router.post('/login', catchAsync(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    const error = new Error('Username and password are required.')
    error.status = 400
    throw error
  }

  const token = await authService.loginUser(username, password)

  res.status(200).json({ message: 'Login successful', token })
}))

// POST: Registro de novo usuário
router.post('/register', catchAsync(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    const error = new Error('Username and password are required.')
    error.status = 400
    throw error
  }

  const user = await authService.registerUser(username, password)

  res.status(201).json({ message: 'User registered successfully', user })
}))

export default router
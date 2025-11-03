import * as authService from '../services/authService.js'
import express from 'express'

const router = express.Router()

router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    const token = await authService.loginUser(username, password)
    res.status(200).json({ message: 'Login successful', token })

  } catch (err) {

    if (err.message === 'User or password invalid.') {
      return res.status(401).json({ error: err.message })
    }

    console.error(err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

router.post('/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    const user = await authService.registerUser(username, password)
    res.status(201).json({ message: 'User registered successfully', user })

  } catch (err) {

    if (err.message === 'Username already taken.') {
      return res.status(409).json({ error: err.message })
    }

    console.error(err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router
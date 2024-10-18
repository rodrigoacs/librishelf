import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getUserByUsernameQuery } from '../database/queries.js'
import express from 'express'

const router = express.Router()
const SECRET_KEY = process.env.SECRET_KEY

router.post('/', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    const user = await getUserByUsernameQuery(username)

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password.' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid username or password.' })
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' })
    res.status(200).json({ message: 'Login successful', token })
  } catch (err) {
    res.status(500).json({ error: 'Error logging in the user.' })
    console.log(err)
  }
})

export default router

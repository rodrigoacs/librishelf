import bcrypt from 'bcrypt'
import { addUserQuery } from '../database/queries.js' // Assume this handles adding users to DB
import express from 'express'

const router = express.Router()

router.post('/', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    await addUserQuery({ username, password: hashedPassword })
    res.status(201).json({ message: 'User registered successfully.' })
  } catch (err) {
    res.status(500).json({ error: 'Error registering the user.' })
    console.log(err)

  }
})

export default router

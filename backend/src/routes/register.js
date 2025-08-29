import bcryptjs from 'bcryptjs'
import { addUserQuery } from '../database/queries.js' // Assume this handles adding users to DB
import express from 'express'

const router = express.Router()

router.post('/', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  try {
    const hashedPassword = await bcryptjs.hash(password, 10)
    await addUserQuery({ username, password: hashedPassword })

    console.log('User registered successfully:', username)
    res.status(201).json({ message: 'User registered successfully.' })
  } catch (err) {
    console.error('Error occurred:', err)
    res.status(500).json({ error: 'Error registering the user.', msg: err.message })
  }
})


export default router

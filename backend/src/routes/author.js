import * as authorService from '../services/authorService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  const { publishers } = req.query

  const authors = await authorService.listAuthors(publishers)

  res.status(200).json(authors)
})

export default router
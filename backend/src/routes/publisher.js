import * as publisherService from '../services/publisherService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  const { authors } = req.query

  const publishers = await publisherService.listPublishers(authors)

  res.status(200).json(publishers)
})

export default router
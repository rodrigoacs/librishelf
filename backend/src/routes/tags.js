import express from 'express'
import { db } from '../database/connection.js'
import { TAG_QUERIES } from '../database/queries.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const result = await db.query(TAG_QUERIES.GET_ALL_TAGS, [userId])

    res.status(STATUS.OK).json(result.rows)
  } catch (error) {
    console.error('Error fetching tags:', error)
    res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch tags' })
  }
})

export default router
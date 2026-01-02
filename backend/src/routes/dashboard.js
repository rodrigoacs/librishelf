import express from 'express'
import * as dashboardService from '../services/dashboardService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/stats', async (req, res) => {
  try {
    const stats = await dashboardService.getStats(req.user.id)
    res.status(STATUS.OK).json(stats)
  } catch (error) {
    console.error('Dashboard Error:', error)
    res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
})

export default router
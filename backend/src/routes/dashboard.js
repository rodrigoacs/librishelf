import express from 'express'
import * as dashboardService from '../services/dashboardService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/stats', async (req, res) => {
  try {
    const stats = await dashboardService.getStats(req.user.id)
    res.status(STATUS.OK).json(stats)
  } catch (error) {
    sendError(res, error, 'Dashboard Error')
  }
})

export default router
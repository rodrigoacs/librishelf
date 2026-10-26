import express from 'express'
import * as dashboardService from '../services/dashboardService.js'
import * as yearService from '../services/yearService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import { track } from '../utils/metrics.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/stats', async (req, res) => {
  try {
    const stats = await dashboardService.getStats(req.user.id, req.query.year)
    res.status(STATUS.OK).json(stats)
  } catch (error) {
    sendError(res, error, 'Dashboard Error')
  }
})

// "Seu ano em livros" (retrospectiva): GET /dashboard/year/2026?current=2026
// (current: o ano no aparelho da pessoa, para "ano corrente" e "até agora")
router.get('/year/:year', track('year.view'), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await yearService.yearInBooks(req.user.id, req.params.year, req.query.current))
  } catch (error) {
    sendError(res, error, 'Erro ao montar a retrospectiva')
  }
})

// Meta anual: PUT /dashboard/goal { year, target } · DELETE /dashboard/goal/2026
router.put('/goal', async (req, res) => {
  try {
    const goal = await dashboardService.setGoal(req.user.id, req.body?.year, req.body?.target)
    res.status(STATUS.OK).json(goal)
  } catch (error) {
    sendError(res, error, 'Erro ao salvar a meta')
  }
})

router.delete('/goal/:year', async (req, res) => {
  try {
    await dashboardService.removeGoal(req.user.id, req.params.year)
    res.status(STATUS.NO_CONTENT).end()
  } catch (error) {
    sendError(res, error, 'Erro ao remover a meta')
  }
})

export default router
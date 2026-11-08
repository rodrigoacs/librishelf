import express from 'express'
import { cspReportLimiter } from '../middlewares/rateLimiter.js'
import * as cspReportService from '../services/cspReportService.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

// O navegador manda application/csp-report (report-uri) ou
// application/reports+json (report-to), que o express.json global ignora
const parseReport = express.json({
  type: ['application/csp-report', 'application/reports+json', 'application/json'],
  limit: '32kb'
})

/**
 * POST /csp-report → 204, sempre (o navegador não faz nada com a resposta).
 * Sem login: os relatórios chegam também de páginas públicas.
 */
router.post('/', cspReportLimiter, parseReport, (req, res) => {
  cspReportService.record(req.body)
  res.status(STATUS.NO_CONTENT).end()
})

// JSON inválido ou corpo grande: descarta sem barulho
router.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(STATUS.NO_CONTENT).end()
  }
  next(err)
})

export default router

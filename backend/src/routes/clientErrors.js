import express from 'express'
import { clientErrorLimiter } from '../middlewares/rateLimiter.js'
import * as errorReportService from '../services/errorReportService.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

/**
 * POST /client-errors → 204, sempre. Sem login (a página pública também
 * manda) e sem guardar quem mandou: o corpo vai limpo para error_reports.
 * text/plain também vale (navigator.sendBeacon ao fechar a página).
 */
router.post('/', clientErrorLimiter, express.text({ type: 'text/plain', limit: '16kb' }), (req, res) => {
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  void errorReportService.recordClient(body)
  res.status(STATUS.NO_CONTENT).end()
})

export default router

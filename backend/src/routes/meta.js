import express from 'express'
import { metaLimiter } from '../middlewares/rateLimiter.js'
import * as metaService from '../services/metaService.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * GET /meta/u/:username → trecho HTML para o <head> de /u/<usuário>.
 * Quem chama é o nginx do frontend (SSI, location interna /__meta/). Em erro
 * responde 500 e o nginx usa o trecho padrão (noindex).
 */
router.get('/u/:username', metaLimiter, async (req, res) => {
  try {
    const head = await metaService.libraryHead(req.params.username)
    res.set('Cache-Control', 'no-store')
    res.type('html').send(head)
  } catch (error) {
    logger.error('Erro ao montar meta da biblioteca pública', { error: error.message })
    res.status(500).type('html').send('')
  }
})

export default router

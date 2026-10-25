import express from 'express'
import { metaLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
import * as metaService from '../services/metaService.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * GET /meta/u/:username → trecho HTML para o <head> de /u/<usuário> (robots
 * e Open Graph). Quem chama é o nginx do frontend (SSI, location interna
 * /__meta/). Em erro responde 500 e o nginx usa o trecho padrão (noindex +
 * tags genéricas).
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

/**
 * GET /meta/u/:username/image.jpg → mosaico das capas (og:image, 1200×630).
 * Público (quem busca é o WhatsApp, Facebook…). A URL leva ?v= com a versão
 * da estante, então dá para guardar em cache por bastante tempo.
 */
router.get('/u/:username/image.jpg', publicLimiter, async (req, res) => {
  try {
    const image = await metaService.libraryImage(req.params.username)
    if (!image) return res.status(404).type('text').send('Not found')
    res.set('Cache-Control', 'public, max-age=86400')
    res.set('ETag', `"${image.version}"`)
    res.type('jpeg').send(image.buffer)
  } catch (error) {
    logger.error('Erro ao montar a imagem da prévia', { error: error.message })
    res.status(500).type('text').send('')
  }
})

export default router

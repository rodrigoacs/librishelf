import express from 'express'
import { resolveSession } from '../middlewares/auth.js'
import * as personalizationService from '../services/personalizationService.js'
import { PROFILE_COVER_DIR } from '../utils/imageProcessor.js'
import logger from '../utils/logger.js'

/**
 * Capa de fundo enviada (Pro: personalization): /profile-covers/{usuário}/cover.{avif|jpg}?v={versão}
 *
 * Mesma regra do perfil: biblioteca pública → qualquer um vê (cache público
 * curto); privada → só a dona, pelo cookie (cache privado). O resto (sem
 * imagem, conta inativa, usuário inexistente) → 404, sem dizer o porquê.
 */
const router = express.Router()

const FILE = /^cover\.(avif|jpg)$/
const CONTENT_TYPES = { avif: 'image/avif', jpg: 'image/jpeg' }

function notFound(res) {
  res.status(404).type('text/plain').send('Not found')
}

router.get('/:username/:file', async (req, res, next) => {
  const match = FILE.exec(req.params.file)
  if (!match) return notFound(res)
  try {
    const { user } = await resolveSession(req)
    const access = await personalizationService.imageAccess(req.params.username, user?.id ?? null)
    if (!access) return notFound(res)
    const ext = match[1]
    res.sendFile(`${access.userId}.${ext}`, {
      root: PROFILE_COVER_DIR,
      dotfiles: 'deny',
      headers: {
        'Cache-Control': access.public ? 'public, max-age=600' : 'private, max-age=600',
        'Content-Type': CONTENT_TYPES[ext],
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Cookie, Authorization'
      }
    }, err => {
      if (!err) return
      if (err.code === 'ENOENT' || err.status === 404) {
        if (!res.headersSent) notFound(res)
        return
      }
      if (err.code === 'ECONNABORTED' || res.headersSent) return
      logger.warn('Falha ao enviar capa de perfil', { userId: access.userId, message: err.message })
      next(err)
    })
  } catch (err) {
    next(err)
  }
})

export default router

import express from 'express'
import { resolveSession, authenticateToken } from '../middlewares/auth.js'
import { reportLimiter } from '../middlewares/rateLimiter.js'
import * as avatarService from '../services/avatarService.js'
import { AVATAR_DIR } from '../utils/imageProcessor.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import logger from '../utils/logger.js'

/**
 * Fotos de perfil: /avatars/{usuário}/{sm|lg}.{avif|jpg}?v={versão}
 *
 * Quem pode ver é decidido aqui a cada pedido (avatarService.fileAccess),
 * com a mesma regra dos dados da API: foto para todos → cache público curto;
 * só seguidores ou só a pessoa → cache privado; quem não pode ver (ou foto
 * ocultada por denúncia, conta suspensa, usuário inexistente) → 404, sem
 * dizer se a pessoa tem foto. O ?v= só fura o cache quando a foto muda.
 */
const router = express.Router()

const FILE = /^(sm|lg)\.(avif|jpg)$/
const CONTENT_TYPES = { avif: 'image/avif', jpg: 'image/jpeg' }

function notFound(res) {
  res.status(404).type('text/plain').send('Not found')
}

export function sendAvatarFile(res, next, userId, size, ext, cacheControl) {
  res.sendFile(`${userId}-${size}.${ext}`, {
    root: AVATAR_DIR,
    dotfiles: 'deny',
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': CONTENT_TYPES[ext],
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie, Authorization'
    }
  }, (err) => {
    if (!err) return
    if (err.code === 'ENOENT' || err.status === 404) {
      if (!res.headersSent) notFound(res)
      return
    }
    if (err.code === 'ECONNABORTED' || res.headersSent) return
    logger.warn('Falha ao enviar foto de perfil', { userId, message: err.message })
    next(err)
  })
}

router.get('/:username/:file', async (req, res, next) => {
  const match = FILE.exec(req.params.file)
  if (!match) return notFound(res)
  try {
    const { user } = await resolveSession(req)
    const access = await avatarService.fileAccess(req.params.username, user?.id ?? null)
    if (!access) return notFound(res)
    const cache = access.public && user?.id !== access.userId ? 'public, max-age=600' : 'private, max-age=600'
    sendAvatarFile(res, next, access.userId, match[1], match[2], cache)
  } catch (err) {
    next(err)
  }
})

// Denunciar a foto: { reason: offensive | impersonation | spam | other, note? }
router.post('/:username/report', reportLimiter, authenticateToken, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await avatarService.report(req.params.username, req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao denunciar foto')
  }
})

export default router

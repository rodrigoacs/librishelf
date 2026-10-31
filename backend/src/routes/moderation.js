import express from 'express'
import { tokenLimiter } from '../middlewares/rateLimiter.js'
import * as reviewService from '../services/reviewService.js'
import * as avatarService from '../services/avatarService.js'
import { sendAvatarFile } from './avatars.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Moderação de resenha pelo link do e-mail de denúncia (vai para
 * ADMIN_EMAIL). Sem login: o token assinado identifica a resenha e só vale
 * para ela. GET mostra; POST oculta ou mantém.
 */
const router = express.Router()

router.get('/review', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.forModeration(String(req.query.token ?? '')))
  } catch (error) {
    sendError(res, error, 'Erro ao abrir moderação')
  }
})

router.post('/review/hide', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), true))
  } catch (error) {
    sendError(res, error, 'Erro ao ocultar resenha')
  }
})

router.post('/review/show', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), false))
  } catch (error) {
    sendError(res, error, 'Erro ao reexibir resenha')
  }
})

// Foto de perfil denunciada (link do e-mail: ?avatar=<token> no app)
router.get('/avatar', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await avatarService.forModeration(String(req.query.token ?? '')))
  } catch (error) {
    sendError(res, error, 'Erro ao abrir moderação')
  }
})

for (const action of ['keep', 'remove']) {
  router.post(`/avatar/${action}`, tokenLimiter, async (req, res) => {
    try {
      res.status(STATUS.OK).json(await avatarService.moderate(String(req.query.token ?? ''), action))
    } catch (error) {
      sendError(res, error, 'Erro ao moderar foto')
    }
  })
}

// A foto em si, mesmo ocultada (o token só vale para a versão denunciada)
router.get('/avatar/image', tokenLimiter, async (req, res, next) => {
  try {
    const access = await avatarService.moderationFileAccess(String(req.query.token ?? ''))
    if (!access) return res.status(404).type('text/plain').send('Not found')
    sendAvatarFile(res, next, access.userId, 'lg', 'jpg', 'private, no-store')
  } catch (err) {
    next(err)
  }
})

export default router

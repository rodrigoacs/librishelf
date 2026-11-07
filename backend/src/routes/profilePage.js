import express from 'express'
import * as profilePageService from '../services/profilePageService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { reportLimiter } from '../middlewares/rateLimiter.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Página pública (pacote 33): o dono edita apresentação e favoritos; quem
 * visita pode denunciar a apresentação.
 *   GET  /profile-page                       { bio, bioHidden, favorites }
 *   PUT  /profile-page/bio                   { bio: string | null }
 *   PUT  /profile-page/favorites             { bookIds: number[] }
 *   POST /profile-page/u/:username/bio/report { reason, note? }
 */
const router = express.Router()

const handle = (message, fn) => async (req, res) => {
  try {
    res.status(STATUS.OK).json(await fn(req))
  } catch (error) {
    sendError(res, error, message)
  }
}

router.post('/u/:username/bio/report', reportLimiter, authenticateToken,
  handle('Erro ao denunciar apresentação', req => profilePageService.reportBio(req.params.username, req.user.id, req.body ?? {})))

router.use(authenticateToken)
router.get('/', handle('Erro ao carregar a página pública', req => profilePageService.get(req.user.id)))
router.put('/bio', handle('Erro ao salvar a apresentação', req => profilePageService.setBio(req.user.id, req.body ?? {})))
router.put('/favorites', handle('Erro ao salvar os favoritos', req => profilePageService.setFavorites(req.user.id, req.body ?? {})))

export default router

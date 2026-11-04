import express from 'express'
import * as personalizationService from '../services/personalizationService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { requireProForWrites } from '../middlewares/requirePro.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Personalização (pacote 29).
 *   GET    /personalization          o que está escolhido (sempre visível)
 *   GET    /personalization/covers   livros com capa (para a capa de fundo)
 *   PUT    /personalization          muda (Pro: requireProForWrites)
 *   DELETE /personalization/:item    volta ao padrão grátis (sem Pro também)
 */
const router = express.Router()
router.use(authenticateToken)

const handle = (context, task) => async (req, res) => {
  try {
    res.status(STATUS.OK).json(await task(req))
  } catch (error) {
    sendError(res, error, context)
  }
}

router.get('/', handle('Erro ao abrir a personalização', req => personalizationService.get(req.user.id)))
router.get('/covers', handle('Erro ao listar as capas', req => personalizationService.covers(req.user.id)))

// Escrita do Pro só no PUT: o DELETE (voltar ao padrão) fica de fora do
// requireProForWrites de propósito, porque não usa nada do Pro
router.put('/', requireProForWrites('personalization'), handle('Erro ao salvar a personalização',
  req => personalizationService.update(req.user.id, req.body)))
router.delete('/:item', handle('Erro ao voltar ao padrão',
  req => personalizationService.reset(req.user.id, req.params.item)))

export default router

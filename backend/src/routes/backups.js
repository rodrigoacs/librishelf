import express from 'express'
import * as backupService from '../services/backupService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { requireProForWrites } from '../middlewares/requirePro.js'
import { validateNumericId } from '../middlewares/validateId.js'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Backup automático (pacote 30). Ler, baixar e excluir: sempre (sem Pro
 * também; o que é da pessoa nunca fica preso). Mudar e pedir agora: Pro
 * (auto_backup).
 */
const router = express.Router()
router.use(authenticateToken)

const pro = requireProForWrites('auto_backup')

const id = validateNumericId()

router.get('/', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await backupService.state(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao abrir os backups')
  }
})

router.put('/settings', pro, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await backupService.saveSettings(req.user.id, req.body))
  } catch (error) {
    sendError(res, error, 'Erro ao salvar o backup automático')
  }
})

router.post('/run', pro, async (req, res) => {
  try {
    res.status(202).json(await backupService.requestNow(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao pedir o backup')
  }
})

router.get('/:id/download', id, async (req, res) => {
  try {
    const { file, filename } = await backupService.download(req.user.id, Number(req.params.id))
    res.set('Cache-Control', 'private, no-store')
    res.type('application/gzip').attachment(filename).sendFile(file, err => {
      if (err && !res.headersSent) res.status(STATUS.NOT_FOUND).json(errorBody('Backup não encontrado.', 'BACKUP_NOT_FOUND'))
    })
  } catch (error) {
    sendError(res, error, 'Erro ao baixar o backup')
  }
})

router.delete('/:id', id, async (req, res) => {
  try {
    await backupService.remove(req.user.id, Number(req.params.id))
    res.status(STATUS.NO_CONTENT).end()
  } catch (error) {
    sendError(res, error, 'Erro ao excluir o backup')
  }
})

export default router

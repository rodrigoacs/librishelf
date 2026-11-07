import express from 'express'
import multer from 'multer'
import * as collectionService from '../services/collectionService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { requireProForWrites } from '../middlewares/requirePro.js'
import { validateNumericId } from '../middlewares/validateId.js'
import { uploadLimiter } from '../middlewares/rateLimiter.js'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Coleção (pacote 28).
 *   Grátis: /collection/loans…, /collection/books/:id/loan (empréstimo básico)
 *   Pro (collector), só a escrita: exemplar, enviar foto e lembrete por e-mail.
 *   Sem Pro, tudo continua visível (GET), nada é apagado sozinho e a pessoa
 *   ainda pode excluir as próprias fotos.
 */
const router = express.Router()
router.use(authenticateToken)

const collector = requireProForWrites('collector')
const id = validateNumericId()
const loanId = validateNumericId('loanId')
const photoId = validateNumericId('photoId')

const MAX_PHOTO_MB = 10
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * MAX_PHOTO_MB, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Apenas arquivos de imagem são permitidos.'))
    cb(null, true)
  }
})

function photoField(req, res, next) {
  photoUpload.single('photo')(req, res, err => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(STATUS.BAD_REQUEST).json(errorBody(`A imagem pode ter no máximo ${MAX_PHOTO_MB} MB.`, 'IMAGE_TOO_LARGE', { max: MAX_PHOTO_MB }))
    }
    if (err instanceof multer.MulterError) return res.status(STATUS.BAD_REQUEST).json(errorBody('Envio inválido.', 'UPLOAD_INVALID'))
    return res.status(STATUS.BAD_REQUEST).json(errorBody(err.message, 'IMAGE_ONLY'))
  })
}

// Rota → serviço, com o status de sucesso e o contexto do log
const handle = (context, task, status = STATUS.OK) => async (req, res) => {
  try {
    const result = await task(req)
    if (status === STATUS.NO_CONTENT) return res.status(status).end()
    res.status(status).json(result)
  } catch (error) {
    sendError(res, error, context)
  }
}

const num = value => Number(value)

// --- Visão geral e lista de empréstimos
router.get('/summary', handle('Erro ao resumir a coleção', req => collectionService.summary(req.user.id)))
router.get('/loans', handle('Erro ao listar empréstimos', req => collectionService.listLoans(req.user.id, req.query.status)))

// --- Um livro
router.get('/books/:id', id, handle('Erro ao abrir a coleção do livro',
  req => collectionService.bookCollection(req.user.id, num(req.params.id))))

// Empréstimo básico: grátis
router.post('/books/:id/loan', id, handle('Erro ao registrar o empréstimo',
  req => collectionService.lend(req.user.id, num(req.params.id), req.body), STATUS.CREATED))
router.patch('/loans/:loanId', loanId, handle('Erro ao mudar o empréstimo',
  req => collectionService.updateLoan(req.user.id, num(req.params.loanId), req.body)))
router.post('/loans/:loanId/return', loanId, handle('Erro ao registrar a devolução',
  req => collectionService.returnLoan(req.user.id, num(req.params.loanId), req.body)))
router.delete('/loans/:loanId', loanId, handle('Erro ao excluir o empréstimo',
  req => collectionService.deleteLoan(req.user.id, num(req.params.loanId)), STATUS.NO_CONTENT))

// Pro: lembrete por e-mail, exemplar e enviar foto
router.put('/loans/:loanId/reminder', loanId, collector, handle('Erro ao mudar o lembrete',
  req => collectionService.setReminder(req.user.id, num(req.params.loanId), req.body?.remind)))
router.put('/books/:id/copy', id, collector, handle('Erro ao salvar o exemplar',
  req => collectionService.saveCopy(req.user.id, num(req.params.id), req.body)))
router.post('/books/:id/photos', id, collector, uploadLimiter, photoField, handle('Erro ao enviar a foto',
  req => collectionService.addPhoto(req.user.id, num(req.params.id), req.file), STATUS.CREATED))
// Excluir foto: grátis (o que é da pessoa nunca fica preso)
router.delete('/books/:id/photos/:photoId', id, photoId, handle('Erro ao excluir a foto',
  req => collectionService.deletePhoto(req.user.id, num(req.params.id), num(req.params.photoId)), STATUS.NO_CONTENT))

// Foto: só para a dona do livro (?size=sm|lg)
router.get('/books/:id/photos/:photoId', id, photoId, async (req, res) => {
  try {
    const file = await collectionService.photoFile(req.user.id, num(req.params.id), num(req.params.photoId), req.query.size || 'lg')
    res.set('Cache-Control', 'private, max-age=31536000, immutable')
    res.type('jpeg').sendFile(file, err => {
      if (err && !res.headersSent) res.status(STATUS.NOT_FOUND).json(errorBody('Foto não encontrada.', 'PHOTO_NOT_FOUND'))
    })
  } catch (error) {
    sendError(res, error, 'Erro ao abrir a foto')
  }
})

export default router

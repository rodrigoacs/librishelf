import express from 'express'
import multer from 'multer'
import * as personalizationService from '../services/personalizationService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { requireProForWrites } from '../middlewares/requirePro.js'
import { uploadLimiter } from '../middlewares/rateLimiter.js'
import { errorBody } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Personalização (pacote 29).
 *   GET    /personalization          o que está escolhido (sempre visível)
 *   GET    /personalization/covers   livros com capa (para a capa de fundo)
 *   PUT    /personalization              muda (Pro: requireProForWrites)
 *   PUT    /personalization/cover-image  imagem qualquer como capa de fundo (Pro)
 *   DELETE /personalization/:item        volta ao padrão grátis (sem Pro também)
 */
const router = express.Router()
router.use(authenticateToken)

const MAX_COVER_MB = 10
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * MAX_COVER_MB, files: 1, fields: 2 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Apenas arquivos de imagem são permitidos.'))
    cb(null, true)
  }
})

function coverField(req, res, next) {
  coverUpload.single('image')(req, res, err => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(STATUS.BAD_REQUEST).json(errorBody(`A imagem pode ter no máximo ${MAX_COVER_MB} MB.`, 'IMAGE_TOO_LARGE', { max: MAX_COVER_MB }))
    }
    if (err instanceof multer.MulterError) return res.status(STATUS.BAD_REQUEST).json(errorBody('Envio inválido.', 'UPLOAD_INVALID'))
    return res.status(STATUS.BAD_REQUEST).json(errorBody(err.message, 'IMAGE_ONLY'))
  })
}

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
router.put('/cover-image', requireProForWrites('personalization'), uploadLimiter, coverField,
  handle('Erro ao enviar a capa do perfil', req => personalizationService.uploadCoverImage(req.user.id, req.file)))
router.delete('/:item', handle('Erro ao voltar ao padrão',
  req => personalizationService.reset(req.user.id, req.params.item)))

export default router

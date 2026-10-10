import express from 'express'
import UPLOAD_DIR from '../config/uploadDir.js'
import { resolveSession } from '../middlewares/auth.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import logger from '../utils/logger.js'

/**
 * Capas dos livros: /uploads/{id}.avif e /uploads/{id}.jpg.
 *
 * Antes eram servidas como arquivos estáticos, e qualquer pessoa abria a capa
 * de uma biblioteca privada trocando o número na URL. Agora:
 *   - biblioteca pública → qualquer um vê (cache público curto)
 *   - biblioteca privada → só o dono, pelo cookie de sessão (cache privado)
 *   - o resto (outro usuário, anônimo, livro inexistente, nome inválido) → 404,
 *     sem revelar se o livro existe
 *
 * O <img> manda o cookie sozinho (mesmo domínio), então o frontend não muda.
 */
const router = express.Router()

const COVER_FILE = /^(\d{1,10})\.(avif|jpg)$/
const CONTENT_TYPES = { avif: 'image/avif', jpg: 'image/jpeg' }

// Curto de propósito: tornar a biblioteca privada passa a valer em minutos,
// mesmo para quem já tinha a capa no cache do navegador.
const PUBLIC_CACHE = 'public, max-age=600'
const PRIVATE_CACHE = 'private, max-age=600'

function notFound(res) {
  res.status(404).type('text/plain').send('Not found')
}

router.get('/:file', async (req, res, next) => {
  const match = COVER_FILE.exec(req.params.file)
  if (!match) return notFound(res)

  const [, id, ext] = match

  try {
    const access = await libraryRepository.getCoverAccess(Number(id))
    if (!access) return notFound(res)

    let cacheControl = PUBLIC_CACHE
    if (!access.is_public) {
      const { user } = await resolveSession(req)
      if (!user || user.id !== access.user_id) return notFound(res)
      cacheControl = PRIVATE_CACHE
    }

    res.sendFile(match[0], {
      root: UPLOAD_DIR,
      dotfiles: 'deny',
      headers: {
        'Cache-Control': cacheControl,
        'Content-Type': CONTENT_TYPES[ext],
        'X-Content-Type-Options': 'nosniff',
        // A resposta muda conforme quem pede (dono ou não).
        Vary: 'Cookie, Authorization'
      }
    }, (err) => {
      if (!err) return
      if (err.code === 'ENOENT' || err.status === 404) {
        if (!res.headersSent) notFound(res)
        return
      }
      if (err.code === 'ECONNABORTED' || res.headersSent) return
      logger.warn('Falha ao enviar capa', { file: match[0], message: err.message })
      next(err)
    })
  } catch (err) {
    next(err)
  }
})

export default router

import express from 'express'
import { tokenLimiter } from '../middlewares/rateLimiter.js'
import { readSignedId } from '../utils/signedToken.js'
import * as followEmailService from '../services/followEmailService.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

/**
 * Descadastro dos avisos por e-mail, sem login (o token identifica a pessoa).
 *
 * POST /email/unsubscribe?token=… — é a URL do cabeçalho List-Unsubscribe: o
 * Gmail/Apple Mail fazem um POST nela com "List-Unsubscribe=One-Click" no
 * corpo (RFC 8058). Também é o que a página /unsubscribe do app chama.
 * Responde 200 sem redirecionar. GET não descadastra (antivírus e prévias de
 * link abrem URLs sozinhos): quem abre o link pelo navegador cai na página do app.
 */
function userFromToken(req) {
  return readSignedId(followEmailService.UNSUBSCRIBE_PURPOSE, String(req.query.token ?? req.body?.token ?? ''))
}

function invalidToken(res) {
  return res.status(STATUS.BAD_REQUEST).json(errorBody('Link de descadastro inválido.', 'UNSUBSCRIBE_TOKEN_INVALID'))
}

router.post('/unsubscribe', tokenLimiter, async (req, res) => {
  try {
    const userId = userFromToken(req)
    if (!userId) return invalidToken(res)
    await followEmailService.setPreferences(userId, { followEmails: false })
    res.status(STATUS.OK).json({ followEmails: false })
  } catch (error) {
    sendError(res, error, 'Erro ao descadastrar dos avisos')
  }
})

// "Desfazer" na página do app, logo depois de descadastrar
router.post('/resubscribe', tokenLimiter, async (req, res) => {
  try {
    const userId = userFromToken(req)
    if (!userId) return invalidToken(res)
    await followEmailService.setPreferences(userId, { followEmails: true })
    res.status(STATUS.OK).json({ followEmails: true })
  } catch (error) {
    sendError(res, error, 'Erro ao reativar os avisos')
  }
})

export default router

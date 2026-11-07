import express from 'express'
import { sendAvatarFile } from './avatars.js'
import { authenticateToken } from '../middlewares/auth.js'
import { requireAdmin, requireUnlocked, isUnlocked, setUnlockCookie, clearUnlockCookie, ADMIN_UNLOCK_MINUTES } from '../middlewares/admin.js'
import { sensitiveLimiter, mailLimiter } from '../middlewares/rateLimiter.js'
import { validateNumericId } from '../middlewares/validateId.js'
import { verifyCurrentPassword } from '../services/authService.js'
import * as adminService from '../services/adminService.js'
import * as billing from '../services/adminBillingService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Área administrativa (só role = 'admin'). Fluxo:
 *   GET  /admin/session  → { unlocked, minutes }
 *   POST /admin/unlock   → { password }: libera por 30 min sem uso
 *   POST /admin/lock     → bloqueia de novo
 * As demais rotas pedem a liberação (ADMIN_LOCKED quando expirou).
 */
const router = express.Router()

router.use(authenticateToken, requireAdmin)

router.get('/session', (req, res) => {
  res.status(STATUS.OK).json({ unlocked: isUnlocked(req), minutes: ADMIN_UNLOCK_MINUTES })
})

router.post('/unlock', sensitiveLimiter, async (req, res) => {
  try {
    await verifyCurrentPassword(req.user.id, req.body?.password)
    const until = setUnlockCookie(res, req.user.id)
    await adminService.logUnlock(req.user.id)
    res.status(STATUS.OK).json({ unlocked: true, until })
  } catch (error) {
    sendError(res, error, 'Erro ao liberar a área administrativa')
  }
})

router.post('/lock', (req, res) => {
  clearUnlockCookie(res)
  res.status(STATUS.OK).json({ unlocked: false })
})

router.use(requireUnlocked)

const handle = (context, fn) => async (req, res) => {
  try {
    res.status(STATUS.OK).json(await fn(req))
  } catch (error) {
    sendError(res, error, context)
  }
}

router.get('/stats', handle('Erro ao carregar números', () => adminService.stats()))
router.get('/reports', handle('Erro ao carregar denúncias', req => adminService.reportQueue(String(req.query.status ?? 'open'))))
router.get('/reviews/:id', validateNumericId(), handle('Erro ao abrir resenha', req => adminService.review(Number(req.params.id))))
router.post('/reviews/:id/hide', validateNumericId(), handle('Erro ao ocultar resenha',
  req => adminService.moderateReview(req.user.id, Number(req.params.id), true)))
router.post('/reviews/:id/show', validateNumericId(), handle('Erro ao reexibir resenha',
  req => adminService.moderateReview(req.user.id, Number(req.params.id), false)))
router.get('/bio-reports', handle('Erro ao carregar denúncias de apresentação', req => adminService.bioQueue(String(req.query.status ?? 'open'))))
router.post('/bios/:id/keep', validateNumericId(), handle('Erro ao manter apresentação',
  req => adminService.moderateBio(req.user.id, Number(req.params.id), 'keep')))
router.post('/bios/:id/remove', validateNumericId(), handle('Erro ao remover apresentação',
  req => adminService.moderateBio(req.user.id, Number(req.params.id), 'remove')))
router.get('/avatar-reports', handle('Erro ao carregar denúncias de foto', req => adminService.avatarQueue(String(req.query.status ?? 'open'))))
router.get('/avatars/:id', validateNumericId(), handle('Erro ao abrir foto', req => adminService.avatar(Number(req.params.id))))
// A foto em si (mesmo ocultada por denúncia), para quem modera
router.get('/avatars/:id/image', validateNumericId(), async (req, res, next) => {
  try {
    const data = await adminService.avatar(Number(req.params.id))
    if (!data.avatar.version) return res.status(404).type('text/plain').send('Not found')
    sendAvatarFile(res, next, data.avatar.userId, 'lg', 'jpg', 'private, no-store')
  } catch (error) {
    sendError(res, error, 'Erro ao abrir foto')
  }
})
router.post('/avatars/:id/keep', validateNumericId(), handle('Erro ao manter foto',
  req => adminService.moderateAvatar(req.user.id, Number(req.params.id), 'keep')))
router.post('/avatars/:id/remove', validateNumericId(), handle('Erro ao remover foto',
  req => adminService.moderateAvatar(req.user.id, Number(req.params.id), 'remove')))
router.get('/users', handle('Erro ao listar contas', req => adminService.users({
  q: req.query.q, status: String(req.query.status ?? 'all'), page: req.query.page, limit: req.query.limit
})))
router.post('/users/:id/suspend', sensitiveLimiter, validateNumericId(), handle('Erro ao suspender conta',
  req => adminService.suspend(req.user.id, Number(req.params.id), req.body ?? {})))
router.post('/users/:id/reactivate', sensitiveLimiter, validateNumericId(), handle('Erro ao reativar conta',
  req => adminService.reactivate(req.user.id, Number(req.params.id), req.body ?? {})))
router.get('/users/:id', validateNumericId(), handle('Erro ao abrir conta', req => adminService.user(Number(req.params.id))))
router.post('/users/:id/resend-verification', validateNumericId(), handle('Erro ao reenviar confirmação',
  req => adminService.resendUserVerification(req.user.id, Number(req.params.id))))
router.get('/usage', handle('Erro ao carregar uso', () => adminService.usage()))
router.get('/system', handle('Erro ao carregar o sistema', () => adminService.system()))
router.post('/email/test', mailLimiter, handle('Erro ao enviar e-mail de teste', req => adminService.sendTestEmail(req.user.id)))
router.get('/moderation/insights', handle('Erro ao carregar sinais de moderação', () => adminService.moderationInsights()))
router.get('/actions', handle('Erro ao carregar o registro', req => adminService.actions({ page: req.query.page, limit: req.query.limit })))

// Monetização: Pro de uma conta, pagamentos e reembolso, ofertas, webhooks e fila
router.get('/users/:id/billing', validateNumericId(), handle('Erro ao carregar o plano', req => billing.userBilling(Number(req.params.id))))
router.post('/users/:id/pro', sensitiveLimiter, validateNumericId(), handle('Erro ao conceder Pro',
  req => billing.grant(req.user.id, Number(req.params.id), req.body ?? {})))
router.post('/entitlements/:id/revoke', sensitiveLimiter, validateNumericId(), handle('Erro ao revogar Pro',
  req => billing.revoke(req.user.id, Number(req.params.id), req.body ?? {})))
router.get('/payments', handle('Erro ao listar pagamentos', req => billing.payments({
  filter: String(req.query.filter ?? 'all'), page: req.query.page, limit: req.query.limit
})))
router.post('/payments/:id/refund', sensitiveLimiter, validateNumericId(), handle('Erro ao marcar reembolso',
  req => billing.refund(req.user.id, Number(req.params.id), req.body ?? {})))
router.get('/offers', handle('Erro ao carregar ofertas', () => billing.offers()))
router.patch('/offers/:code', handle('Erro ao salvar oferta', req => billing.updateOffer(req.user.id, String(req.params.code), req.body ?? {})))
router.get('/webhooks', handle('Erro ao listar webhooks', req => billing.webhooks({
  filter: String(req.query.filter ?? 'error'), page: req.query.page, limit: req.query.limit
})))
router.post('/webhooks/:id/reprocess', validateNumericId(), handle('Erro ao reprocessar webhook',
  req => billing.reprocessWebhook(req.user.id, Number(req.params.id))))
router.get('/jobs', handle('Erro ao carregar a fila', () => billing.jobs()))

export default router

import express from 'express'
import * as authService from '../services/authService.js'
import * as dataService from '../services/dataService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import { loginLimiter, registerLimiter, sensitiveLimiter, mailLimiter, tokenLimiter } from '../middlewares/rateLimiter.js'
import { authenticateToken } from '../middlewares/auth.js'
import { AUTH_COOKIE_NAME, authCookieOptions } from '../config/cookieOptions.js'

const router = express.Router()

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body ?? {}

    const result = await authService.loginUser(username, password)

    res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions)
    res.status(STATUS.OK).json({ user: result.user })

  } catch (error) {
    sendError(res, error, 'Erro no login')
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions, maxAge: undefined })
  res.status(STATUS.OK).json({ message: 'Logout realizado com sucesso' })
})

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await authService.getUserProfile(req.user.id)

    if (!user) {
      const error = new Error('User not found.')
      error.status = STATUS.NOT_FOUND
      throw error
    }

    res.status(STATUS.OK).json({ user })
  } catch (error) {
    sendError(res, error, 'Erro ao buscar usuário')
  }
})

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, email, locale } = req.body ?? {}

    if (!username || !password || !email) {
      const error = new Error('Username, password, and email are required.')
      error.status = STATUS.BAD_REQUEST
      throw error
    }

    const user = await authService.registerUser(username, password, email, locale)

    res.status(STATUS.CREATED).json({ message: 'User registered successfully', user })
  } catch (error) {
    sendError(res, error, 'Erro no registro')
  }
})

router.put('/password', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {}

    const result = await authService.changePassword(req.user.id, currentPassword, newPassword)

    // Sessão atual continua com um token novo; as demais caem no middleware.
    res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions)
    res.status(STATUS.OK).json({ user: result.user })
  } catch (error) {
    sendError(res, error, 'Erro ao trocar senha')
  }
})

// --- Esqueci minha senha -----------------------------------------------------

// Sempre 200 com a mesma mensagem: não revela se o e-mail tem conta.
router.post('/password/forgot', mailLimiter, async (req, res) => {
  try {
    const { email, locale } = req.body ?? {}
    await authService.requestPasswordReset(email, locale)
    res.status(STATUS.OK).json({ message: 'Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.' })
  } catch (error) {
    sendError(res, error, 'Erro ao pedir recuperação de senha')
  }
})

router.post('/password/reset', tokenLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body ?? {}
    await authService.resetPassword(token, newPassword)
    // Todas as sessões caem (password_changed_at); esta também, por garantia.
    res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions, maxAge: undefined })
    res.status(STATUS.OK).json({ message: 'Senha redefinida. Entre com a senha nova.' })
  } catch (error) {
    sendError(res, error, 'Erro ao redefinir senha')
  }
})

// --- Confirmação de e-mail ----------------------------------------------------

router.post('/email/verify', tokenLimiter, async (req, res) => {
  try {
    await authService.verifyEmail(req.body?.token)
    res.status(STATUS.OK).json({ message: 'E-mail confirmado.' })
  } catch (error) {
    sendError(res, error, 'Erro ao confirmar e-mail')
  }
})

router.post('/email/verify/resend', authenticateToken, mailLimiter, async (req, res) => {
  try {
    const result = await authService.resendVerification(req.user.id, req.body?.locale)
    res.status(STATUS.OK).json(result)
  } catch (error) {
    sendError(res, error, 'Erro ao reenviar confirmação')
  }
})

// Trocar e-mail: { email, password, locale } → o novo precisa ser confirmado.
router.patch('/me/email', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { email, password, locale } = req.body ?? {}
    const user = await authService.changeEmail(req.user.id, password, email, locale)
    res.status(STATUS.OK).json({ user })
  } catch (error) {
    sendError(res, error, 'Erro ao trocar e-mail')
  }
})

// Trocar nome de usuário: { username, password }. Devolve sessão nova (o token leva o nome).
router.patch('/me/username', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { username, password } = req.body ?? {}
    const result = await authService.changeUsername(req.user.id, password, username)
    res.cookie(AUTH_COOKIE_NAME, result.token, authCookieOptions)
    res.status(STATUS.OK).json({ user: result.user })
  } catch (error) {
    sendError(res, error, 'Erro ao trocar nome de usuário')
  }
})

// Exportar todos os dados: ?format=json (padrão) ou csv (só os livros).
router.get('/me/export', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const stamp = new Date().toISOString().slice(0, 10)
    if (req.query.format === 'csv') {
      const csv = await dataService.exportCsv(req.user.id)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="librishelf-${stamp}.csv"`)
      return res.status(STATUS.OK).send(csv)
    }
    const data = await dataService.exportJson(req.user.id)
    res.setHeader('Content-Disposition', `attachment; filename="librishelf-${stamp}.json"`)
    res.status(STATUS.OK).json(data)
  } catch (error) {
    sendError(res, error, 'Erro ao exportar dados')
  }
})

router.patch('/me/visibility', authenticateToken, async (req, res) => {
  try {
    const result = await authService.setPrivacy(req.user.id, req.body ?? {})
    res.status(STATUS.OK).json(result)
  } catch (error) {
    sendError(res, error, 'Erro ao alterar privacidade')
  }
})

router.delete('/me', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { password } = req.body ?? {}

    await authService.deleteAccount(req.user.id, password)

    res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions, maxAge: undefined })
    res.status(STATUS.NO_CONTENT).send()
  } catch (error) {
    sendError(res, error, 'Erro ao excluir conta')
  }
})

export default router
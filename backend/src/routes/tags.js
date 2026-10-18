import express from 'express'
import * as tagService from '../services/tagService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import { mergeNames } from '../services/namesService.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const tags = await tagService.getTagsByUserId(userId)
    res.status(STATUS.OK).json(tags)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar tags')
  }
})

// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
router.post('/merge', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await mergeNames('tag', req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao renomear/mesclar')
  }
})

export default router
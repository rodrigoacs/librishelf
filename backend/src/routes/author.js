import express from 'express'
import * as authorService from '../services/authorService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import { mergeNames } from '../services/namesService.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const publisherFilter = req.query.publishers

    const authors = await authorService.getAuthorsByUserId(userId, publisherFilter)

    res.status(STATUS.OK).json(authors)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar autores')
  }
})

// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
router.post('/merge', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await mergeNames('author', req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao renomear/mesclar')
  }
})

export default router
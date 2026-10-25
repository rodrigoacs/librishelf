import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { validateNumericId } from '../middlewares/validateId.js'
import * as listService from '../services/listService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Listas do leitor (precisa estar logado). A página pública de uma lista fica
 * em /library/public/u/:username/lists/:id.
 */
const router = express.Router()

router.use(authenticateToken)

// ?book=ID marca as listas que já têm o livro (menu "Adicionar à lista")
router.get('/', async (req, res) => {
  try {
    const book = /^\d{1,9}$/.test(String(req.query.book ?? '')) ? Number(req.query.book) : null
    res.status(STATUS.OK).json({ lists: await listService.listOwn(req.user.id, book) })
  } catch (error) {
    sendError(res, error, 'Erro ao buscar listas')
  }
})

// { title, description?, isPublic?, ranked?, bookId? }
router.post('/', async (req, res) => {
  try {
    res.status(STATUS.CREATED).json({ list: await listService.create(req.user.id, req.body ?? {}) })
  } catch (error) {
    sendError(res, error, 'Erro ao criar lista')
  }
})

router.get('/:id', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json({ list: await listService.getOwn(Number(req.params.id), req.user.id) })
  } catch (error) {
    sendError(res, error, 'Erro ao buscar lista')
  }
})

router.patch('/:id', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json({ list: await listService.update(Number(req.params.id), req.user.id, req.body ?? {}) })
  } catch (error) {
    sendError(res, error, 'Erro ao alterar lista')
  }
})

router.delete('/:id', validateNumericId(), async (req, res) => {
  try {
    await listService.remove(Number(req.params.id), req.user.id)
    res.status(STATUS.OK).json({ deleted: true })
  } catch (error) {
    sendError(res, error, 'Erro ao apagar lista')
  }
})

// { bookId }
router.post('/:id/items', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await listService.addItem(Number(req.params.id), req.user.id, req.body?.bookId))
  } catch (error) {
    sendError(res, error, 'Erro ao adicionar livro à lista')
  }
})

router.delete('/:id/items/:bookId', validateNumericId(), validateNumericId('bookId'), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await listService.removeItem(Number(req.params.id), req.user.id, req.params.bookId))
  } catch (error) {
    sendError(res, error, 'Erro ao tirar livro da lista')
  }
})

// { bookIds: [...] } — todos os livros, na ordem nova
router.put('/:id/order', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json({ list: await listService.reorder(Number(req.params.id), req.user.id, req.body ?? {}) })
  } catch (error) {
    sendError(res, error, 'Erro ao reordenar lista')
  }
})

export default router

import { jest } from '@jest/globals'
import sendError from '../../utils/sendError.js'
import STATUS from '../../utils/statusCodes.js'

function buildRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('sendError', () => {
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('erro controlado (com .status): usa o status e a mensagem originais, sem logar', () => {
    const res = buildRes()
    const error = new Error('Permission denied.')
    error.status = STATUS.FORBIDDEN

    sendError(res, error, 'Erro ao deletar livro')

    expect(res.status).toHaveBeenCalledWith(STATUS.FORBIDDEN)
    expect(res.json).toHaveBeenCalledWith({ error: 'Permission denied.' })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('erro não controlado (sem .status, ex.: driver pg): esconde a mensagem original do cliente', () => {
    const res = buildRes()
    const error = new Error('column "autor" does not exist')
    error.code = '42703'

    sendError(res, error, 'Erro ao buscar livro')

    expect(res.status).toHaveBeenCalledWith(STATUS.INTERNAL_SERVER_ERROR)
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro interno do servidor.' })
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('autor') })
    )
  })

  it('erro não controlado: loga o erro original completo no servidor, com o contexto', () => {
    const res = buildRes()
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5432')

    sendError(res, error, 'Erro ao buscar livro')

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Erro ao buscar livro]', error)
  })

  it('erro não controlado sem contexto informado: ainda loga, com rótulo genérico', () => {
    const res = buildRes()
    const error = new Error('unexpected token')

    sendError(res, error)

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Erro não tratado]', error)
    expect(res.status).toHaveBeenCalledWith(STATUS.INTERNAL_SERVER_ERROR)
  })
})
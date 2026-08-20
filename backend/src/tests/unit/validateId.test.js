import { jest } from '@jest/globals'
import { validateNumericId } from '../../middlewares/validateId.js'

function buildRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('validateNumericId', () => {
  const invalidIds = [
    'abc',
    '-1',
    '1.5',
    '1e10',
    '../../etc/passwd',
    '1%00',
    '',
    '9;DROP TABLE books',
    ' 1',
    '1 ',
    '0x1A'
  ]

  it.each(invalidIds)('rejeita "%s" com 400 e não chama next()', (id) => {
    const middleware = validateNumericId()
    const req = { params: { id } }
    const res = buildRes()
    const next = jest.fn()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("'id'") })
    )
    expect(next).not.toHaveBeenCalled()
  })

  const validIds = ['1', '42', '007', '999999999']

  it.each(validIds)('aceita "%s" e chama next() sem responder', (id) => {
    const middleware = validateNumericId()
    const req = { params: { id } }
    const res = buildRes()
    const next = jest.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('respeita um nome de parâmetro customizado', () => {
    const middleware = validateNumericId('bookId')
    const req = { params: { bookId: 'abc' } }
    const res = buildRes()
    const next = jest.fn()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("'bookId'") })
    )
    expect(next).not.toHaveBeenCalled()
  })
})
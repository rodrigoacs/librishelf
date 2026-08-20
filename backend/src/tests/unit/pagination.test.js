import { resolvePagination, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } from '../../utils/pagination.js'

describe('resolvePagination', () => {
  it('usa os defaults quando page/limit não são informados', () => {
    const result = resolvePagination(undefined, undefined)

    expect(result).toEqual({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT, offset: 0 })
  })

  it('aceita page/limit válidos e calcula o offset corretamente', () => {
    const result = resolvePagination('3', '10')

    expect(result).toEqual({ page: 3, limit: 10, offset: 20 })
  })

  it.each([
    ['-1', DEFAULT_PAGE],
    ['0', DEFAULT_PAGE],
    ['abc', DEFAULT_PAGE],
    ['1.5', 1],
    ['', DEFAULT_PAGE],
    [null, DEFAULT_PAGE],
  ])('page inválido "%s" cai no default (%i)', (input, expected) => {
    const result = resolvePagination(input, '20')
    expect(result.page).toBe(expected)
  })

  it.each([
    ['-1', DEFAULT_LIMIT],
    ['0', DEFAULT_LIMIT],
    ['abc', DEFAULT_LIMIT],
    ['', DEFAULT_LIMIT],
    [null, DEFAULT_LIMIT],
  ])('limit inválido "%s" cai no default (%i)', (input, expected) => {
    const result = resolvePagination('1', input)
    expect(result.limit).toBe(expected)
  })

  it('trava o limit no teto (MAX_LIMIT) mesmo pedindo um valor absurdo', () => {
    const result = resolvePagination('1', '999999999')

    expect(result.limit).toBe(MAX_LIMIT)
  })

  it('não deixa o offset ficar negativo mesmo com page negativo/zero', () => {
    const negativePage = resolvePagination('-50', '20')
    const zeroPage = resolvePagination('0', '20')

    expect(negativePage.offset).toBeGreaterThanOrEqual(0)
    expect(zeroPage.offset).toBeGreaterThanOrEqual(0)
  })
})
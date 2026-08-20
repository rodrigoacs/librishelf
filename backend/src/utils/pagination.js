const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function resolvePagination(page, limit) {
  const parsedPage = parseInt(page, 10)
  const parsedLimit = parseInt(limit, 10)

  const pageVal = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE

  const limitVal = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT

  const offset = (pageVal - 1) * limitVal

  return { page: pageVal, limit: limitVal, offset }
}

export { resolvePagination, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT }
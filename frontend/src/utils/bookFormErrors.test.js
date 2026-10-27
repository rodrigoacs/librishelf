import { describe, expect, it } from 'vitest'
import { fieldErrorFromApi, FIELD_ORDER } from './bookFormErrors.js'

const t = key => `t:${key}`
const apiError = (status, code, message, params) => ({ status, code, message, body: { error: message, code, params } })

describe('fieldErrorFromApi', () => {
  it('código da API leva ao campo, com a mensagem já traduzida', () => {
    expect(fieldErrorFromApi(apiError(409, 'ISBN_TAKEN', 'ISBN já cadastrado'), t)).toEqual({ field: 'isbn', message: 'ISBN já cadastrado' })
    expect(fieldErrorFromApi(apiError(400, 'READ_DATE_FUTURE', 'Data no futuro'), t).field).toBe('statusDate')
    expect(fieldErrorFromApi(apiError(400, 'IMAGE_TOO_LARGE', 'Grande'), t).field).toBe('cover')
  })

  it('códigos genéricos usam params.field', () => {
    expect(fieldErrorFromApi(apiError(400, 'FIELD_TOO_LONG', 'Longo', { field: 'title' }), t).field).toBe('title')
    expect(fieldErrorFromApi(apiError(400, 'DATE_OUT_OF_RANGE', 'Fora', { field: 'publicationDate' }), t).field).toBe('pubDate')
    expect(fieldErrorFromApi(apiError(400, 'FIELD_INVALID', 'x', { field: 'desconhecido' }), t)).toBeNull()
  })

  it('sem código, reconhece o texto (servidor antigo)', () => {
    expect(fieldErrorFromApi({ status: 409, message: 'Conflito' }, t)).toEqual({ field: 'isbn', message: 't:bookForm.errors.isbnDuplicate' })
    expect(fieldErrorFromApi({ status: 400, message: 'title is required' }, t)).toEqual({ field: 'title', message: 't:bookForm.errors.titleRequired' })
  })

  it('outros status ou texto desconhecido → null (vira toast)', () => {
    expect(fieldErrorFromApi(apiError(500, 'INTERNAL_ERROR', 'x'), t)).toBeNull()
    expect(fieldErrorFromApi({ status: 400, message: 'qualquer coisa' }, t)).toBeNull()
    expect(fieldErrorFromApi(null, t)).toBeNull()
  })

  it('todo campo devolvido está na ordem de foco', () => {
    for (const code of ['ISBN_TAKEN', 'AUTHORS_REQUIRED', 'VOLUME_INVALID', 'PAGE_COUNT_INVALID', 'NOTES_TOO_LONG', 'RATING_INVALID']) {
      expect(FIELD_ORDER).toContain(fieldErrorFromApi(apiError(400, code, 'x'), t).field)
    }
  })
})

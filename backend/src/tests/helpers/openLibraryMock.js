/**
 * Open Library falso para testes: mesmas estruturas das respostas reais
 * (/isbn/{isbn}.json → edição, /works/{id}.json, /authors/{id}.json, capa por ID).
 */
export const FIXTURES = {
  '/isbn/9780140328721.json': {
    title: 'Fantastic Mr. Fox',
    authors: [{ key: '/authors/OL34184A' }],
    works: [{ key: '/works/OL45804W' }],
    publishers: ['Puffin'],
    publish_date: 'October 1, 1988',
    covers: [15152634, 8739161, -1],
    isbn_13: ['9780140328721'],
    key: '/books/OL7353617M'
  },
  '/works/OL45804W.json': {
    title: 'Fantastic Mr Fox',
    authors: [{ author: { key: '/authors/OL34184A' }, type: { key: '/type/author_role' } }],
    covers: [6498519],
    key: '/works/OL45804W'
  },
  '/authors/OL34184A.json': { name: 'Roald Dahl', key: '/authors/OL34184A' },

  // Edição sem autores (ficam na obra), com subtítulo e só o ano.
  '/isbn/9788535914849.json': {
    title: 'Ensaio sobre a cegueira',
    subtitle: 'romance',
    works: [{ key: '/works/OL100W' }],
    publishers: ['Companhia das Letras'],
    publish_date: '1995',
    key: '/books/OL200M'
  },
  '/works/OL100W.json': {
    title: 'Ensaio sobre a cegueira',
    authors: [{ author: { key: '/authors/OL300A' } }],
    key: '/works/OL100W'
  },
  '/authors/OL300A.json': { name: 'José Saramago', key: '/authors/OL300A' },

  // Caso real (9788501401380): o autor da edição se chama "invalid author ID";
  // o certo está na obra, e passa por um redirect de autor mesclado.
  '/isbn/9788501401380.json': {
    title: 'Trono de Vidro',
    subtitle: 'Trono de Vidro #1',
    authors: [{ key: '/authors/OL9958049A' }],
    works: [{ key: '/works/OL16607146W' }],
    publishers: ['Galera Record'],
    publish_date: 'Aug 06, 2013',
    covers: [12586231],
    key: '/books/OL36697222M'
  },
  '/authors/OL9958049A.json': { name: 'invalid author ID', key: '/authors/OL9958049A' },
  '/works/OL16607146W.json': {
    title: 'Throne of Glass',
    authors: [{ author: { key: '/authors/OL1A' }, type: { key: '/type/author_role' } }],
    key: '/works/OL16607146W'
  },
  '/authors/OL1A.json': { type: { key: '/type/redirect' }, location: '/authors/OL7115219A', key: '/authors/OL1A' },
  '/authors/OL7115219A.json': { name: 'Sarah J. Maas', key: '/authors/OL7115219A' }
}

// /search.json: formato das respostas reais com fields=...,editions,editions.*
// (o Open Library junta à obra a edição que melhor casa com a busca e o idioma).
export const SEARCH_FIXTURES = {
  'dom casmurro': {
    numFound: 3,
    start: 0,
    docs: [
      {
        key: '/works/OL1W',
        title: 'Dom Casmurro',
        author_name: ['Machado de Assis'],
        first_publish_year: 1899,
        cover_i: 111,
        number_of_pages_median: 256,
        edition_count: 120,
        editions: {
          numFound: 45,
          start: 0,
          numFoundExact: true,
          docs: [{
            key: '/books/OL10M',
            title: 'Dom Casmurro',
            isbn: ['8508099990', '9788508099993'],
            publisher: ['Ática'],
            publish_date: ['2008'],
            cover_i: 222,
            language: ['por']
          }]
        }
      },
      // Mesma obra repetida (não aparece duas vezes)
      { key: '/works/OL1W', title: 'Dom Casmurro', author_name: ['Machado de Assis'] },
      // Sem edição, autor "de mentira" e ISBN só na obra: fica sem ISBN
      {
        key: '/works/OL2W',
        title: 'Dom Casmurro',
        subtitle: 'edição comentada',
        author_name: ['Machado de Assis', 'unknown', 'Machado de Assis'],
        first_publish_year: 2015,
        editions: { numFound: 0, start: 0, docs: [] }
      },
      // Sem título: ignorado
      { key: '/works/OL3W', author_name: ['Alguém'] }
    ]
  },
  'livro inexistente': { numFound: 0, start: 0, docs: [] }
}

// JPEG 1×1 válido (o sharp precisa conseguir ler).
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64'
)

export function createOpenLibraryMock({ down = false } = {}) {
  const calls = []

  const fetchMock = async (url, options = {}) => {
    calls.push({ url, userAgent: options.headers?.['User-Agent'] })
    if (down) throw new TypeError('fetch failed')

    const { pathname } = new URL(url)

    if (url.startsWith('https://covers.openlibrary.org/')) {
      return pathname === '/b/id/15152634-L.jpg' || pathname === '/b/id/15152634-M.jpg'
        ? new Response(TINY_JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        : new Response('not found', { status: 404 })
    }

    if (pathname === '/search.json') {
      const q = new URL(url).searchParams.get('q')?.toLowerCase()
      const found = SEARCH_FIXTURES[q] ?? { numFound: 0, start: 0, docs: [] }
      return new Response(JSON.stringify(found), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const body = FIXTURES[pathname]
    return body
      ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  }

  return { fetch: fetchMock, calls }
}
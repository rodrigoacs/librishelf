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
      return pathname === '/b/id/15152634-L.jpg'
        ? new Response(TINY_JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        : new Response('not found', { status: 404 })
    }

    const body = FIXTURES[pathname]
    return body
      ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  }

  return { fetch: fetchMock, calls }
}
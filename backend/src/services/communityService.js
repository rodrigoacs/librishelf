import * as communityRepository from '../repositories/communityRepository.js'
import { visibleAvatar } from './avatarService.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import * as socialRepository from '../repositories/socialRepository.js'
import * as readingService from './readingService.js'
import * as reviewService from './reviewService.js'
import * as listService from './listService.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'
import { createTtlCache } from '../utils/ttlCache.js'

const MAX_READERS_LISTED = 20
const FIND_LIMIT = 24
const RECOMMENDATION_LIMIT = 6
const ALSO_HAVE_LIMIT = 5
const COMMON_LIMIT = 24

// Classificações caras (busca de leitores, recomendações, "também têm") ficam
// alguns minutos em memória, por usuário. O que muda na hora — privacidade,
// bloqueio, conta ativa, "seguir", livro posto na estante — é conferido a cada
// pedido (READERS_LIVE e SAMPLE_BOOKS), por isso guardamos uma folga além do
// limite. Nos testes começa desligado (ttlMs = 0), como os rate limits.
const TEST = process.env.NODE_ENV === 'test'
export const rankingCache = {
  readers: createTtlCache({ ttlMs: TEST ? 0 : 60 * 1000 }),
  books: createTtlCache({ ttlMs: TEST ? 0 : 5 * 60 * 1000 })
}
const SPARE = 2

/** Esquece as classificações de um usuário (estante mudou, por exemplo). */
export function forgetRankings(userId) {
  rankingCache.readers.forget(`${userId}:`)
  rankingCache.books.forget(`${userId}:`)
}

/** Completa a classificação de livros com o que pode ser mostrado agora. */
async function withLiveBooks(userId, ranked, limit) {
  const live = await communityRepository.liveSampleBooks(userId, ranked.map(row => row.sample_book_id))
  return ranked
    .filter(row => live.has(row.sample_book_id))
    .slice(0, limit)
    .map(row => ({ ...row, ...live.get(row.sample_book_id) }))
}

/**
 * Painel "comunidade" de um livro do próprio usuário: outros leitores
 * (só quem optou por aparecer), nota média deles e "também têm".
 */
export async function bookCommunity(bookId, userId) {
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner || owner.user_id !== userId) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')

  const readers = await communityRepository.readersOfBook(bookId, userId)
  const ratings = readers.map(r => r.rating).filter(r => r !== null)

  const alsoHaveFor = async () => {
    const ranked = await rankingCache.books.wrap(`${userId}:also:${bookId}`,
      () => communityRepository.alsoHave(bookId, userId, ALSO_HAVE_LIMIT * SPARE))
    return withLiveBooks(userId, ranked, ALSO_HAVE_LIMIT)
  }

  const [alsoHave, reviews] = await Promise.all([
    readers.length > 0 ? alsoHaveFor() : [],
    reviewService.forSameBook(bookId, userId)
  ])

  return {
    reviews,
    readerCount: readers.length,
    readers: readers
      .map(r => ({ username: r.username, hasRead: r.has_read, rating: r.rating, avatarVersion: r.avatar_version ?? null }))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, MAX_READERS_LISTED),
    averageRating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    ratingCount: ratings.length,
    alsoHave: alsoHave.map(item => ({
      title: item.title,
      authors: item.authors,
      readers: item.readers,
      bookId: item.sample_book_id,
      coverVersion: item.cover_version,
      owner: item.owner
    }))
  }
}

/**
 * Perfil público: estatísticas da biblioteca e, para quem está logado,
 * livros em comum (se o dono optou por aparecer) e situação de "seguir".
 */
export async function publicProfile(username, viewerId) {
  const user = await authRepository.getUserByName(username)
  if (!user || !user.is_public) throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND, 'LIBRARY_NOT_FOUND')

  const stats = await communityRepository.profileStats(user.id)

  const profile = {
    username: user.name,
    avatarVersion: await visibleAvatar(user.id, viewerId),
    acceptsFollowers: Boolean(user.show_activity),
    inCommunity: Boolean(user.show_in_community),
    indexable: Boolean(user.allow_indexing),
    stats: {
      totalBooks: stats.total_books,
      readBooks: stats.read_books,
      averageRating: stats.avg_rating,
      ratedBooks: stats.rated_books,
      readingByYear: stats.reading_by_year,
      topAuthors: stats.top_authors,
      topTags: stats.top_tags,
      recentlyRead: stats.recently_read
    },
    viewer: null
  }

  // Resenhas que este leitor pode ver (públicas; "seguidores" se ele segue)
  profile.reviews = await reviewService.forProfile(user.id, viewerId)
  profile.lists = await listService.forProfile(user.id)

  if (viewerId) {
    if (viewerId === user.id) {
      profile.viewer = { isOwner: true }
    } else {
      const { blockedByMe, blockedMe } = await socialRepository.blockState(viewerId, user.id)
      const blocked = blockedByMe || blockedMe
      const common = user.show_in_community && !blocked
        ? await communityRepository.commonBooks(viewerId, user.id, COMMON_LIMIT)
        : null

      // Quem foi bloqueado vê o perfil como qualquer visitante (é público),
      // mas sem "seguir" nem livros em comum. Não é avisado do bloqueio.
      if (blockedMe) profile.acceptsFollowers = false

      profile.viewer = {
        isOwner: false,
        followStatus: blocked ? null : await socialRepository.followStatus(viewerId, user.id),
        blockedByMe,
        commonCount: common ? common.total : null,
        commonBooks: common ? common.books : []
      }
    }
  }

  return profile
}

/**
 * Encontrar leitores pelo nome. Sem texto: sugestões (mais livros em comum).
 * Só aparece quem tem biblioteca pública e participa da comunidade.
 */
export async function findReaders(viewerId, rawText) {
  const text = typeof rawText === 'string' ? rawText.trim().slice(0, 50) : ''
  const ranked = await rankingCache.readers.wrap(`${viewerId}:readers:${text.toLowerCase()}`,
    () => communityRepository.findReaders(viewerId, text, FIND_LIMIT * SPARE))
  const live = await communityRepository.liveReaders(viewerId, ranked.map(row => row.id))

  return ranked
    .filter(row => live.has(row.id))
    .slice(0, FIND_LIMIT)
    .map(row => {
      const person = live.get(row.id)
      return {
        username: person.username,
        avatarVersion: person.avatar_version ?? null,
        acceptsFollowers: Boolean(person.accepts_followers),
        totalBooks: row.total_books,
        readBooks: row.read_books,
        commonBooks: row.common_books,
        followStatus: person.follow_status ?? null
      }
    })
}

/** "Recomendados para você" no Início. */
export async function recommendations(userId) {
  const ranked = await rankingCache.books.wrap(`${userId}:recommendations`,
    () => communityRepository.recommendations(userId, RECOMMENDATION_LIMIT * SPARE))
  const rows = await withLiveBooks(userId, ranked, RECOMMENDATION_LIMIT)
  return rows.map(row => ({
    title: row.title,
    authors: row.authors,
    readers: row.readers,
    similarReaders: row.similar_readers,
    averageRating: row.average_rating,
    bookId: row.sample_book_id,
    coverVersion: row.cover_version,
    owner: row.owner
  }))
}

/** Copia um livro da comunidade para a estante de quem pediu, como "Quero ler". */
export async function addToWantList(sourceId, userId) {
  const source = await communityRepository.sourceBook(sourceId, userId)
  if (!source) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
  if (source.already_have) throw httpError('Este livro já está na sua estante.', STATUS.CONFLICT, 'BOOK_ALREADY_ON_SHELF')

  const bookId = await libraryRepository.createBook({
    title: source.title,
    pubDate: source.publication_date,
    authors: source.authors.length ? source.authors : ['Autor desconhecido'],
    publisher: source.publisher,
    tags: [],
    readDate: null,
    isbn: source.isbn,
    user_id: userId,
    rating: null,
    olWorkKey: source.ol_work_key,
    olEditionKey: source.ol_edition_key
  })
  await readingService.importReadings(bookId, { status: 'want' })
  forgetRankings(userId)
  return { bookId }
}

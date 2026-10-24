import * as communityRepository from '../repositories/communityRepository.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import * as socialRepository from '../repositories/socialRepository.js'
import * as readingService from './readingService.js'
import STATUS from '../utils/statusCodes.js'
import { httpError } from '../utils/httpError.js'

const MAX_READERS_LISTED = 20
const FIND_LIMIT = 24
const RECOMMENDATION_LIMIT = 6
const ALSO_HAVE_LIMIT = 5
const COMMON_LIMIT = 24

/**
 * Painel "comunidade" de um livro do próprio usuário: outros leitores
 * (só quem optou por aparecer), nota média deles e "também têm".
 */
export async function bookCommunity(bookId, userId) {
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner || owner.user_id !== userId) throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')

  const readers = await communityRepository.readersOfBook(bookId, userId)
  const ratings = readers.map(r => r.rating).filter(r => r !== null)

  const alsoHave = readers.length > 0
    ? await communityRepository.alsoHave(bookId, userId, ALSO_HAVE_LIMIT)
    : []

  return {
    readerCount: readers.length,
    readers: readers
      .map(r => ({ username: r.username, hasRead: r.has_read, rating: r.rating }))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, MAX_READERS_LISTED),
    averageRating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    ratingCount: ratings.length,
    alsoHave: alsoHave.map(item => ({
      title: item.title,
      authors: item.authors,
      readers: item.readers,
      bookId: item.sample_book_id,
      owner: item.sample_owner
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
  const rows = await communityRepository.findReaders(viewerId, text, FIND_LIMIT)
  return rows.map(row => ({
    username: row.username,
    acceptsFollowers: Boolean(row.accepts_followers),
    totalBooks: row.total_books,
    readBooks: row.read_books,
    commonBooks: row.common_books,
    followStatus: row.follow_status ?? null
  }))
}

/** "Recomendados para você" no Início. */
export async function recommendations(userId) {
  const rows = await communityRepository.recommendations(userId, RECOMMENDATION_LIMIT)
  return rows.map(row => ({
    title: row.title,
    authors: row.authors,
    readers: row.readers,
    similarReaders: row.similar_readers,
    averageRating: row.average_rating,
    bookId: row.sample_book_id,
    owner: row.sample_owner
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
  return { bookId }
}

import * as communityRepository from '../repositories/communityRepository.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import * as socialRepository from '../repositories/socialRepository.js'
import STATUS from '../utils/statusCodes.js'

const MAX_READERS_LISTED = 20
const ALSO_HAVE_LIMIT = 5
const COMMON_LIMIT = 24

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * Painel "comunidade" de um livro do próprio usuário: outros leitores
 * (só quem optou por aparecer), nota média deles e "também têm".
 */
export async function bookCommunity(bookId, userId) {
  const owner = await libraryRepository.getBookOwner(bookId)
  if (!owner || owner.user_id !== userId) throw httpError('Book not found.', STATUS.NOT_FOUND)

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
  if (!user || !user.is_public) throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND)

  const stats = await communityRepository.profileStats(user.id)

  const profile = {
    username: user.name,
    acceptsFollowers: Boolean(user.show_activity),
    inCommunity: Boolean(user.show_in_community),
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
      const common = user.show_in_community
        ? await communityRepository.commonBooks(viewerId, user.id, COMMON_LIMIT)
        : null

      profile.viewer = {
        isOwner: false,
        followStatus: await socialRepository.followStatus(viewerId, user.id),
        commonCount: common ? common.total : null,
        commonBooks: common ? common.books : []
      }
    }
  }

  return profile
}

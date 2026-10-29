import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import api from '../services/api.js'
import { toApiDate } from '../utils/dates.js'
import { statusOf } from '../utils/readingStatus.js'

/**
 * Marcar/desmarcar como lido direto no card ou na linha da lista, sem abrir
 * o livro. Marca com a data de hoje (no fuso da pessoa); a data pode ser
 * ajustada depois no próprio livro.
 *
 * @param getBook  função que devolve o livro atual (props.book)
 * @param onUpdated recebe { book: { book_id, read_date }, coverChanged: false }
 */
export function useReadToggle(getBook, onUpdated) {
  const { t } = useI18n()
  const toast = useToast()
  const saving = ref(false)

  async function toggleRead() {
    if (saving.value) return
    const book = getBook()
    const bookId = book.book_id ?? book.id
    // "Lendo" (inclusive releitura) e "Quero ler" viram "Lido"; "Lido" volta a não lido.
    const wasRead = statusOf(book) === 'read'

    saving.value = true
    try {
      if (wasRead) {
        await api.markAsUnread(bookId)
        onUpdated({ book: { book_id: bookId, read_date: null }, coverChanged: false })
      } else {
        const today = toApiDate(new Date())
        await api.markAsRead(bookId, today)
        onUpdated({ book: { book_id: bookId, read_date: today, reading_status: null }, coverChanged: false })
      }
    } catch (error) {
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      saving.value = false
    }
  }

  return { saving, toggleRead }
}

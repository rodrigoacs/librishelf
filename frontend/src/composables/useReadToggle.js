import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import api from '../services/api.js'
import { toApiDate } from '../utils/dates.js'
import { statusOf } from '../utils/readingStatus.js'
import { readUndoSteps } from '../utils/readUndo.js'

/**
 * Marcar/desmarcar como lido direto no card ou na linha da lista, sem abrir
 * o livro. Marca com a data de hoje (no fuso da pessoa); a data pode ser
 * ajustada depois no próprio livro.
 *
 * Depois de mudar, um aviso (role="status", lido pelo leitor de tela) diz o
 * que aconteceu e traz "Desfazer", que volta exatamente ao estado de antes
 * (no toque, a fita só mudava de cor).
 *
 * @param getBook  função que devolve o livro atual (props.book)
 * @param onUpdated recebe { book: { book_id, read_date }, coverChanged: false }
 */
export function useReadToggle(getBook, onUpdated) {
  const { t } = useI18n()
  const toast = useToast()
  const saving = ref(false)

  async function undo(bookId, steps) {
    saving.value = true
    try {
      for (const step of steps) {
        if (step.op === 'add') await api.addReading(bookId, step.reading)
        else if (step.op === 'reopen') await api.updateReading(bookId, step.readingId, { finishedOn: null })
        else if (step.op === 'unread') await api.markAsUnread(bookId)
        else if (step.op === 'want') await api.setReadingStatus(bookId, 'want')
      }
      const fresh = await api.getBookById(bookId)
      onUpdated({
        book: { book_id: bookId, read_date: fresh.read_date ?? null, reading_status: fresh.reading_status ?? null, started_at: fresh.started_at ?? null },
        coverChanged: false
      })
    } catch (error) {
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      saving.value = false
    }
  }

  async function toggleRead() {
    if (saving.value) return
    const book = getBook()
    const bookId = book.book_id ?? book.id
    // "Lendo" (inclusive releitura) e "Quero ler" viram "Lido"; "Lido" volta a não lido.
    const prevStatus = statusOf(book)
    const wasRead = prevStatus === 'read'

    saving.value = true
    try {
      // As leituras de antes permitem o "Desfazer" exato; sem elas, só não há desfazer
      const before = await api.getReadings(bookId).then(data => data?.readings ?? null).catch(() => null)
      if (wasRead) {
        await api.markAsUnread(bookId)
        onUpdated({ book: { book_id: bookId, read_date: null }, coverChanged: false })
      } else {
        const today = toApiDate(new Date())
        await api.markAsRead(bookId, today)
        onUpdated({ book: { book_id: bookId, read_date: today, reading_status: null }, coverChanged: false })
      }
      const steps = readUndoSteps(prevStatus, before)
      toast.add({
        severity: 'success',
        detail: t(wasRead ? 'book.markedUnread' : 'book.markedRead', { title: book.title }),
        life: 6000,
        action: steps ? { label: t('common.undo'), onClick: () => undo(bookId, steps) } : null
      })
    } catch (error) {
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      saving.value = false
    }
  }

  return { saving, toggleRead }
}

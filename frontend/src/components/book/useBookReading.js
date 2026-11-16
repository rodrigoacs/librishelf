import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { fromApiDate, toApiDate } from '../../utils/dates.js'
import { statusOf } from '../../utils/readingStatus.js'
import { readUndoSteps } from '../../utils/readUndo.js'

/**
 * Status de leitura, painel de leituras e nota do livro aberto (BookDialog),
 * sem passar pelo modo de edição.
 *
 * book: ref do livro exibido; bookId: () => id; phone: ref do useIsPhone;
 * applyResponse: põe a resposta da API em `book`; emit: o do BookDialog
 * (avisa a lista com 'updated').
 */
export function useBookReading({ book, bookId, phone, applyResponse, emit }) {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const ratingSaving = ref(false)
  const readSaving = ref(false)

  /**
   * Quero ler / Lendo / Lido. Clicar no status que já está marcado tira o status
   * (o livro volta a só estar na estante). Datas vão no fuso da pessoa.
   *
   * A tela muda na hora (o servidor confirma depois); se der erro, volta como
   * estava e avisa.
   *
   * Celular: tocar de novo em "✓ Lido em …" logo depois de marcar desfaz
   * exatamente (utils/readUndo.js, o mesmo "Desfazer" do card) em vez de
   * apagar a leitura. O aviso com "Desfazer" não serve aqui: com o livro aberto
   * (diálogo modal) o resto da página, avisos inclusive, fica inerte.
   */
  let pendingUndo = null

  async function changeStatus(option) {
    if (readSaving.value) return
    const current = statusOf(book.value)
    if (option === 'read' && current === 'read' && pendingUndo) {
      const steps = pendingUndo.steps
      pendingUndo = null
      return undoStatus(steps)
    }
    pendingUndo = null
    const next = current === option ? 'none' : option
    // "Quero ler"/nenhum apagam o histórico: com mais de uma leitura, pergunta antes
    const total = (book.value.read_count || 0) + (book.value.reading_status === 'reading' ? 1 : 0)
    if ((next === 'none' || next === 'want') && total > 1 && !(await confirmClearHistory(total))) return

    const previous = { read_date: book.value.read_date, started_at: book.value.started_at, reading_status: book.value.reading_status }
    const now = new Date()
    const today = toApiDate(now)
    const predicted = {
      read: { read_date: now, reading_status: null },
      reading: { reading_status: 'reading', started_at: now },
      want: { reading_status: 'want', read_date: null },
      none: { reading_status: null, read_date: null }
    }[next]
    Object.assign(book.value, predicted)

    readSaving.value = true
    try {
      const touchesRead = phone.value && next === 'read'
      const before = touchesRead ? await api.getReadings(bookId()).then(data => data?.readings ?? null).catch(() => null) : null
      const result = await api.setReadingStatus(bookId(), next, next === 'read' || next === 'reading' ? today : undefined)
      book.value.read_date = fromApiDate(result.readDate)
      book.value.started_at = fromApiDate(result.startedAt)
      book.value.reading_status = result.status === 'want' || result.status === 'reading' ? result.status : null
      emit('updated', {
        book: { book_id: bookId(), read_date: result.readDate, reading_status: book.value.reading_status, started_at: result.startedAt },
        coverChanged: false
      })
      refreshReadingFields()
      if (next === 'read' && phone.value) {
        const steps = readUndoSteps(current, before)
        pendingUndo = steps ? { steps } : null
      }
    } catch (error) {
      Object.assign(book.value, previous)
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      readSaving.value = false
    }
  }

  async function undoStatus(steps) {
    const previous = { read_date: book.value.read_date, started_at: book.value.started_at, reading_status: book.value.reading_status }
    // Na hora: volta ao status de antes; o servidor confirma em seguida
    const back = steps.some(step => step.op === 'reopen') ? { read_date: null, reading_status: 'reading' }
      : steps.some(step => step.op === 'want') ? { read_date: null, reading_status: 'want' }
        : { read_date: null, reading_status: null }
    Object.assign(book.value, back)
    readSaving.value = true
    try {
      for (const step of steps) {
        if (step.op === 'add') await api.addReading(bookId(), step.reading)
        else if (step.op === 'reopen') await api.updateReading(bookId(), step.readingId, { finishedOn: null })
        else if (step.op === 'unread') await api.markAsUnread(bookId())
        else if (step.op === 'want') await api.setReadingStatus(bookId(), 'want')
      }
      const fresh = await api.getBookById(bookId())
      applyResponse(fresh)
      emit('updated', {
        book: { book_id: bookId(), read_date: fresh.read_date ?? null, reading_status: fresh.reading_status ?? null, started_at: fresh.started_at ?? null },
        coverChanged: false
      })
    } catch (error) {
      Object.assign(book.value, previous)
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      readSaving.value = false
    }
  }

  function confirmClearHistory(count) {
    return new Promise(resolve => {
      confirm.require({
        header: t('history.clearTitle'),
        message: t('history.clearMessage', { n: count }),
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'btn-danger',
        rejectClass: 'btn-text btn-secondary',
        acceptLabel: t('history.clearConfirm'),
        rejectLabel: t('common.cancel'),
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false)
      })
    })
  }

  // Contagem de leituras e progresso depois de mudar o status (o servidor sabe)
  async function refreshReadingFields() {
    try {
      const data = await api.getBookById(bookId())
      Object.assign(book.value, {
        read_count: data.read_count ?? 0,
        current_page: data.current_page ?? null,
        progress_percent: data.progress_percent ?? null,
        page_count: data.page_count ?? null
      })
    } catch {
      // Só os números do painel ficam desatualizados até reabrir
    }
  }

  // Painel de leituras: progresso, "Ler de novo", histórico
  function onReadingChanged(patch) {
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
    const local = { ...changes }
    if ('read_date' in changes) local.read_date = fromApiDate(changes.read_date)
    if ('started_at' in changes) local.started_at = fromApiDate(changes.started_at)
    Object.assign(book.value, local)
    emit('updated', { book: { book_id: bookId(), ...changes }, coverChanged: false })
    if ('reading_status' in changes && !('read_count' in changes)) refreshReadingFields()
  }

  // Nota direto da visualização, sem entrar no modo de edição.
  async function quickRate(value) {
    const previous = book.value.rating
    book.value.rating = value
    ratingSaving.value = true
    try {
      const result = await api.setRating(bookId(), value)
      book.value.rating = result?.rating ?? value
      emit('updated', { book: { book_id: bookId(), rating: book.value.rating }, coverChanged: false })
    } catch (error) {
      book.value.rating = previous
      toast.add({ severity: 'error', detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
    } finally {
      ratingSaving.value = false
    }
  }

  return { readSaving, ratingSaving, changeStatus, quickRate, onReadingChanged, refreshReadingFields }
}

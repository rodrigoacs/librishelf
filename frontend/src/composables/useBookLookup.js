import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../services/api.js'
import { hasCamera } from '../services/barcode.js'
import { useIsPhone } from './useIsPhone.js'
import { fillEmptyFields } from '../utils/bookForm.js'

/**
 * Achar os dados de um livro novo (BookEditForm): pelo ISBN digitado ou lido
 * pela câmera, ou pela busca por título. Preenche só os campos vazios.
 *
 * As chaves do Open Library só valem para o ISBN com que foram achadas (o
 * buscado, ou o do resultado da busca por título — que pode não ter ISBN);
 * se a pessoa trocar o ISBN depois, elas não são enviadas.
 *
 * form, errors: estado do formulário; selectedFile: capa escolhida (tem
 * prioridade sobre a do Open Library); isbnField, bookSearch: refs dos
 * campos, para o foco ao trocar de modo.
 */
export function useBookLookup({ form, errors, selectedFile, isbnField, bookSearch, isCreate }) {
  const { t } = useI18n()
  const phone = useIsPhone()

  const lookup = reactive({ active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
  const lookingUp = ref(false)
  const lookupState = ref('idle') // idle | found | missing | error

  function resetLookup() {
    Object.assign(lookup, { active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
    lookupState.value = 'idle'
  }

  const lookupMatchesForm = () => lookup.active && lookup.isbn === form.isbn.trim()

  function remember(isbn, found) {
    Object.assign(lookup, {
      active: true,
      isbn,
      olWorkKey: found.olWorkKey,
      olEditionKey: found.olEditionKey,
      coverId: selectedFile.value ? null : found.coverId
    })
    lookupState.value = 'found'
  }

  // Celular: com o ISBN já encontrado, o campo mostra "✓ Encontrado" e o Buscar
  // sai (volta assim que o ISBN mudar), deixando o número inteiro à vista
  const isbnFoundHere = computed(() => phone.value && lookupState.value === 'found' && lookupMatchesForm())

  const lookupMessage = computed(() => {
    if (lookupState.value === 'found') return t('isbn.found')
    if (lookupState.value === 'missing') return t('isbn.not_found')
    if (lookupState.value === 'error') return t('isbn.error')
    return t('isbn.hint')
  })

  watch(() => form.isbn, () => {
    delete errors.isbn
    if (lookup.active && !lookupMatchesForm()) resetLookup()
  })

  function onIsbnKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      lookupIsbn()
    }
  }

  // via = 'scan' quando veio da câmera (o servidor só conta, para saber se o leitor é usado)
  async function lookupIsbn(via) {
    const isbn = form.isbn.trim()
    if (!isbn || lookingUp.value) return

    lookingUp.value = true
    delete errors.isbn
    try {
      const found = await api.lookupIsbn(isbn, via === 'scan' ? 'scan' : undefined)
      fillEmptyFields(form, found)
      remember(isbn, found)
    } catch (error) {
      resetLookup()
      if (error.status === 404) lookupState.value = 'missing'
      else if (error.status === 400) errors.isbn = t('isbn.invalid')
      else lookupState.value = 'error'
    } finally {
      lookingUp.value = false
    }
  }

  // ---------------------------------------------------------------- câmera e título

  const findMode = ref('isbn') // isbn | title
  const scannerOpen = ref(false)
  const canScan = ref(false)

  onMounted(async () => {
    if (isCreate.value) canScan.value = await hasCamera()
  })

  async function setFindMode(mode) {
    if (findMode.value === mode) return
    findMode.value = mode
    await nextTick()
    if (mode === 'title') bookSearch.value?.focus()
    else isbnField.value?.focus()
  }

  // Erro no ISBN (ex.: já cadastrado) com a busca por título aberta: mostra o campo
  watch(() => errors.isbn, value => {
    if (value) findMode.value = 'isbn'
  })

  function onScanned(isbn) {
    form.isbn = isbn
    lookupIsbn('scan')
  }

  // Resultado da busca por título: mesma regra do ISBN (só campos vazios)
  async function applySearchResult(item) {
    fillEmptyFields(form, item)

    delete errors.isbn
    if ((item.isbn13 || '') === form.isbn.trim()) {
      remember(item.isbn13 || '', item)
    } else {
      resetLookup()
      lookupState.value = 'found'
    }

    findMode.value = 'isbn'
    await nextTick()
    isbnField.value?.focus()
  }

  return {
    lookup,
    lookingUp,
    resetLookup,
    lookupMatchesForm,
    isbnFoundHere,
    lookupMessage,
    onIsbnKeydown,
    lookupIsbn,
    findMode,
    scannerOpen,
    canScan,
    setFindMode,
    onScanned,
    applySearchResult
  }
}

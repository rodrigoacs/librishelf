<template>
  <Teleport to="body">
    <AppDialog
      :visible="visible"
      size="md"
      dialog-class="add-books-dialog"
      :header="t('lists.addBooksTitle')"
      @update:visible="value => emit('update:visible', value)"
    >
      <div class="picker">
        <div class="search">
          <i
            class="pi pi-search"
            aria-hidden="true"
          ></i>
          <label
            :for="`${uid}-search`"
            class="sr-only"
          >{{ t('lists.searchShelf') }}</label>
          <input
            :id="`${uid}-search`"
            ref="searchEl"
            v-model="query"
            type="search"
            :placeholder="t('lists.searchShelf')"
            autocomplete="off"
            enterkeyhint="search"
          />
        </div>
        <p class="hint">{{ query.trim() ? t('lists.resultsFor', { q: query.trim() }) : t('lists.recentBooks') }}</p>

        <p
          v-if="loading && !results.length"
          class="muted"
        >{{ t('common.loading') }}</p>
        <p
          v-else-if="loadError"
          class="muted"
        >{{ t('lists.searchFailed') }}</p>
        <p
          v-else-if="!results.length"
          class="muted"
        >{{ t('lists.noResults') }}</p>

        <ul
          v-else
          class="results"
          :aria-busy="loading"
        >
          <li
            v-for="book in results"
            :key="book.book_id"
          >
            <BookCover
              class="thumb"
              :book-id="book.book_id"
              :version="book.cover_version"
              :title="book.title"
              :author="book.authors || ''"
            />
            <span class="text">
              <span class="title">{{ book.title }}</span>
              <span
                v-if="book.authors"
                class="authors"
              >{{ book.authors }}</span>
            </span>
            <button
              type="button"
              class="toggle"
              :class="{ added: inList.has(book.book_id) }"
              :aria-pressed="inList.has(book.book_id)"
              :aria-label="inList.has(book.book_id) ? t('lists.removeBook', { title: book.title }) : t('lists.addBook', { title: book.title })"
              :disabled="busy.has(book.book_id)"
              @click="toggle(book)"
            >
              <i
                :class="inList.has(book.book_id) ? 'pi pi-check' : 'pi pi-plus'"
                aria-hidden="true"
              ></i>
              <span>{{ inList.has(book.book_id) ? t('lists.inList') : t('lists.add') }}</span>
            </button>
          </li>
        </ul>

        <div class="footer">
          <span
            class="count"
            aria-live="polite"
          >{{ t('lists.count', { n: inList.size }, inList.size) }}</span>
          <AppButton
            :label="t('lists.done')"
            class="btn-primary"
            @click="emit('update:visible', false)"
          />
        </div>
      </div>
    </AppDialog>
  </Teleport>
</template>

<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import BookCover from '../BookCover.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'

/**
 * Escolher livros da própria estante para a lista: busca (ou os mais
 * recentes) e um botão por livro para pôr ou tirar. Emite "changed" a cada
 * mudança, para a página da lista recarregar.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  listId: { type: Number, required: true },
  bookIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'changed'])
const { t } = useI18n()
const toast = useToast()

const uid = `add-books-${Math.random().toString(36).slice(2, 8)}`
const searchEl = ref(null)
const query = ref('')
const results = ref([])
const loading = ref(false)
const loadError = ref(false)
const inList = reactive(new Set())
const busy = reactive(new Set())

let timer = null
let requestId = 0

async function search() {
  const id = ++requestId
  loading.value = true
  loadError.value = false
  try {
    const term = query.value.trim()
    const data = await api.getBooks({ search: term || undefined, limit: 30, sort: 'recent' })
    if (id === requestId) results.value = data.result || []
  } catch {
    if (id === requestId) loadError.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(query, () => {
  clearTimeout(timer)
  timer = setTimeout(search, 250)
})

watch(() => props.visible, async open => {
  if (!open) return
  inList.clear()
  props.bookIds.forEach(id => inList.add(id))
  query.value = ''
  clearTimeout(timer)
  search()
  await nextTick()
  searchEl.value?.focus()
})

async function toggle(book) {
  const id = book.book_id
  const adding = !inList.has(id)
  busy.add(id)
  try {
    if (adding) {
      await api.addToList(props.listId, id)
      inList.add(id)
    } else {
      await api.removeFromList(props.listId, id)
      inList.delete(id)
    }
    emit('changed')
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.delete(id)
  }
}
</script>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: min(60vh, 32rem);
}

.search {
  position: relative;
}

.search .pi {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.search input {
  width: 100%;
  height: 2.75rem;
  padding: 0 0.85rem 0 2.4rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
}

.search input:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.hint,
.muted {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.results {
  display: flex;
  flex-direction: column;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  max-height: min(55vh, 28rem);
}

.results li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid var(--border-color);
}

.thumb {
  flex-shrink: 0;
  width: 2.4rem;
  border-radius: var(--radius-sm);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.title {
  font-weight: 600;
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.authors {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  min-height: 2.25rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-pill);
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.toggle:hover {
  border-color: var(--main-color);
  color: var(--main-color);
}

.toggle.added {
  border-color: transparent;
  background: rgba(var(--main-color-rgb), 0.14);
  color: var(--main-color);
}

.toggle:disabled {
  cursor: progress;
  opacity: 0.7;
}

.toggle:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.toggle .pi {
  font-size: var(--fs-xs);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
}

.count {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

@media (pointer: coarse) {
  .toggle {
    min-height: 44px;
  }
}

@media (max-width: 639.98px) {
  .toggle span {
    display: none;
  }

  .toggle {
    width: 44px;
    justify-content: center;
    padding: 0;
  }
}
</style>

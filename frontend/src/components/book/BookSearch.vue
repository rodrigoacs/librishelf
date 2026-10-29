<template>
  <div class="book-search">
    <TextField
      :id="`${idPrefix}-search`"
      ref="field"
      v-model="query"
      type="search"
      :label="t('bookSearch.label')"
      :hint="t('bookSearch.hint')"
      autocomplete="off"
      :input-attrs="{ enterkeyhint: 'search', onKeydown: onKeydown, 'aria-controls': `${idPrefix}-search-results` }"
    >
      <template #suffix>
        <span
          v-if="loading"
          class="search-spinner"
          aria-hidden="true"
        >
          <i class="pi pi-spinner pi-spin"></i>
        </span>
      </template>
    </TextField>

    <div
      :id="`${idPrefix}-search-results`"
      class="results"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <p
        class="sr-only"
        aria-live="polite"
      >{{ liveText }}</p>

      <ul
        v-if="loading && results.length === 0"
        class="result-list"
        aria-hidden="true"
      >
        <li
          v-for="n in 3"
          :key="n"
          class="result skeleton-row"
        >
          <AppSkeleton
            width="2.75rem"
            height="4rem"
            border-radius="var(--radius-sm)"
          />
          <div class="skeleton-text">
            <AppSkeleton
              width="70%"
              height="0.95rem"
            />
            <AppSkeleton
              width="45%"
              height="0.8rem"
            />
            <AppSkeleton
              width="55%"
              height="0.75rem"
            />
          </div>
        </li>
      </ul>

      <ul
        v-else-if="results.length"
        class="result-list"
        :class="{ stale: loading }"
      >
        <li
          v-for="(item, index) in results"
          :key="item.olWorkKey || index"
        >
          <button
            type="button"
            class="result"
            @click="emit('select', item)"
          >
            <span class="thumb">
              <img
                v-if="item.coverId && !brokenCovers.has(item.coverId)"
                :src="api.isbnCoverUrl(item.coverId, 'M')"
                alt=""
                loading="lazy"
                decoding="async"
                @error="brokenCovers.add(item.coverId)"
              />
              <i
                v-else
                class="pi pi-book"
                aria-hidden="true"
              ></i>
            </span>
            <span class="info">
              <span class="title">{{ item.title }}</span>
              <span
                v-if="item.authors.length"
                class="authors"
              >{{ item.authors.join(', ') }}</span>
              <span
                v-if="item.year || item.publisher"
                class="meta"
              >
                <span v-if="item.year">{{ item.year }}</span>
                <span v-if="item.publisher">{{ item.publisher }}</span>
              </span>
              <span
                v-if="item.isbn13"
                class="meta isbn"
              >ISBN {{ item.isbn13 }}</span>
              <span
                v-else
                class="meta no-isbn"
              >{{ t('bookSearch.noIsbn') }}</span>
            </span>
            <i
              class="pi pi-angle-right chevron"
              aria-hidden="true"
            ></i>
          </button>
        </li>
      </ul>

      <p
        v-else-if="state === 'empty'"
        class="message"
      >{{ t('bookSearch.empty', { q: lastQuery }) }}</p>

      <p
        v-else-if="state === 'error'"
        class="message error"
      >{{ errorText }}</p>

      <p
        v-if="results.length"
        class="source"
      >{{ t('bookSearch.source') }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TextField from '../form/TextField.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import api from '../../services/api.js'

/**
 * Busca de livro por título/autor no Open Library (pelo servidor). Espera a
 * pessoa parar de digitar; Enter busca na hora. Escolher um resultado emite
 * "select" com { title, authors, publisher, pubDate, isbn13, coverId, ... }.
 */
const props = defineProps({
  idPrefix: { type: String, required: true },
  initialQuery: { type: String, default: '' }
})
const emit = defineEmits(['select'])
const { t, locale } = useI18n()

const DEBOUNCE_MS = 600
const MIN_CHARS = 3

const field = ref(null)
const query = ref(props.initialQuery)
const results = ref([])
const loading = ref(false)
const state = ref('idle') // idle | done | empty | error
const errorText = ref('')
const lastQuery = ref('')
const brokenCovers = reactive(new Set())

let debounceTimer = null
let controller = null

const liveText = computed(() => {
  if (loading.value) return t('bookSearch.searching')
  if (state.value === 'done') return t('bookSearch.found', { n: results.value.length }, results.value.length)
  if (state.value === 'empty') return t('bookSearch.empty', { q: lastQuery.value })
  if (state.value === 'error') return errorText.value
  return ''
})

function normalized(text) {
  return text.replace(/\s+/g, ' ').trim()
}

async function search(text) {
  const q = normalized(text)
  if (q.length < MIN_CHARS || q === lastQuery.value && state.value !== 'error') return

  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  loading.value = true
  lastQuery.value = q
  try {
    const data = await api.searchBooks(q, locale.value, { signal })
    if (signal.aborted) return
    results.value = data.results || []
    state.value = results.value.length ? 'done' : 'empty'
  } catch (error) {
    if (error.name === 'AbortError') return
    results.value = []
    state.value = 'error'
    errorText.value = error.status === 429 ? error.message : t('bookSearch.error')
    lastQuery.value = ''
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

watch(query, value => {
  clearTimeout(debounceTimer)
  if (normalized(value).length < MIN_CHARS) {
    controller?.abort()
    loading.value = false
    results.value = []
    state.value = 'idle'
    lastQuery.value = ''
    return
  }
  debounceTimer = setTimeout(() => search(value), DEBOUNCE_MS)
}, { immediate: true })

function onKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    clearTimeout(debounceTimer)
    search(query.value)
  }
}

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  controller?.abort()
})

defineExpose({ focus: () => field.value?.focus() })
</script>

<style scoped>
.book-search {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.search-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  margin-right: 0.35rem;
  color: var(--text-secondary);
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: opacity 0.15s ease;
}

.result-list.stale {
  opacity: 0.55;
}

.result-list li + li {
  border-top: 1px solid var(--border-color);
}

.result {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

button.result:hover {
  background: var(--bg-hover);
}

button.result:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
  border-radius: var(--radius-md);
}

.thumb {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 4rem;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-input);
  color: var(--text-muted);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}

.title {
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.authors {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  column-gap: 0.5rem;
  min-width: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.meta > span + span::before {
  content: '·';
  margin-right: 0.5rem;
}

.isbn {
  font-variant-numeric: tabular-nums;
}

.no-isbn {
  font-style: italic;
}

.chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

.skeleton-row {
  cursor: default;
}

.skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}

.message {
  margin: 0;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.message.error {
  color: var(--red);
}

.source {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: right;
}

@media (pointer: coarse) {
  .result {
    min-height: 44px;
  }
}
</style>

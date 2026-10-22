<template>
  <div class="entity-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ t(`${i18nKey}.title`) }}</h1>
        <p>{{ t(`${i18nKey}.subtitle`) }}</p>
      </div>

      <div
        class="search-wrapper"
        role="search"
      >
        <i
          class="pi pi-search"
          aria-hidden="true"
        ></i>
        <label
          :for="`${i18nKey}-search`"
          class="sr-only"
        >{{ t(`${i18nKey}.search_ph`) }}</label>
        <input
          :id="`${i18nKey}-search`"
          v-model="search"
          type="search"
          :placeholder="t(`${i18nKey}.search_ph`)"
          class="modern-input"
          autocomplete="off"
        />
      </div>
    </div>

    <div
      v-if="!loading && !loadError && items.length"
      class="toolbar"
    >
      <span class="total">{{ t(`${i18nKey}.total`, { n: items.length }, items.length) }}</span>

      <div
        class="sort-group"
        role="group"
        :aria-label="t('entities.sortLabel')"
      >
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="pill"
          :class="{ active: sortBy === option.value }"
          :aria-pressed="sortBy === option.value"
          @click="sortBy = option.value"
        >{{ option.label }}</button>
      </div>

      <button
        type="button"
        class="pill merge-toggle"
        :class="{ active: merging }"
        :aria-pressed="merging"
        @click="toggleMerging"
      >
        <i
          class="pi pi-sitemap"
          aria-hidden="true"
        ></i>
        {{ merging ? t('entities.mergeCancel') : t('entities.mergeMode') }}
      </button>
    </div>

    <p
      v-if="merging"
      class="merge-help"
    >{{ t('entities.mergeHelp') }}</p>

    <div class="content-body">
      <div
        v-if="loading"
        class="entity-grid"
        aria-busy="true"
      >
        <div
          v-for="n in 8"
          :key="n"
          class="skeleton-card"
        ></div>
      </div>

      <div
        v-else-if="loadError"
        class="empty-state"
        role="alert"
      >
        <i
          class="pi pi-exclamation-triangle"
          aria-hidden="true"
        ></i>
        <p>{{ t(errorKey) }}</p>
        <AppButton
          :label="t('common.retry')"
          icon="pi pi-refresh"
          class="btn-outlined btn-secondary"
          @click="load"
        />
      </div>

      <div
        v-else-if="filteredItems.length === 0"
        class="empty-state"
      >
        <i
          :class="['pi', icon]"
          aria-hidden="true"
        ></i>
        <p>{{ t(emptyKey) }}</p>
      </div>

      <ul
        v-else
        class="entity-grid"
      >
        <li
          v-for="item in filteredItems"
          :key="item.name"
          class="entity-item"
        >
          <component
            :is="merging ? 'button' : 'router-link'"
            v-bind="merging
              ? { type: 'button', 'aria-pressed': selected.has(item.name) }
              : { to: { path: '/books', query: { [queryParam]: item.name } } }"
            class="entity-card"
            :class="{ 'is-selected': merging && selected.has(item.name) }"
            :style="{ '--accent-color': tagColor(item.name) }"
            @click="merging && toggleSelected(item.name)"
          >
            <span
              v-if="merging"
              class="select-check"
              :class="{ checked: selected.has(item.name) }"
              aria-hidden="true"
            ><i class="pi pi-check"></i></span>
            <span
              class="avatar-wrapper"
              aria-hidden="true"
            >
              <span
                v-if="variant === 'initials'"
                class="initials"
              >{{ initials(item.name) }}</span>
              <span
                v-else-if="variant === 'tag'"
                class="hash-symbol"
              >#</span>
              <i
                v-else
                :class="['pi', icon]"
              ></i>
            </span>

            <span class="entity-info">
              <span class="entity-name">{{ item.name }}</span>
              <span class="entity-meta">
                {{ item.count ? t(`${i18nKey}.bookCount`, { count: item.count }, item.count) : t(viewKey) }}
                <template v-if="item.count && item.read !== undefined"> · {{ t('entities.readCount', { n: item.read }, item.read) }}</template>
              </span>
              <span
                v-if="item.count && item.read !== undefined"
                class="read-bar"
                aria-hidden="true"
              ><span :style="{ width: `${Math.round((item.read / item.count) * 100)}%` }"></span></span>
            </span>

            <i
              v-if="!merging"
              class="pi pi-chevron-right arrow-icon"
              aria-hidden="true"
            ></i>
          </component>

          <button
            v-if="!merging"
            type="button"
            class="rename-btn"
            :aria-label="t('entities.renameOf', { name: item.name })"
            v-tooltip.top="t('entities.rename')"
            @click="openRename(item)"
          >
            <i
              class="pi pi-pencil"
              aria-hidden="true"
            ></i>
          </button>
        </li>
      </ul>
    </div>

    <div
      v-if="merging"
      class="merge-bar"
      role="toolbar"
      :aria-label="t('entities.mergeMode')"
    >
      <span aria-live="polite">{{ t('entities.selected', { n: selected.size }, selected.size) }}</span>
      <AppButton
        :label="t('entities.mergeAction')"
        icon="pi pi-sitemap"
        class="btn-sm btn-primary"
        :disabled="selected.size < 2"
        @click="openMerge"
      />
    </div>

    <AppDialog
      v-model:visible="nameDialog.visible"
      size="sm"
      :header="nameDialog.mode === 'merge' ? t('entities.mergeTitle', { n: nameDialog.from.length }) : t('entities.renameTitle')"
    >
      <form
        class="name-form"
        @submit.prevent="submitName"
      >
        <p
          v-if="nameDialog.mode === 'merge'"
          class="name-hint"
        >{{ t('entities.mergeExplain') }}</p>
        <ul
          v-if="nameDialog.mode === 'merge'"
          class="merge-list"
        >
          <li
            v-for="name in nameDialog.from"
            :key="name"
          >
            <button
              type="button"
              class="pill"
              :class="{ active: nameDialog.to === name }"
              @click="nameDialog.to = name"
            >{{ name }}</button>
          </li>
        </ul>
        <label for="entity-new-name">{{ t('entities.finalName') }}</label>
        <input
          id="entity-new-name"
          v-model="nameDialog.to"
          class="plain-input"
          maxlength="200"
          autocomplete="off"
        />
        <p
          v-if="mergeTarget"
          class="name-warning"
        >
          <i
            class="pi pi-info-circle"
            aria-hidden="true"
          ></i>
          {{ t('entities.willMerge', { name: mergeTarget }) }}
        </p>
        <div class="name-actions">
          <AppButton
            type="button"
            :label="t('common.cancel')"
            class="btn-text btn-sm"
            @click="nameDialog.visible = false"
          />
          <AppButton
            type="submit"
            :label="nameDialog.mode === 'merge' || mergeTarget ? t('entities.mergeAction') : t('common.save')"
            class="btn-sm btn-primary"
            :loading="saving"
            :disabled="!nameDialog.to.trim()"
          />
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<script setup>
import { tagColor } from '../utils/tagColors.js'
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import api from '../services/api.js'

/**
 * Tela de lista usada por Autores, Editoras e Tags (antes eram três arquivos
 * quase idênticos). Cada item leva para /books já filtrado.
 */
const props = defineProps({
  i18nKey: { type: String, required: true },          // 'authors' | 'publishers' | 'tags'
  fetcher: { type: Function, required: true },
  queryParam: { type: String, required: true },       // 'author' | 'publisher' | 'tags'
  icon: { type: String, default: 'pi-folder' },
  variant: { type: String, default: 'icon' },         // 'initials' | 'icon' | 'tag'
  emptyKey: { type: String, required: true },
  errorKey: { type: String, required: true },
  viewKey: { type: String, required: true }
})

const { t } = useI18n()
const toast = useToast()


const items = ref([])
const loading = ref(true)
const loadError = ref(false)
const search = ref('')

// Ordem: nome (A–Z), mais livros ou mais lidos. Lembrada neste navegador.
const SORT_KEY = `entities-sort-${props.queryParam}`
const sortBy = ref((() => {
  try { return localStorage.getItem(SORT_KEY) || 'name' } catch { return 'name' }
})())

const sortOptions = computed(() => [
  { value: 'name', label: t('entities.sortName') },
  { value: 'count', label: t('entities.sortCount') },
  { value: 'read', label: t('entities.sortRead') }
])

const filteredItems = computed(() => {
  try { localStorage.setItem(SORT_KEY, sortBy.value) } catch { /* modo privado */ }
  const term = search.value.trim().toLocaleLowerCase()
  const list = term ? items.value.filter(item => item.name.toLocaleLowerCase().includes(term)) : [...items.value]
  const byName = (a, b) => a.name.localeCompare(b.name)
  if (sortBy.value === 'count') return list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || byName(a, b))
  if (sortBy.value === 'read') return list.sort((a, b) => (b.read ?? 0) - (a.read ?? 0) || byName(a, b))
  return list.sort(byName)
})

// ---------------------------------------------------------------------------
// Renomear e mesclar
// ---------------------------------------------------------------------------
const merging = ref(false)
const selected = ref(new Set())
const saving = ref(false)
const nameDialog = reactive({ visible: false, mode: 'rename', from: [], to: '' })

function toggleMerging() {
  merging.value = !merging.value
  selected.value = new Set()
}

function toggleSelected(name) {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}

function openRename(item) {
  Object.assign(nameDialog, { visible: true, mode: 'rename', from: [item.name], to: item.name })
}

function openMerge() {
  const chosen = items.value.filter(item => selected.value.has(item.name))
  // Sugere o nome com mais livros como nome final.
  const best = [...chosen].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]
  Object.assign(nameDialog, { visible: true, mode: 'merge', from: chosen.map(item => item.name), to: best?.name ?? '' })
}

// Renomear para um nome que já existe (e não está na lista de origem) junta os dois.
const mergeTarget = computed(() => {
  const to = nameDialog.to.trim().toLocaleLowerCase()
  if (!to) return null
  const fromKeys = nameDialog.from.map(name => name.toLocaleLowerCase())
  const existing = items.value.find(item => item.name.toLocaleLowerCase() === to)
  return existing && !fromKeys.includes(to) ? existing.name : null
})

async function submitName() {
  const to = nameDialog.to.trim()
  if (!to) return
  if (nameDialog.mode === 'rename' && to === nameDialog.from[0]) {
    nameDialog.visible = false
    return
  }
  saving.value = true
  try {
    await api.mergeNames(props.queryParam, nameDialog.from, to)
    toast.add({
      severity: 'success',
      summary: t('common.success'),
      detail: nameDialog.mode === 'merge' || mergeTarget.value ? t('entities.mergedToast', { name: to }) : t('entities.renamedToast', { name: to }),
      life: 3000
    })
    nameDialog.visible = false
    merging.value = false
    selected.value = new Set()
    await load()
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    saving.value = false
  }
}

function initials(name) {
  if (!name) return '?'
  // "Sobrenome, Nome" vira "Nome Sobrenome" antes de pegar as letras.
  const [last, first] = name.split(',').map(part => part.trim())
  const ordered = first ? `${first} ${last}` : name
  const words = ordered.split(/\s+/).filter(word => /^\p{L}/u.test(word))
  if (words.length === 0) return name.trim().charAt(0).toUpperCase() || '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words.at(-1)[0]
  return letters.toUpperCase()
}


async function load() {
  loading.value = true
  loadError.value = false

  try {
    const response = await props.fetcher()
    items.value = response
      .map(item => (typeof item === 'string' ? { name: item, count: null } : item))
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.entity-container {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 3rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.header-content h1 {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  color: var(--text-primary);
  margin: 0;
}

.header-content p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0 0;
}

.search-wrapper {
  position: relative;
  width: 100%;
  max-width: 300px;
}

.search-wrapper i {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.modern-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem 0.8rem 2.5rem;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--fs-md);
  transition: all 0.2s;
}

.modern-input:focus {
  border-color: var(--main-color);
  outline: none;
  background-color: var(--bg-panel);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
  margin: -1.5rem 0 1.5rem;
}

.total {
  color: var(--text-secondary);
  font-size: var(--fs-md);
  margin-right: auto;
}

.sort-group {
  display: inline-flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.pill:hover {
  color: var(--text-primary);
  border-color: var(--main-color);
}

.pill.active {
  background: var(--main-solid);
  border-color: var(--main-solid);
  color: var(--on-main);
}

.pill:focus-visible,
.rename-btn:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.merge-help {
  margin: -0.75rem 0 1.25rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.entity-item {
  position: relative;
}

button.entity-card {
  width: 100%;
  font: inherit;
  text-align: left;
}

.entity-card.is-selected {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

.select-check {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.select-check.checked {
  background: var(--main-solid);
  border-color: var(--main-solid);
  color: var(--on-main);
}

.select-check .pi {
  font-size: var(--fs-xs);
  font-weight: 700;
}

.read-bar {
  display: block;
  height: 4px;
  margin-top: 0.45rem;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
  max-width: 10rem;
}

.read-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent-color);
}

/* Lápis de renomear: canto superior direito do card. */
.rename-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.rename-btn .pi {
  font-size: var(--fs-xs);
}

.rename-btn:hover {
  color: var(--text-primary);
  border-color: var(--main-color);
}

@media (hover: hover) {
  .rename-btn {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .entity-item:hover .rename-btn,
  .rename-btn:focus-visible {
    opacity: 1;
  }
}

.merge-bar {
  position: sticky;
  bottom: 1rem;
  z-index: 50;
  margin: 1.5rem auto 0;
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
  border-radius: 16px;
  background: var(--bg-panel);
  border: 1px solid rgba(var(--main-color-rgb), 0.45);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  font-weight: 700;
  color: var(--text-primary);
}

.name-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.name-form label,
.name-hint {
  margin: 0;
  font-size: var(--fs-md);
  color: var(--text-secondary);
}

.merge-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.plain-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  color: var(--text-primary);
  font: inherit;
}

.plain-input:focus {
  border-color: var(--main-color);
  outline: none;
}

.name-warning {
  margin: 0;
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  font-size: var(--fs-sm);
  color: var(--text-primary);
  background: rgba(var(--main-color-rgb), 0.1);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.name-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.entity-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.entity-card {
  --accent-color: var(--main-color);
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  height: 100%;
}

.entity-card:hover,
.entity-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--accent-color);
  background-color: var(--bg-hover);
}

.avatar-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-color) 14%, var(--bg-panel));
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--accent-color) 35%, transparent);
  flex-shrink: 0;
  color: var(--accent-color);
  font-size: var(--fs-lg);
}

.initials {
  font-weight: 700;
  font-size: var(--fs-lg);
  letter-spacing: 1px;
}

.hash-symbol {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-xl);
}

.entity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.entity-name {
  color: var(--text-primary);
  font-size: var(--fs-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-meta {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.arrow-icon {
  color: var(--text-muted);
  transition: transform 0.2s, color 0.2s;
}

.entity-card:hover .arrow-icon,
.entity-card:focus-visible .arrow-icon {
  color: var(--text-primary);
  transform: translateX(3px);
}

.skeleton-card {
  height: 98px;
  background-color: var(--bg-hover);
  border-radius: 12px;
  animation: pulse 1.5s infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-muted);
  text-align: center;
}

.empty-state>i {
  font-size: var(--fs-3xl);
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.6;
  }
}

@media (max-width: 640px) {
  .entity-container {
    padding: 1.25rem;
  }

  .header-content h1 {
    font-size: var(--fs-2xl);
  }

  .search-wrapper {
    max-width: none;
  }
}

/* Tela de toque: área de toque de 44px sem mudar o desenho de 30px */
@media (pointer: coarse) {
  .rename-btn::after {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
  }
}
</style>
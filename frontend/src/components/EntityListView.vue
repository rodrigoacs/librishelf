<template>
  <div class="page entity-container">
    <PageHeader
      :title="t(`${i18nKey}.title`)"
      :subtitle="t(`${i18nKey}.subtitle`)"
      divider
    >
      <template #after-title>
        <AppSkeleton
          v-if="loading"
          width="5rem"
          height="1.2rem"
        />
        <span
          v-else-if="!loadError"
          class="count-badge"
        >{{ t(`${i18nKey}.total`, { n: items.length }, items.length) }}</span>
      </template>
      <template #actions>
        <SearchField
          :id="`${i18nKey}-search`"
          v-model="search"
          :placeholder="t(`${i18nKey}.search_ph`)"
        />
      </template>
    </PageHeader>

    <!-- Enquanto carrega, a linha já ocupa o lugar (contagem em esqueleto,
         botões desabilitados): a lista não desce quando os dados chegam -->
    <div
      v-if="loading || (!loadError && items.length)"
      class="toolbar"
    >
      <div
        class="sort-group"
        role="group"
        :aria-label="t('entities.sortLabel')"
      >
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="pill-button"
          :class="{ active: sortBy === option.value }"
          :aria-pressed="sortBy === option.value"
          :disabled="loading"
          @click="sortBy = option.value"
        >{{ option.label }}</button>
      </div>

      <button
        type="button"
        class="pill-button merge-toggle"
        :class="{ active: merging }"
        :aria-pressed="merging"
        :disabled="loading"
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

      <EmptyState
        v-else-if="loadError"
        variant="error"
        :title="t(errorKey)"
        @action="load"
      />

      <!-- Nenhum item ainda: explica de onde eles vêm e oferece o próximo passo -->
      <EmptyState
        v-else-if="items.length === 0"
        :icon="`pi ${icon}`"
        :title="t(`entities.empty.${i18nKey}.title`)"
        :text="t(`entities.empty.${i18nKey}.text`)"
        :action-label="i18nKey === 'tags' ? '' : t('home.addBook')"
        action-icon="pi pi-plus"
        @action="addBookVisible = true"
      >
        <template
          v-if="i18nKey === 'tags'"
          #action
        >
          <router-link
            :to="{ name: 'library' }"
            class="btn btn-primary"
          >
            <i
              class="pi pi-book"
              aria-hidden="true"
            ></i>
            <span>{{ t('entities.empty.openLibrary') }}</span>
          </router-link>
        </template>
      </EmptyState>

      <!-- A busca não achou nada -->
      <EmptyState
        v-else-if="filteredItems.length === 0"
        icon="pi pi-search"
        :title="t(emptyKey)"
        :action-label="t('entities.empty.clearSearch')"
        action-icon="pi pi-times"
        action-class="btn-outlined btn-secondary"
        @action="search = ''"
      />

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
              class="pill-button"
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
          class="notice"
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

    <AddBookDialog
      v-if="i18nKey !== 'tags'"
      v-model:visible="addBookVisible"
      @save="load"
    />
  </div>
</template>

<script setup>
import PageHeader from './ui/PageHeader.vue'
import { tagColor } from '../utils/tagColors.js'
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { bookCreatedTick } from '../services/appNav.js'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import AppSkeleton from './ui/AppSkeleton.vue'
import EmptyState from './ui/EmptyState.vue'
import AddBookDialog from './AddBookDialog.vue'
import api from '../services/api.js'
import SearchField from './ui/SearchField.vue'

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
const addBookVisible = ref(false)
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
      detail: nameDialog.mode === 'merge' || mergeTarget.value ? t('entities.mergedToast', { name: to }) : t('entities.renamedToast', { name: to }),
      life: 3000
    })
    nameDialog.visible = false
    merging.value = false
    selected.value = new Set()
    await load()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
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


// Livro novo pelo "+" da barra de abas (celular)
watch(bookCreatedTick, () => load())

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
/* Casca e recuo em .page (main.css) */

/* Busca logo após o título, como na Biblioteca: o título não cresce e a busca
   ocupa o espaço livre (até 760 px; linha inteira no celular) */
.entity-container > .page-header {
  justify-content: flex-start;
}

.entity-container > .page-header :deep(.page-header-main) {
  flex: 0 1 auto;
}

.entity-container > .page-header :deep(.page-header-actions) {
  flex: 1 1 300px;
  max-width: 760px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3) var(--space-4);
  flex-wrap: wrap;
  margin: 0 0 var(--space-6);
}

.sort-group {
  display: inline-flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.rename-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.merge-help {
  margin: -0.75rem 0 var(--space-5);
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
  border-radius: var(--radius-sm);
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
  margin-top: var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--bg-hover);
  overflow: hidden;
  max-width: 10rem;
}

.read-bar span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
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
  margin: var(--space-6) auto 0;
  width: fit-content;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  border: 1px solid rgba(var(--main-color-rgb), 0.45);
  box-shadow: var(--shadow-3);
  font-weight: 700;
  color: var(--text-primary);
}

.name-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
  gap: var(--space-2);
}

.plain-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font: inherit;
}

.plain-input:focus {
  border-color: var(--main-color);
  outline: none;
}

.name-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.entity-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-6);
}

.entity-card {
  --accent-color: var(--main-color);
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-4);
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
  color: color-mix(in srgb, var(--accent-color) var(--tint-text), var(--text-primary));
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
  border-radius: var(--radius-md);
  animation: pulse 1.5s infinite;
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

@media (max-width: 639.98px) {
  .entity-container > .page-header :deep(.page-header-actions) {
    flex-basis: 100%;
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
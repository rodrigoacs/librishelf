<template>
  <!-- Página pública (pacote 33): apresentação e livros favoritos. Linhas que
       abrem folhas, como o resto da Conta. -->
  <section
    id="settings-profile-page"
    class="settings-group"
    aria-labelledby="settings-group-profile-page"
    tabindex="-1"
  >
    <h2
      id="settings-group-profile-page"
      class="section-title group-title"
    >{{ t('profilePage.title') }}</h2>

    <div class="group-list">
      <SettingsRow
        :label="t('profilePage.bio')"
        :value="bioValue"
        icon="pi pi-align-left"
        interactive
        @click="openBio"
      />
      <SettingsRow
        :label="t('profilePage.favorites')"
        :value="t('profilePage.favoritesValue', { n: favorites.length, max: MAX_FAVORITES })"
        icon="pi pi-star"
        interactive
        @click="openFavorites"
      />
      <router-link
        v-if="publicName"
        :to="{ name: 'public-library', params: { username: publicName } }"
        class="view-link"
      >
        <span>{{ t('profilePage.view') }}</span>
        <i
          class="pi pi-arrow-up-right"
          aria-hidden="true"
        ></i>
      </router-link>
    </div>

    <!-- Apresentação -->
    <AppDialog
      :visible="sheet === 'bio'"
      size="sm"
      dialog-class="settings-sheet"
      :header="t('profilePage.bio')"
      @update:visible="value => { if (!value) sheet = '' }"
    >
      <form
        class="sheet-stack"
        novalidate
        @submit.prevent="saveBio"
      >
        <p
          v-if="bioHidden"
          class="sheet-note danger"
        >{{ t('profilePage.bioHidden') }}</p>
        <TextField
          id="settings-bio"
          v-model="bioDraft"
          :label="t('profilePage.bioLabel')"
          :hint="t('profilePage.bioHint', { n: bioLength, max: MAX_BIO })"
          hint-live
          :maxlength="MAX_BIO + 10"
          multiline
          rows="3"
          :error="bioError"
        />
        <div class="sheet-actions">
          <AppButton
            type="submit"
            :label="t('common.save')"
            :loading="busy"
          />
          <AppButton
            v-if="bio"
            :label="t('profilePage.bioRemove')"
            class="btn-text btn-danger"
            :disabled="busy"
            @click="removeBio"
          />
        </div>
      </form>
    </AppDialog>

    <!-- Favoritos: escolhidos na ordem; busca na própria estante -->
    <AppDialog
      :visible="sheet === 'favorites'"
      size="sm"
      dialog-class="settings-sheet"
      :header="t('profilePage.favorites')"
      @update:visible="value => { if (!value) sheet = '' }"
    >
      <div class="sheet-stack">
        <p class="sheet-help">{{ t('profilePage.favoritesHelp', { max: MAX_FAVORITES }) }}</p>

        <ol
          v-if="favorites.length"
          class="chosen-list"
        >
          <li
            v-for="(item, index) in favorites"
            :key="item.bookId"
          >
            <BookCover
              class="chosen-cover"
              aria-hidden="true"
              :book-id="item.bookId"
              :version="item.coverVersion"
              :title="item.title"
              :author="item.authors || ''"
            />
            <span class="chosen-title">{{ item.title }}</span>
            <IconButton
              icon="pi pi-arrow-up"
              :label="t('profilePage.moveUp', { title: item.title })"
              :disabled="busy || index === 0"
              @click="move(index, -1)"
            />
            <IconButton
              icon="pi pi-times"
              :label="t('profilePage.removeFavorite', { title: item.title })"
              :disabled="busy"
              @click="removeFavorite(item.bookId)"
            />
          </li>
        </ol>

        <template v-if="favorites.length < MAX_FAVORITES">
          <SearchField
            id="settings-favorites-search"
            v-model="query"
            :placeholder="t('profilePage.searchPlaceholder')"
            size="sm"
          />
          <p
            v-if="searching"
            class="sheet-help"
            role="status"
          >{{ t('common.loading') }}</p>
          <ul
            v-else-if="results.length"
            class="result-list"
          >
            <li
              v-for="book in results"
              :key="book.book_id"
            >
              <button
                type="button"
                class="result"
                :disabled="busy"
                @click="addFavorite(book)"
              >
                <span class="result-text">
                  <span class="chosen-title">{{ book.title }}</span>
                  <span
                    v-if="book.authors"
                    class="result-author"
                  >{{ book.authors }}</span>
                </span>
                <i
                  class="pi pi-plus"
                  aria-hidden="true"
                ></i>
              </button>
            </li>
          </ul>
          <p
            v-else-if="query.trim()"
            class="sheet-help"
          >{{ t('profilePage.noResults') }}</p>
        </template>
      </div>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import SearchField from '../ui/SearchField.vue'
import TextField from '../form/TextField.vue'
import IconButton from '../form/IconButton.vue'
import BookCover from '../BookCover.vue'
import SettingsRow from './SettingsRow.vue'
import api from '../../services/api.js'
import { currentUser } from '../../services/session.js'
import { useToast } from '../../services/toast.js'

const MAX_BIO = 160
const MAX_FAVORITES = 5
const SEARCH_DEBOUNCE = 300

const { t } = useI18n()
const toast = useToast()

const bio = ref(null)
const bioHidden = ref(false)
const favorites = ref([])
const sheet = ref('')
const busy = ref(false)

// Link "Ver minha página" só com a biblioteca pública ligada
const publicName = computed(() => currentUser.value?.isPublic ? currentUser.value.name : '')

const bioValue = computed(() => {
  if (!bio.value) return t('profilePage.bioNone')
  const line = bio.value.split('\n')[0]
  return line.length > 32 ? `${line.slice(0, 31)}…` : line
})

function keep(page) {
  bio.value = page.bio
  bioHidden.value = page.bioHidden
  favorites.value = page.favorites
}

onMounted(async () => {
  try {
    keep(await api.getProfilePage())
  } catch {
    // Conta sem a página carregada: as linhas mostram o padrão
  }
})

// --- Apresentação
const bioDraft = ref('')
const bioError = ref('')
const bioLength = computed(() => [...bioDraft.value.trim()].length)

function openBio() {
  bioDraft.value = bio.value ?? ''
  bioError.value = ''
  sheet.value = 'bio'
}

async function saveBio() {
  bioError.value = ''
  if (bioLength.value > MAX_BIO) {
    bioError.value = t('errors.BIO_TOO_LONG', { max: MAX_BIO })
    return
  }
  busy.value = true
  try {
    keep(await api.saveBio(bioDraft.value.trim() || null))
    sheet.value = ''
    toast.add({ severity: 'success', detail: t('profilePage.bioSaved'), life: 3000 })
  } catch (error) {
    bioError.value = error.message
  } finally {
    busy.value = false
  }
}

async function removeBio() {
  bioDraft.value = ''
  await saveBio()
}

// --- Favoritos
const query = ref('')
const results = ref([])
const searching = ref(false)
let searchTimer = null

function openFavorites() {
  query.value = ''
  results.value = []
  sheet.value = 'favorites'
}

watch(query, value => {
  clearTimeout(searchTimer)
  const text = value.trim()
  if (!text) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const response = await api.getBooks({ search: text, limit: 8, sort: 'title', order: 'asc' })
      if (query.value.trim() !== text) return
      const chosen = new Set(favorites.value.map(item => item.bookId))
      results.value = (response.result || []).filter(book => !chosen.has(book.book_id))
    } catch {
      results.value = []
    } finally {
      if (query.value.trim() === text) searching.value = false
    }
  }, SEARCH_DEBOUNCE)
})

async function saveFavorites(ids) {
  busy.value = true
  try {
    keep(await api.saveFavorites(ids))
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = false
  }
}

async function addFavorite(book) {
  await saveFavorites([...favorites.value.map(item => item.bookId), book.book_id])
  query.value = ''
}

const removeFavorite = id => saveFavorites(favorites.value.filter(item => item.bookId !== id).map(item => item.bookId))

function move(index, step) {
  const ids = favorites.value.map(item => item.bookId)
  const target = index + step
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  saveFavorites(ids)
}
</script>

<style scoped>
.settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings-group:focus {
  outline: none;
}

.group-title {
  margin: 0;
  padding: 0 var(--space-4);
}

.group-list {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.view-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 3rem;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-color);
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
}

.view-link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: calc(-1 * var(--focus-offset));
}

.sheet-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sheet-help {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.sheet-note {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--red-rgb), 0.1);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.sheet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chosen-list,
.result-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chosen-list li {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-color);
}

.chosen-cover {
  width: 2.25rem;
}

.chosen-title {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  min-height: 3rem;
  padding: var(--space-2) 0;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.result:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.result .pi {
  color: var(--main-color);
}

.result-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.result-author {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

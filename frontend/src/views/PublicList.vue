<template>
  <div class="public-list-page">
    <div class="public-list-content">
      <div class="top">
        <router-link
          to="/"
          class="brand"
        >
          <img
            src="/bookshelf.png"
            alt=""
            width="28"
            height="28"
          />
          <span>LIBRISHELF</span>
        </router-link>
      </div>

      <div
        v-if="loading"
        class="skeletons"
        aria-busy="true"
        :aria-label="t('common.loading')"
      >
        <AppSkeleton
          width="60%"
          height="2.5rem"
        />
        <AppSkeleton
          v-for="n in 4"
          :key="n"
          height="5.5rem"
          border-radius="var(--radius-md)"
        />
      </div>

      <EmptyState
        v-else-if="notFound"
        icon="pi pi-lock"
        :level="1"
        :title="t('lists.publicNotFound')"
        :text="t('lists.publicNotFoundText')"
      >
        <template #action>
          <router-link
            :to="{ name: 'public-library', params: { username } }"
            class="btn btn-outlined btn-secondary"
          >{{ t('lists.seeLibrary', { name: username }) }}</router-link>
        </template>
      </EmptyState>

      <!-- Erro de rede/servidor: mensagem e "Tentar de novo" (antes, só um toast) -->
      <EmptyState
        v-else-if="loadError"
        variant="error"
        :level="1"
        :title="t('lists.loadOneFailed')"
        @action="load"
      />

      <template v-else-if="list">
        <header class="list-header">
          <router-link
            :to="{ name: 'public-library', params: { username } }"
            class="owner"
          >
            <ReaderAvatar
              :username="list.owner.username"
              size="sm"
            />
            <span>{{ t('lists.byOwner', { name: list.owner.username }) }}</span>
          </router-link>
          <h1>{{ list.title }}</h1>
          <p
            v-if="list.description"
            class="description"
          >{{ list.description }}</p>
          <div class="meta-row">
            <span class="meta">
              {{ t('lists.count', { n: list.items.length }, list.items.length) }}
              · {{ t('lists.updatedOn', { date: formatDate(list.updatedAt) }) }}
            </span>
            <AppButton
              :label="t('lists.share')"
              icon="pi pi-share-alt"
              class="btn-outlined btn-secondary btn-sm"
              @click="share"
            />
          </div>
        </header>

        <ol class="items">
          <li
            v-for="(item, index) in list.items"
            :key="item.bookId"
            class="item"
          >
            <ListBookRow
              :item="item"
              :rank="list.ranked ? index + 1 : null"
              @open="openBook"
            />
          </li>
        </ol>

        <p class="cta">
          <i18n-t
            scope="global"
            keypath="lists.cta"
            tag="span"
          >
            <template #library>
              <router-link :to="{ name: 'public-library', params: { username } }">{{ t('lists.ctaLibrary', { name: username }) }}</router-link>
            </template>
          </i18n-t>
        </p>
      </template>
    </div>

    <BookDialog
      v-if="openedBookId"
      v-model="bookDialogOpen"
      :book-id="openedBookId"
      is-read-only
      :owner-username="username"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import BookDialog from '../components/BookDialog.vue'
import ListBookRow from '../components/list/ListBookRow.vue'
import api from '../services/api.js'
import { useToast } from '../services/toast.js'
import { setOverlayTitle } from '../services/pageTitle.js'
import { shareLink } from '../utils/share.js'
import { slugify } from '../utils/slug.js'

/**
 * Página pública de uma lista (/u/<nome>/lists/<id>/<nome-da-lista>). A
 * prévia no WhatsApp vem do nginx (SSI); aqui é o conteúdo.
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const list = ref(null)
const loading = ref(true)
const notFound = ref(false)
const loadError = ref(false)
const openedBookId = ref(null)
const bookDialogOpen = ref(false)

const username = computed(() => String(route.params.username))
const listId = computed(() => Number(route.params.id))

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
}

async function load() {
  loading.value = true
  notFound.value = false
  loadError.value = false
  try {
    list.value = (await api.getPublicList(username.value, listId.value)).list
    // Corrige o nome no fim da URL (link antigo, lista renomeada)
    const slug = slugify(list.value.title)
    if (slug && route.params.slug !== slug) {
      router.replace({ name: 'public-list', params: { username: username.value, id: listId.value, slug }, query: route.query })
    }
  } catch (error) {
    list.value = null
    if (error.status === 404 || error.status === 400) notFound.value = true
    else loadError.value = true
  } finally {
    loading.value = false
  }
}

// Título da aba: "Melhores de 2026 · Librishelf" (a lista no lugar do genérico)
watch(list, value => setOverlayTitle(value ? value.title : ''))
// O livro aberto põe o título dele; ao fechar, volta o da lista
watch(bookDialogOpen, open => {
  if (!open) setTimeout(() => { if (list.value && !bookDialogOpen.value) setOverlayTitle(list.value.title) })
})

function openBook(bookId) {
  openedBookId.value = bookId
  bookDialogOpen.value = true
}

async function share() {
  const url = window.location.href.split('?')[0]
  const result = await shareLink({ title: list.value.title, text: t('lists.shareText', { title: list.value.title }), url })
  if (result === 'copied') toast.add({ severity: 'success', summary: t('lists.linkCopied'), detail: url, life: 3500 })
  else if (result === 'failed') toast.add({ severity: 'info', summary: t('lists.copyThis'), detail: url, life: 8000 })
}

watch(() => [route.params.username, route.params.id], ([user, id], [oldUser, oldId] = []) => {
  if (user !== oldUser || id !== oldId) load()
})

onMounted(load)
onBeforeUnmount(() => setOverlayTitle(''))
</script>

<style scoped>
.public-list-page {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.public-list-content {
  max-width: 760px;
  margin: 0 auto;
}

.top {
  margin-bottom: 2rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: var(--fs-sm);
}

.brand:hover {
  color: var(--text-primary);
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-header {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-decoration: none;
}

.owner:hover {
  color: var(--main-color);
}

.list-header h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.description {
  margin: 0;
  color: var(--text-secondary);
  white-space: pre-line;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.meta {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}

.cta {
  margin: 2rem 0 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.cta a {
  color: var(--main-color);
}

@media (max-width: 639.98px) {
  .public-list-page {
    padding: 1.25rem;
  }

  .list-header h1 {
    font-size: var(--fs-2xl);
  }
}
</style>

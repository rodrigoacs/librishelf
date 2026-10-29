<template>
  <div class="list-page">
    <div class="list-content">
      <router-link
        :to="{ name: 'lists' }"
        class="back"
      >
        <i
          class="pi pi-arrow-left"
          aria-hidden="true"
        ></i>
        {{ t('lists.back') }}
      </router-link>

      <div
        v-if="loading && !list"
        aria-busy="true"
        :aria-label="t('common.loading')"
        class="skeletons"
      >
        <AppSkeleton
          width="60%"
          height="2.5rem"
        />
        <AppSkeleton
          v-for="n in 4"
          :key="n"
          height="5.5rem"
          border-radius="10px"
        />
      </div>

      <EmptyState
        v-else-if="notFound"
        icon="pi pi-list"
        :level="1"
        :title="t('lists.notFound')"
      >
        <template #action>
          <router-link
            :to="{ name: 'lists' }"
            class="btn btn-outlined btn-secondary"
          >{{ t('lists.back') }}</router-link>
        </template>
      </EmptyState>

      <!-- Erro sem a lista na tela: mensagem e "Tentar de novo" (antes, só um toast) -->
      <EmptyState
        v-else-if="loadError && !list"
        variant="error"
        :level="1"
        :title="t('lists.loadOneFailed')"
        :loading="loading"
        @action="load"
      />

      <template v-else-if="list">
        <header class="list-header">
          <div class="heading">
            <h1>{{ list.title }}</h1>
            <p
              v-if="list.description"
              class="description"
            >{{ list.description }}</p>
            <p class="meta">
              <span>{{ t('lists.count', { n: list.items.length }, list.items.length) }}</span>
              <span
                class="visibility"
                :class="{ public: list.isPublic }"
              >
                <i
                  :class="list.isPublic ? 'pi pi-globe' : 'pi pi-lock'"
                  aria-hidden="true"
                ></i>
                {{ list.isPublic ? t('lists.public') : t('lists.private') }}
              </span>
              <span v-if="list.ranked">{{ t('lists.rankedShort') }}</span>
            </p>
          </div>
          <div class="actions">
            <AppButton
              :label="t('lists.addBooks')"
              icon="pi pi-plus"
              class="btn-primary"
              :disabled="isOffline"
              @click="pickerOpen = true"
            />
            <AppButton
              v-if="canShare"
              :label="t('lists.share')"
              icon="pi pi-share-alt"
              class="btn-outlined btn-secondary share-btn"
              @click="share"
            />
            <IconButton
              icon="pi pi-ellipsis-h"
              :label="t('lists.moreActions')"
              aria-haspopup="true"
              aria-controls="list-more-menu"
              @click="event => moreMenu.toggle(event)"
            />
            <PopupMenu
              id="list-more-menu"
              ref="moreMenu"
              :items="moreItems"
            />
          </div>
        </header>

        <p
          v-if="list.isPublic && !currentUser?.isPublic"
          class="notice"
        >
          <i
            class="pi pi-info-circle"
            aria-hidden="true"
          ></i>
          <i18n-t
            scope="global"
            keypath="lists.privateLibraryHint"
            tag="span"
          >
            <template #settings>
              <router-link :to="{ name: 'settings' }">{{ t('review.settingsLink') }}</router-link>
            </template>
          </i18n-t>
        </p>

        <EmptyState
          v-if="!list.items.length"
          compact
          icon="pi pi-book"
          :title="t('lists.emptyList')"
          :action-label="t('lists.addBooks')"
          action-icon="pi pi-plus"
          :action-disabled="isOffline"
          @action="pickerOpen = true"
        />

        <template v-else>
          <p
            v-if="list.items.length > 1 && !isOffline"
            :id="`${uid}-help`"
            class="reorder-help"
          >
            <i
              class="pi pi-arrows-v"
              aria-hidden="true"
            ></i>
            {{ t('lists.reorderHelp') }}
          </p>
          <ol
            ref="listEl"
            class="items"
          >
            <li
              v-for="(item, index) in list.items"
              :key="item.bookId"
              class="item"
              :class="{ moved: lastMoved === item.bookId }"
            >
              <ListBookRow
                :item="item"
                :rank="list.ranked ? index + 1 : null"
                @open="openBook"
              >
                <template #handle>
                  <button
                    v-if="list.items.length > 1 && !isOffline"
                    type="button"
                    class="drag-handle"
                    :aria-label="t('lists.moveBook', { title: item.title, n: index + 1, total: list.items.length })"
                    :aria-describedby="`${uid}-help`"
                    @keydown="event => onHandleKey(event, index)"
                  >
                    <i
                      class="pi pi-bars"
                      aria-hidden="true"
                    ></i>
                  </button>
                </template>
                <template #actions>
                  <IconButton
                    v-if="!isOffline"
                    icon="pi pi-times"
                    :label="t('lists.removeBook', { title: item.title })"
                    class="remove-btn"
                    @click="removeItem(item)"
                  />
                  <!-- Abaixo de 400 px o X vira um menu da linha, embaixo da alça -->
                  <IconButton
                    v-if="!isOffline"
                    icon="pi pi-ellipsis-v"
                    :label="t('lists.rowActions', { title: item.title })"
                    class="row-more"
                    aria-haspopup="true"
                    aria-controls="list-row-menu"
                    @click="event => openRowMenu(event, item)"
                  />
                </template>
              </ListBookRow>
            </li>
          </ol>
          <PopupMenu
            id="list-row-menu"
            ref="rowMenu"
            :items="rowMenuItems"
          />
        </template>

        <p
          class="sr-only"
          aria-live="assertive"
        >{{ announcement }}</p>
      </template>
    </div>

    <ListFormDialog
      v-if="list"
      v-model:visible="formOpen"
      :list="list"
      @saved="onSaved"
    />
    <AddBooksDialog
      v-if="list"
      v-model:visible="pickerOpen"
      :list-id="list.id"
      :book-ids="list.items.map(item => item.bookId)"
      @changed="reloadSoon"
    />
    <BookDialog
      v-if="openedBookId"
      v-model="bookDialogOpen"
      :book-id="openedBookId"
      @updated="reloadSoon"
      @deleted="reloadSoon"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Sortable from 'sortablejs'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import PopupMenu from '../components/ui/PopupMenu.vue'
import IconButton from '../components/form/IconButton.vue'
import BookDialog from '../components/BookDialog.vue'
import ListBookRow from '../components/list/ListBookRow.vue'
import ListFormDialog from '../components/list/ListFormDialog.vue'
import AddBooksDialog from '../components/list/AddBooksDialog.vue'
import api from '../services/api.js'
import { currentUser } from '../services/session.js'
import { isOffline } from '../services/network.js'
import { useToast } from '../services/toast.js'
import { useConfirm } from '../services/confirm.js'
import { shareLink } from '../utils/share.js'
import { slugify } from '../utils/slug.js'

/**
 * Uma lista do dono: arrastar pela alça (mouse ou toque) ou usar as setas
 * com a alça em foco para mudar a ordem; a ordem é salva logo em seguida.
 * Sem conexão (modo leitura) não há alças, "×", adicionar, editar nem excluir.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const uid = `list-${Math.random().toString(36).slice(2, 8)}`
const list = ref(null)
const loading = ref(true)
const notFound = ref(false)
const loadError = ref(false)
const formOpen = ref(false)
const pickerOpen = ref(false)
const moreMenu = ref(null)
const listEl = ref(null)
const announcement = ref('')
const lastMoved = ref(null)
const openedBookId = ref(null)
const bookDialogOpen = ref(false)

const listId = computed(() => Number(route.params.id))
const canShare = computed(() => list.value?.isPublic && currentUser.value?.isPublic && list.value.items.length > 0)
const publicUrl = computed(() => {
  if (!list.value || !currentUser.value) return ''
  const slug = slugify(list.value.title)
  return `${window.location.origin}/u/${encodeURIComponent(currentUser.value.name)}/lists/${list.value.id}${slug ? `/${slug}` : ''}`
})

const moreItems = computed(() => [
  { label: t('lists.edit'), icon: 'pi pi-pencil', disabled: isOffline.value, command: () => { formOpen.value = true } },
  ...(list.value?.isPublic && currentUser.value?.isPublic
    ? [{ label: t('lists.viewPublic'), icon: 'pi pi-external-link', command: () => window.open(publicUrl.value, '_blank', 'noopener') }]
    : []),
  { separator: true },
  { label: t('lists.delete'), icon: 'pi pi-trash', disabled: isOffline.value, command: askDelete }
])

async function load() {
  loading.value = true
  try {
    list.value = (await api.getList(listId.value)).list
    notFound.value = false
    loadError.value = false
  } catch (error) {
    if (error.status === 404 || error.status === 400) notFound.value = true
    // Com a lista na tela (recarga depois de mudar), mantém e avisa
    else if (list.value) toast.add({ severity: 'error', detail: t('lists.loadOneFailed'), life: 4000 })
    else loadError.value = true
  } finally {
    loading.value = false
  }
}

// Várias mudanças seguidas (no seletor de livros) viram uma recarga só
let reloadTimer = null
function reloadSoon() {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(load, 300)
}

// ------------------------------------------------------------ ordem

function move(from, to) {
  const items = [...list.value.items]
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
  list.value = { ...list.value, items }
  lastMoved.value = item.bookId
  announcement.value = t('lists.movedTo', { title: item.title, n: to + 1, total: items.length })
  saveOrderSoon()
}

let saveTimer = null
let saving = Promise.resolve()

function saveOrderSoon() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveOrder, 400)
}

async function saveOrder() {
  saveTimer = null
  const ids = list.value.items.map(item => item.bookId)
  saving = saving.then(async () => {
    try {
      await api.reorderList(list.value.id, ids)
    } catch (error) {
      toast.add({ severity: 'error', summary: t('lists.orderFailed'), detail: error.message, life: 5000 })
      await load()
    }
  })
  return saving
}

async function onHandleKey(event, index) {
  const last = list.value.items.length - 1
  const targets = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: last }
  if (!(event.key in targets)) return
  event.preventDefault()
  const to = Math.max(0, Math.min(last, targets[event.key]))
  if (to === index) return
  move(index, to)
  // O foco segue o livro para a nova posição
  await nextTick()
  listEl.value?.querySelectorAll('.drag-handle')[to]?.focus()
}

let sortable = null

function setupSortable() {
  if (sortable || !listEl.value) return
  sortable = Sortable.create(listEl.value, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    // O Sortable mexe no DOM; devolvemos o item ao lugar e quem reordena é o Vue
    onEnd(event) {
      const { oldIndex, newIndex, item, from } = event
      if (oldIndex === newIndex || oldIndex === undefined || newIndex === undefined) return
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)
      move(oldIndex, newIndex)
    }
  })
}

function teardownSortable() {
  sortable?.destroy()
  sortable = null
}

// A <ol> some e volta (lista vazia ↔ com livros): acompanha o elemento
watch(listEl, element => {
  teardownSortable()
  if (element) setupSortable()
})

// ------------------------------------------------------------ ações

// Menu da linha (celular estreito): uma instância só, com o livro da vez
const rowMenu = ref(null)
const rowMenuItem = ref(null)
const rowMenuItems = computed(() => rowMenuItem.value
  ? [{ label: t('lists.removeShort'), icon: 'pi pi-times', danger: true, command: () => removeItem(rowMenuItem.value) }]
  : [])

function openRowMenu(event, item) {
  rowMenuItem.value = item
  rowMenu.value?.toggle(event)
}

async function removeItem(item) {
  const index = list.value.items.findIndex(entry => entry.bookId === item.bookId)
  const before = list.value
  list.value = { ...before, items: before.items.filter(entry => entry.bookId !== item.bookId) }
  announcement.value = t('lists.removed', { title: item.title })
  try {
    // Ordem ainda não salva vai antes (senão ela chegaria com um livro a mais)
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      await saveOrder()
    }
    await saving
    await api.removeFromList(before.id, item.bookId)
  } catch (error) {
    list.value = before
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
    return
  }
  // Saiu sem perguntar: o aviso traz "Desfazer", que devolve na mesma posição
  toast.add({
    severity: 'success',
    detail: t('lists.removed', { title: item.title }),
    life: 7000,
    action: { label: t('common.undo'), onClick: () => undoRemove(item, index) }
  })
  // Foco no próximo livro (ou no anterior, se era o último)
  await nextTick()
  const handles = listEl.value?.querySelectorAll('.open')
  handles?.[Math.min(index, handles.length - 1)]?.focus()
}

async function undoRemove(item, index) {
  if (!list.value || list.value.items.some(entry => entry.bookId === item.bookId)) return
  const items = [...list.value.items]
  items.splice(Math.min(index, items.length), 0, item)
  list.value = { ...list.value, items }
  lastMoved.value = item.bookId
  announcement.value = t('lists.restored', { title: item.title })
  try {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await saving
    // Volta para o fim da lista no servidor e a ordem de antes é regravada
    await api.addToList(list.value.id, item.bookId)
    await api.reorderList(list.value.id, list.value.items.map(entry => entry.bookId))
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
    await load()
  }
}

function onSaved(saved) {
  list.value = saved
  toast.add({ severity: 'success', summary: t('lists.saved'), life: 2500 })
}

function askDelete() {
  confirm.require({
    header: t('lists.deleteTitle'),
    message: t('lists.deleteMessage', { title: list.value.title }),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('lists.deleteConfirm'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      try {
        await api.deleteList(list.value.id)
        toast.add({ severity: 'success', summary: t('lists.deleted'), life: 2500 })
        router.replace({ name: 'lists' })
      } catch (error) {
        toast.add({ severity: 'error', detail: error.message, life: 4000 })
      }
    }
  })
}

async function share() {
  const result = await shareLink({ title: list.value.title, text: t('lists.shareText', { title: list.value.title }), url: publicUrl.value })
  if (result === 'copied') toast.add({ severity: 'success', summary: t('lists.linkCopied'), detail: publicUrl.value, life: 3500 })
  else if (result === 'failed') toast.add({ severity: 'info', summary: t('lists.copyThis'), detail: publicUrl.value, life: 8000 })
}

function openBook(bookId) {
  openedBookId.value = bookId
  bookDialogOpen.value = true
}

watch(listId, () => { list.value = null; load() })

onMounted(async () => {
  await load()
  // Lista recém-criada: já abre o seletor de livros
  if (route.query.added === 'new' && list.value && !list.value.items.length) pickerOpen.value = true
  if (route.query.added) router.replace({ query: {} })
})

onBeforeUnmount(() => {
  teardownSortable()
  clearTimeout(reloadTimer)
  // Ordem pendente: salva ao sair da página
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveOrder()
  }
})
</script>

<style scoped>
.list-page {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.list-content {
  max-width: 760px;
  margin: 0 auto;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-decoration: none;
}

.back:hover {
  color: var(--main-color);
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.heading {
  flex: 1 1 18rem;
  min-width: 0;
}

.heading h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.description {
  margin: 0.6rem 0 0;
  color: var(--text-secondary);
  white-space: pre-line;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.visibility {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.visibility.public {
  color: var(--main-color);
}

.visibility .pi {
  font-size: var(--fs-xs);
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.notice .pi {
  margin-top: 0.15rem;
  color: var(--main-color);
}

.notice a {
  color: var(--main-color);
}

.reorder-help {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
  font-size: var(--fs-xs);
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
  padding: 0.5rem 0.6rem 0.5rem 0.35rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
  transition: border-color 0.2s ease, background-color 0.6s ease;
}

.item.moved {
  border-color: rgba(var(--main-color-rgb), 0.45);
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 3rem;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
}

.drag-handle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
  color: var(--main-color);
}

.drag-ghost {
  opacity: 0.35;
  border-style: dashed;
  border-color: var(--main-color);
}

.drag-chosen {
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
}

.remove-btn,
.row-more {
  flex-shrink: 0;
  color: var(--text-muted);
}

.row-more {
  display: none;
}

/* Abaixo de 400 px: o X vai para um menu da linha, embaixo da alça
   (o ListBookRow põe a alça e o menu numa coluna só) */
@media (max-width: 399.98px) {
  .remove-btn {
    display: none;
  }

  .row-more {
    display: inline-flex;
  }
}

@media (pointer: coarse) {
  .drag-handle {
    width: 44px;
    height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .item {
    transition: none;
  }
}

@media (max-width: 480px) {
  /* Três ações numa linha: Compartilhar fica só com o ícone (o nome segue para leitores de tela) */
  .share-btn :deep(.btn-label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .actions {
    flex-wrap: nowrap;
    width: 100%;
  }

  .actions > :first-child {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .list-page {
    padding: 1.25rem;
  }

  .heading h1 {
    font-size: var(--fs-2xl);
  }

  .item {
    padding: 0.4rem 0.35rem 0.4rem 0.2rem;
  }
}
</style>

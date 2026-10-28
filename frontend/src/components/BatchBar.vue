<template>
  <div
    ref="barEl"
    class="batch-bar"
    role="toolbar"
    :aria-label="t('batch.toolbar')"
  >
    <span
      class="batch-count"
      aria-live="polite"
    >{{ t('batch.selected', { n: count }, count) }}</span>

    <button
      type="button"
      class="batch-link"
      @click="emit('select-all')"
    >{{ allSelected ? t('batch.selectNone') : t('batch.selectAll') }}</button>

    <div class="batch-actions">
      <AppButton
        :label="t('batch.status')"
        :aria-label="t('batch.status')"
        icon="pi pi-check-circle"
        class="btn-sm btn-outlined batch-btn"
        :disabled="!count || busy"
        aria-haspopup="true"
        aria-controls="batch-status-menu"
        @click="event => statusMenu.toggle(event)"
      />
      <PopupMenu
        id="batch-status-menu"
        ref="statusMenu"
        :items="statusItems"
      />

      <AppButton
        :label="t('batch.category')"
        :aria-label="t('batch.category')"
        icon="pi pi-tags"
        class="btn-sm btn-outlined batch-btn"
        :disabled="!count || busy"
        @click="openTagDialog"
      />

      <AppButton
        :label="t('batch.delete')"
        :aria-label="t('batch.delete')"
        icon="pi pi-trash"
        class="btn-sm btn-outlined btn-danger batch-btn"
        :disabled="!count || busy"
        @click="confirmDelete"
      />

      <AppButton
        icon="pi pi-times"
        class="btn-sm btn-text btn-rounded close-btn"
        :aria-label="t('batch.cancel')"
        v-tooltip.top="t('batch.cancel')"
        @click="emit('cancel')"
      />
    </div>

    <AppDialog
      v-model:visible="tagDialog"
      size="sm"
      :header="t('batch.categoryTitle', { n: count }, count)"
    >
      <form
        class="tag-form"
        @submit.prevent="applyTag('addTag')"
      >
        <label for="batch-tag">{{ t('batch.categoryName') }}</label>
        <input
          id="batch-tag"
          v-model="tagName"
          class="modern-input"
          list="batch-tag-options"
          maxlength="200"
          autocomplete="off"
          :placeholder="t('batch.categoryPlaceholder')"
        />
        <datalist id="batch-tag-options">
          <option
            v-for="tag in tags"
            :key="tag.name"
            :value="tag.name"
          ></option>
        </datalist>
        <div class="tag-form-actions">
          <AppButton
            type="button"
            :label="t('batch.removeCategory')"
            icon="pi pi-minus"
            class="btn-sm btn-text btn-danger"
            :disabled="!tagName.trim() || busy"
            @click="applyTag('removeTag')"
          />
          <AppButton
            type="submit"
            :label="t('batch.addCategory')"
            icon="pi pi-plus"
            class="btn-sm btn-primary"
            :disabled="!tagName.trim() || busy"
            :loading="busy"
          />
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '../services/confirm.js'
import { useToast } from '../services/toast.js'
import AppButton from './ui/AppButton.vue'
import PopupMenu from './ui/PopupMenu.vue'
import AppDialog from './ui/AppDialog.vue'
import api from '../services/api.js'
import { toApiDate } from '../utils/dates.js'

/**
 * Barra de ações em lote da biblioteca: status, categoria e excluir para os
 * livros selecionados. Avisa o pai com `done` para recarregar a lista.
 */
const props = defineProps({
  ids: { type: Array, required: true },
  allSelected: { type: Boolean, default: false }
})

const emit = defineEmits(['select-all', 'cancel', 'done'])
const { t } = useI18n()
const confirm = useConfirm()
const toast = useToast()

const count = computed(() => props.ids.length)
const busy = ref(false)
const statusMenu = ref(null)
const tagDialog = ref(false)
const tagName = ref('')
const tags = ref([])

// No celular a barra é fixa na janela e tapava a última linha da estante.
// Ela publica em --batch-bar-height quanto ocupa do pé da janela (altura +
// distância da borda) para a Library reservar esse espaço no fim da lista.
// Fora do modo fixo (desktop, onde ela segue o fluxo) vale 0.
const BAR_VAR = '--batch-bar-height'
const barEl = ref(null)
let barObserver = null

function publishBarHeight() {
  const el = barEl.value
  if (!el) return
  const fixed = getComputedStyle(el).position === 'fixed'
  const covered = fixed ? Math.max(0, window.innerHeight - el.getBoundingClientRect().top) : 0
  document.documentElement.style.setProperty(BAR_VAR, `${Math.ceil(covered)}px`)
}

onMounted(() => {
  publishBarHeight()
  if (typeof ResizeObserver !== 'undefined' && barEl.value) {
    barObserver = new ResizeObserver(publishBarHeight)
    barObserver.observe(barEl.value)
  }
  window.addEventListener('resize', publishBarHeight)
})

onBeforeUnmount(() => {
  barObserver?.disconnect()
  window.removeEventListener('resize', publishBarHeight)
  document.documentElement.style.removeProperty(BAR_VAR)
})

async function run(body, successKey) {
  busy.value = true
  try {
    const { updated } = await api.batchBooks({ ids: props.ids, ...body })
    toast.add({ severity: 'success', summary: t('common.success'), detail: t(successKey, { n: updated }, updated), life: 3000 })
    emit('done')
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    busy.value = false
  }
}

const statusItems = computed(() => [
  { label: t('status.want'), icon: 'pi pi-bookmark', command: () => setStatus('want') },
  { label: t('status.reading'), icon: 'pi pi-book', command: () => setStatus('reading') },
  { label: t('status.read'), icon: 'pi pi-check', command: () => setStatus('read') },
  { separator: true },
  { label: t('status.clear'), icon: 'pi pi-times', command: () => setStatus('none') }
])

function setStatus(status) {
  run({ action: 'status', status, date: toApiDate(new Date()) }, 'batch.doneStatus')
}

async function openTagDialog() {
  tagName.value = ''
  tagDialog.value = true
  try {
    tags.value = await api.getTags()
  } catch {
    tags.value = []
  }
}

async function applyTag(action) {
  const tag = tagName.value.trim()
  if (!tag) return
  await run({ action, tag }, action === 'addTag' ? 'batch.doneAddTag' : 'batch.doneRemoveTag')
  tagDialog.value = false
}

function confirmDelete() {
  confirm.require({
    message: t('batch.confirmDelete', { n: count.value }, count.value),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('batch.delete'),
    rejectLabel: t('common.cancel'),
    accept: () => run({ action: 'delete' }, 'batch.doneDelete')
  })
}
</script>

<style scoped>
.batch-bar {
  position: sticky;
  bottom: 1rem;
  z-index: 120;
  margin: 1.5rem auto 0;
  width: fit-content;
  max-width: calc(100% - 2rem);
  display: flex;
  align-items: center;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
  border-radius: 16px;
  background: var(--bg-panel);
  border: 1px solid rgba(var(--main-color-rgb), 0.45);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.batch-count {
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.batch-link {
  background: none;
  border: none;
  padding: 0.25rem;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--main-color);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.batch-btn.btn {
  border-radius: 999px;
}

.tag-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tag-form label {
  font-size: var(--fs-md);
  color: var(--text-secondary);
}

.tag-form-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* No celular a lista rola dentro de uma área mais alta que a tela: a barra
   fica presa à janela para não sumir embaixo. */
@media (max-width: 768px) {
  .batch-bar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0.75rem;
    margin: 0;
    width: max-content;
    max-width: calc(100vw - 1.5rem);
  }
}

/* Celular: os rótulos ficam (só ícones viravam três círculos sem texto). Em
   cima, contagem e "Selecionar todos" empilhados, com o X de sair ao lado
   (os três numa linha só não cabem a 320 px); embaixo, as três ações
   dividindo a largura, com o ícone sobre o rótulo para caber "Categoria". */
@media (max-width: 600px) {
  .batch-bar {
    width: calc(100vw - 1.5rem);
    padding: 0.5rem 0.6rem 0.6rem 0.9rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
      "count count close"
      "link  link  close";
    gap: 0.1rem 0.4rem;
    align-items: center;
  }

  .batch-actions {
    display: contents;
  }

  .batch-count {
    grid-area: count;
  }

  .batch-link {
    grid-area: link;
    justify-self: start;
    padding-left: 0;
  }

  .close-btn {
    grid-area: close;
    justify-self: end;
  }

  .batch-btn.btn {
    margin-top: 0.35rem;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.35rem 0.4rem;
    border-radius: 12px;
    line-height: 1.15;
  }

  .batch-btn.btn :deep(.btn-icon) {
    margin: 0;
  }

  .batch-btn.btn :deep(.btn-label) {
    white-space: nowrap;
  }
}
</style>
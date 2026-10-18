<template>
  <div
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
      <Button
        :label="t('batch.status')"
        :aria-label="t('batch.status')"
        icon="pi pi-check-circle"
        class="p-button-sm p-button-outlined batch-btn"
        :disabled="!count || busy"
        aria-haspopup="true"
        aria-controls="batch-status-menu"
        @click="event => statusMenu.toggle(event)"
      />
      <Menu
        id="batch-status-menu"
        ref="statusMenu"
        :model="statusItems"
        popup
      />

      <Button
        :label="t('batch.category')"
        :aria-label="t('batch.category')"
        icon="pi pi-tags"
        class="p-button-sm p-button-outlined batch-btn"
        :disabled="!count || busy"
        @click="openTagDialog"
      />

      <Button
        :label="t('batch.delete')"
        :aria-label="t('batch.delete')"
        icon="pi pi-trash"
        class="p-button-sm p-button-outlined p-button-danger batch-btn"
        :disabled="!count || busy"
        @click="confirmDelete"
      />

      <Button
        icon="pi pi-times"
        class="p-button-sm p-button-text p-button-rounded close-btn"
        :aria-label="t('batch.cancel')"
        v-tooltip.top="t('batch.cancel')"
        @click="emit('cancel')"
      />
    </div>

    <Dialog
      v-model:visible="tagDialog"
      modal
      :header="t('batch.categoryTitle', { n: count }, count)"
      :style="{ width: 'min(26rem, 92vw)' }"
      :draggable="false"
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
          <Button
            type="button"
            :label="t('batch.removeCategory')"
            icon="pi pi-minus"
            class="p-button-sm p-button-text p-button-danger"
            :disabled="!tagName.trim() || busy"
            @click="applyTag('removeTag')"
          />
          <Button
            type="submit"
            :label="t('batch.addCategory')"
            icon="pi pi-plus"
            class="p-button-sm btn-action-primary"
            :disabled="!tagName.trim() || busy"
            :loading="busy"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Dialog from 'primevue/dialog'
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
    acceptClass: 'p-button-rounded p-button-danger',
    rejectClass: 'p-button-text p-button-secondary',
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
  font-size: 0.88rem;
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

.batch-btn.p-button {
  border-radius: 999px;
}

.tag-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tag-form label {
  font-size: 0.9rem;
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

@media (max-width: 600px) {
  .batch-bar {
    padding: 0.6rem 0.75rem;
    gap: 0.5rem;
  }

  .batch-btn.p-button :deep(.p-button-label) {
    display: none;
  }

  .batch-btn.p-button :deep(.p-button-icon) {
    margin: 0;
  }
}
</style>

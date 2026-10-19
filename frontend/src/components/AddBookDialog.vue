<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :dismissableMask="false"
    class="book-form-dialog"
    :style="{ width: '960px', maxWidth: 'calc(100vw - 2rem)' }"
    :showHeader="false"
    :aria-label="t('book.dialog_label')"
  >
    <div class="dialog-shell">
      <IconButton
        class="close-btn"
        icon="pi pi-times"
        :label="t('common.close')"
        @click="visible = false"
      />
      <BookEditForm
        v-if="visible"
        :key="formKey"
        mode="create"
        id-prefix="new-book"
        @saved="onSaved"
        @cancel="visible = false"
      />
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useI18n } from 'vue-i18n'
import BookEditForm from './book/BookEditForm.vue'
import IconButton from './form/IconButton.vue'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'save'])

const visible = ref(props.visible)
// Formulário novo a cada abertura
const formKey = ref(0)

watch(() => props.visible, value => {
  visible.value = value
  if (value) formKey.value++
})

watch(visible, value => emit('update:visible', value))

function onSaved(result) {
  emit('save', result)
  visible.value = false
}
</script>

<style>
/* Moldura dos diálogos de livro (Novo livro e o livro aberto) */
.p-dialog.book-form-dialog {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  background-color: var(--bg-panel);
  max-height: min(92vh, 860px);
}

.book-form-dialog .p-dialog-content {
  padding: 0;
  background-color: var(--bg-panel);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .p-dialog.book-form-dialog {
    max-height: calc(100dvh - 2rem);
  }
}
</style>

<style scoped>
.dialog-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(92vh, 860px);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
}

@media (max-width: 768px) {
  .dialog-shell {
    max-height: calc(100dvh - 2rem);
  }

  .close-btn {
    top: 0.75rem;
    right: 0.75rem;
  }
}
</style>

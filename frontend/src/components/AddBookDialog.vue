<template>
  <AppDialog
    v-model:visible="visible"
    size="xl"
    :dismissable="false"
    dialog-class="book-form-dialog"
    :aria-label="t('book.dialog_label')"
    :before-close="confirmLeave"
  >
    <div class="dialog-shell">
      <IconButton
        class="close-btn"
        icon="pi pi-times"
        :label="t('common.close')"
        @click="requestClose"
      />
      <BookEditForm
        v-if="visible"
        ref="form"
        :key="formKey"
        mode="create"
        id-prefix="new-book"
        @saved="onSaved"
        @cancel="visible = false"
      />
    </div>
  </AppDialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppDialog from './ui/AppDialog.vue'
import { useI18n } from 'vue-i18n'
import BookEditForm from './book/BookEditForm.vue'
import IconButton from './form/IconButton.vue'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'save'])

const visible = ref(props.visible)
const form = ref(null)

// Folha arrastada para baixo, X, Esc ou voltar do celular: com dados
// digitados ou lidos pelo código de barras, pergunta antes de descartar
function confirmLeave() {
  return form.value?.confirmLeave?.() ?? true
}

async function requestClose() {
  if (await confirmLeave()) visible.value = false
}
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
/* Diálogos de livro (Novo livro e o livro aberto): mais altos que o padrão */
.book-form-dialog .app-dialog-panel {
  max-height: min(92vh, 860px);
}

@media (max-width: 1023.98px) {
  .book-form-dialog .app-dialog-panel {
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

@media (max-width: 1023.98px) {
  .dialog-shell {
    max-height: calc(100dvh - 2rem);
  }

  .close-btn {
    top: 0.75rem;
    right: 0.75rem;
  }
}

/* Celular (folha): o X na linha do título, logo abaixo da alça */
@media (max-width: 639.98px) {
  .dialog-shell {
    max-height: none;
    flex: 1;
  }

  .close-btn {
    top: calc(-1 * var(--space-2));
    right: 0.5rem;
  }
}
</style>

<template>
  <!-- Editar e o menu "⋯" (Listas, Excluir) -->
  <div
    class="book-actions"
    :class="{ 'page-actions': phone }"
  >
    <AppButton
      v-if="phone"
      :label="t('bookDialog.editShort')"
      class="btn-secondary btn-sm action-edit"
      @click="emit('edit')"
    />
    <AppButton
      v-else
      v-tooltip.top="t('bookDialog.editShortcut')"
      :label="t('bookDialog.editShort')"
      icon="pi pi-pencil"
      class="btn-outlined btn-secondary btn-sm action-edit"
      aria-keyshortcuts="E"
      @click="emit('edit')"
    />
    <IconButton
      icon="pi pi-ellipsis-h"
      :label="t('bookDialog.moreActions')"
      class="action-more"
      aria-haspopup="true"
      aria-controls="book-more-menu"
      aria-expanded="false"
      @click="event => emit('more', event)"
    />
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import IconButton from '../form/IconButton.vue'

/**
 * Ações do livro aberto. No computador ficam numa linha acima do título, ao
 * lado do X; no celular, na barra do topo (phone), sem ícone no Editar.
 * `more` leva o evento do clique para o pai abrir o menu #book-more-menu.
 */
defineProps({
  phone: { type: Boolean, default: false }
})
const emit = defineEmits(['edit', 'more'])

const { t } = useI18n()
</script>

<style scoped>
/* Editar e o menu "⋯" (Listas, Excluir) no topo, numa linha só deles ao
   lado do X: o título fica logo abaixo e com a largura toda */
.book-actions {
  order: -1;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-1);
  /* Na altura do X (top 1rem) e sem encostar nele (44 px + folga) */
  margin-top: -1.5rem;
  padding-right: var(--space-6);
}

.action-edit.btn {
  border-radius: var(--radius-md);
}

@media (max-width: 1023.98px) {
  /* O X está sobre a faixa da capa: a linha das ações não precisa desviar */
  .book-actions {
    margin-top: 0;
    padding-right: 0;
  }
}

@media (max-width: 639.98px) {
  .page-actions {
    order: 0;
    width: auto;
    margin: 0;
    padding: 0;
  }

  .page-actions .action-edit.btn {
    border-radius: var(--radius-pill);
  }
}
</style>

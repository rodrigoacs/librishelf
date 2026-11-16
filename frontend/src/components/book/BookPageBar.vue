<template>
  <!-- Celular: tela cheia com "‹ Biblioteca" e as ações no topo -->
  <div class="page-bar">
    <button
      type="button"
      class="page-back"
      data-press
      @click="emit('back')"
    >
      <i
        class="pi pi-chevron-left"
        aria-hidden="true"
      ></i>
      <span>{{ backLabel }}</span>
    </button>
    <BookActions
      v-if="showActions"
      phone
      @edit="emit('edit')"
      @more="event => emit('more', event)"
    />
  </div>
</template>

<script setup>
import BookActions from './BookActions.vue'

/** Barra do livro aberto no celular: voltar (com o nome da tela de origem) e as ações. */
defineProps({
  backLabel: { type: String, required: true },
  showActions: { type: Boolean, default: false }
})
const emit = defineEmits(['back', 'edit', 'more'])
</script>

<style scoped>
@media (max-width: 639.98px) {
  .page-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex: none;
    min-height: calc(56px + var(--safe-top, 0px));
    padding: var(--safe-top, 0px) var(--space-2) 0 var(--space-1);
    background: var(--bg-panel);
  }

  .page-back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
    max-width: 60%;
    padding: 0 var(--space-3) 0 var(--space-2);
    border: none;
    border-radius: var(--radius-pill);
    background: none;
    color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
    font: inherit;
    font-size: var(--fs-md);
    font-weight: 600;
    cursor: pointer;
  }

  .page-back span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-back:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }
}
</style>

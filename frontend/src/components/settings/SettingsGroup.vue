<template>
  <!-- Grupo de linhas da Conta, como os Ajustes de um celular: título, um
       trecho opcional antes da lista (before), as linhas (padrão) e o que vem
       depois, como as folhas (after; AppDialog é <dialog>, fora do fluxo). -->
  <section
    :id="anchor || undefined"
    class="settings-group"
    :aria-labelledby="titleId"
    :tabindex="anchor ? -1 : undefined"
  >
    <h2
      :id="titleId"
      :class="hiddenTitle ? 'sr-only' : 'section-title group-title'"
    >{{ title }}</h2>
    <slot name="before" />
    <div class="group-list">
      <slot />
    </div>
    <slot name="after" />
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  // id do título (aria-labelledby da seção)
  titleId: { type: String, required: true },
  // id da seção, para chegar por link ou foco (ex.: settings-plan)
  anchor: { type: String, default: '' },
  // Título só para leitor de tela (ex.: "Excluir conta", separado no fim)
  hiddenTitle: { type: Boolean, default: false }
})
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
</style>

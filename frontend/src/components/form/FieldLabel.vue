<template>
  <component
    :is="htmlFor ? 'label' : 'span'"
    :for="htmlFor || undefined"
    :id="id || undefined"
    class="field-label-static"
  >
    <slot />
  </component>
</template>

<script setup>
/**
 * Rótulo pequeno acima de grupos que não são caixa de texto (status, nota,
 * capa). Mesmo tamanho e peso do rótulo flutuante quando sobe.
 */
defineProps({
  htmlFor: { type: String, default: '' },
  id: { type: String, default: '' }
})
</script>

<style scoped>
.field-label-static {
  display: block;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-weight: 600;
  margin-bottom: 0.45rem;
}
</style>

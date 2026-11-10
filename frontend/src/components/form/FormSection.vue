<template>
  <!-- Grupo de campos com título e uma linha em cima (ex.: "Sobre o livro") -->
  <fieldset class="form-section">
    <legend>{{ legend }}</legend>
    <slot />
  </fieldset>
</template>

<script setup>
defineProps({
  legend: { type: String, required: true }
})
</script>

<style scoped>
.form-section {
  border: none;
  margin: var(--space-2) 0 0;
  padding: var(--space-4) 0 0;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* float tira a legenda da borda do fieldset; vira uma linha comum */
.form-section legend {
  float: left;
  width: 100%;
  padding: 0;
  margin-bottom: 0.1rem;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-primary);
}
</style>

<template>
  <!-- Marca das páginas públicas (sem menu): a mesma do menu do app.
       Slot à direita para ações. -->
  <header class="public-bar">
    <router-link
      to="/"
      class="public-bar-brand"
    >
      <img
        src="/bookshelf.png"
        alt=""
        width="24"
        height="24"
      />
      <BrandWordmark />
    </router-link>
    <slot></slot>
  </header>
</template>

<script setup>
import BrandWordmark from './BrandWordmark.vue'
</script>

<style scoped>
/* Posição e borda em main.css (.page > .public-bar) */
.public-bar-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto;
  font-size: var(--fs-lg);
  text-decoration: none;
}

.public-bar-brand:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
</style>

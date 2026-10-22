<template>
  <button
    :type="type"
    class="btn"
    :class="{ 'btn-loading': loading, 'btn-icon-only': !label && !$slots.default }"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
  >
    <i
      v-if="loading"
      class="pi pi-spinner pi-spin btn-icon"
      aria-hidden="true"
    ></i>
    <i
      v-else-if="icon"
      :class="icon"
      class="btn-icon"
      aria-hidden="true"
    ></i>
    <span
      v-if="label"
      class="btn-label"
    >{{ label }}</span>
    <slot />
  </button>
</template>

<script setup>
/**
 * Botão do app, no lugar do Button do PrimeVue. A aparência vem das
 * classes (main.css): sem classe = preenchido na cor de destaque;
 * btn-outlined, btn-text, btn-secondary, btn-danger, btn-sm, btn-lg,
 * btn-rounded e w-full combinam entre si.
 */
defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' }
})
</script>

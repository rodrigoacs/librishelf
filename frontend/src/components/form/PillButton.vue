<template>
  <button
    type="button"
    class="pill-button"
    :class="{ active, 'icon-only': !$slots.default && !label }"
    :aria-pressed="pressable ? active : undefined"
    :disabled="disabled"
  >
    <i
      v-if="icon"
      :class="icon"
      aria-hidden="true"
    ></i>
    <span v-if="label">{{ label }}</span>
    <slot />
  </button>
</template>

<script setup>
/**
 * Botão redondo de alternar (status de leitura, filtros, grade/lista).
 * Ativo = fundo na cor de destaque com texto branco. Estilo em main.css
 * (.pill-button), compartilhado com links que têm a mesma cara.
 */
defineProps({
  active: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  pressable: { type: Boolean, default: true }
})
</script>

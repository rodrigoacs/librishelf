<template>
  <button
    :id="inputId"
    type="button"
    role="switch"
    class="app-switch"
    :class="{ on: modelValue }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="app-switch-thumb"
      aria-hidden="true"
    ></span>
  </button>
</template>

<script setup>
/**
 * Interruptor liga/desliga (no lugar do InputSwitch). É um botão com
 * role="switch": o <label for> do lado continua dando nome a ele.
 */
defineProps({
  modelValue: { type: Boolean, default: false },
  inputId: { type: String, default: undefined },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.app-switch {
  position: relative;
  flex-shrink: 0;
  width: 2.75rem;
  height: 1.6rem;
  padding: 0;
  border: 1px solid var(--border-hover);
  border-radius: 999px;
  background: var(--bg-hover);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.app-switch.on {
  background: var(--main-solid);
  border-color: var(--main-solid);
}

.app-switch-thumb {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transform: translateY(-50%);
  transition: left 0.15s ease;
}

.app-switch.on .app-switch-thumb {
  left: calc(100% - 1.15rem - 3px);
}

.app-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-switch:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

@media (prefers-reduced-motion: reduce) {
  .app-switch,
  .app-switch-thumb {
    transition: none;
  }
}
</style>

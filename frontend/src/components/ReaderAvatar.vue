<template>
  <span
    class="reader-avatar"
    :class="`size-${size}`"
    :style="{ '--reader-color': colorFor(username) }"
    aria-hidden="true"
  >
    {{ initial }}
    <span
      v-if="badge"
      class="badge"
    ><i :class="badge"></i></span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { colorFor } from '../utils/tagColors.js'

/** Círculo com a inicial do leitor, na cor do nome (a mesma em todo o app). */
const props = defineProps({
  username: { type: String, required: true },
  size: { type: String, default: 'md' },
  // Ícone pequeno no canto (ex.: 'pi pi-check' para "terminou de ler").
  badge: { type: String, default: '' }
})

const initial = computed(() => props.username.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?')
</script>

<style scoped>
.reader-avatar {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  color: var(--reader-color);
  background: color-mix(in srgb, var(--reader-color) 16%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--reader-color) 40%, transparent);
}

.size-sm {
  width: 1.6rem;
  height: 1.6rem;
  font-size: var(--fs-xs);
}

.size-md {
  width: 2.25rem;
  height: 2.25rem;
  font-size: var(--fs-md);
}

.size-lg {
  width: 3.5rem;
  height: 3.5rem;
  font-size: var(--fs-xl);
  font-family: var(--font-display);
}

.badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.badge .pi {
  font-size: var(--fs-2xs);
}
</style>

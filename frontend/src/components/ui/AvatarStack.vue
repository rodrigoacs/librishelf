<template>
  <!-- Pilha de avatares ("12 outros leitores têm este livro"); o número fica no texto ao lado -->
  <span
    class="avatar-stack"
    :class="[`size-${size}`, { animate }]"
    aria-hidden="true"
  >
    <ReaderAvatar
      v-for="(name, index) in shown"
      :key="name"
      :username="name"
      :size="size"
      class="stack-item"
      :style="{ '--i': index }"
    />
    <span
      v-if="extra > 0"
      class="stack-item stack-more"
      :style="{ '--i': shown.length }"
    >+{{ extra }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import ReaderAvatar from '../ReaderAvatar.vue'

const props = defineProps({
  usernames: { type: Array, default: () => [] },
  // Total de leitores (a lista pode vir cortada pelo servidor)
  total: { type: Number, default: 0 },
  max: { type: Number, default: 5 },
  size: { type: String, default: 'sm' }, // sm | md
  // Entra em cascata (folha abrindo); sem movimento reduzido
  animate: { type: Boolean, default: false }
})

const shown = computed(() => props.usernames.slice(0, props.max))
const extra = computed(() => Math.max(props.total, props.usernames.length) - shown.value.length)
</script>

<style scoped>
.avatar-stack {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.stack-item {
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--bg-panel);
}

.stack-item + .stack-item {
  margin-left: -8px;
}

.size-md .stack-item + .stack-item {
  margin-left: -10px;
}

.stack-item.stack-more {
  position: relative;
  margin-left: -4px;
}

.stack-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.35rem;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: var(--fs-2xs);
  font-weight: 700;
}

.size-md .stack-more {
  min-width: 2.25rem;
  height: 2.25rem;
  font-size: var(--fs-xs);
}

@media (max-width: 639.98px) {
  .animate .stack-item {
    animation: stack-pop var(--dur-spring) var(--ease-spring) both;
    animation-delay: calc(120ms + min(var(--i, 0), 10) * var(--stagger) * 2);
  }
}

@keyframes stack-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate .stack-item {
    animation: none;
  }
}
</style>

<template>
  <span
    class="progress-bar"
    :class="`size-${size}`"
    :role="label ? 'progressbar' : undefined"
    :aria-valuenow="label ? Math.min(value, max) : undefined"
    :aria-valuemin="label ? 0 : undefined"
    :aria-valuemax="label ? max : undefined"
    :aria-valuetext="label ? valueText || undefined : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :style="{ '--p': percent }"
  ><span class="progress-fill"></span></span>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Barra de progresso (leitura, importação, meta). Sem `label` é só
 * decoração (aria-hidden), quando o número já está escrito ao lado.
 *
 * O preenchimento tem a largura toda e desliza com translateX dentro do
 * trilho: anima só transform e mantém a ponta arredondada. Cores pelo pai:
 * --bar-fill (padrão --main-solid) e --bar-track (padrão --bg-input).
 */
const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  label: { type: String, default: '' },
  valueText: { type: String, default: '' },
  // xs 4 px · sm 6 px · md 8 px · lg 10 px
  size: { type: String, default: 'md', validator: value => ['xs', 'sm', 'md', 'lg'].includes(value) }
})

const percent = computed(() => {
  if (!(props.max > 0) || !Number.isFinite(props.value)) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<style scoped>
.progress-bar {
  display: block;
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--bar-track, var(--bg-input));
}

.size-xs {
  height: 4px;
}

.size-sm {
  height: 6px;
}

.size-lg {
  height: 10px;
}

.progress-fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--bar-fill, var(--main-solid));
  transform: translateX(calc(var(--p, 0) * 1% - 100%));
  transition: transform var(--dur-long) var(--ease-standard);
}
</style>

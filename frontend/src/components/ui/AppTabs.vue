<template>
  <div
    class="tabs-wrap"
    :class="{ 'fade-start': edges.moreStart.value, 'fade-end': edges.moreEnd.value }"
  >
    <div
      ref="tabsEl"
      class="app-tabs"
      role="tablist"
      :aria-label="label"
    >
      <button
        v-for="tab in tabs"
        :id="`${idPrefix}tab-${tab.key}`"
        :key="tab.key"
        type="button"
        role="tab"
        class="app-tab"
        :class="{ active: modelValue === tab.key }"
        :aria-selected="modelValue === tab.key"
        :aria-controls="`${idPrefix}panel-${tab.key}`"
        :tabindex="modelValue === tab.key ? 0 : -1"
        @click="select(tab.key)"
        @keydown.right.prevent="move(1)"
        @keydown.left.prevent="move(-1)"
      >
        {{ tab.label }}
        <span
          v-if="tab.count"
          class="app-tab-count"
        >{{ tab.count }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// Abas de página (visual em main.css, .app-tabs). Quando não cabem
// (celular), degradê na borda que tem mais abas e a aba ativa rola para o
// meio, para a última não ficar escondida. Os painéis usam os ids
// `${idPrefix}panel-${key}` e `aria-labelledby="${idPrefix}tab-${key}"`.
import { ref, watch, nextTick, onMounted } from 'vue'
import { useScrollEdges } from '../../composables/useScrollEdges.js'
import { scrollBehavior } from '../../utils/motion.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  // [{ key, label, count? }]
  tabs: { type: Array, required: true },
  label: { type: String, required: true },
  idPrefix: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const tabsEl = ref(null)
const edges = useScrollEdges(tabsEl)

function select(key) {
  emit('update:modelValue', key)
}

function move(step) {
  const keys = props.tabs.map(tab => tab.key)
  const next = keys[(keys.indexOf(props.modelValue) + step + keys.length) % keys.length]
  select(next)
  document.getElementById(`${props.idPrefix}tab-${next}`)?.focus()
}

function centerActive(smooth = true) {
  const el = tabsEl.value
  const tab = el?.querySelector('[aria-selected="true"]')
  if (!el || !tab) return
  const left = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2
  el.scrollTo({ left: Math.max(0, left), behavior: scrollBehavior(smooth) })
}

watch(() => props.modelValue, () => nextTick(() => centerActive()))
// Contagens que chegam depois mudam a largura das abas
watch(() => props.tabs, () => nextTick(() => {
  centerActive(false)
  edges.update()
}))

onMounted(() => nextTick(() => {
  centerActive(false)
  edges.update()
}))
</script>

<style scoped>
.tabs-wrap {
  position: relative;
  margin-bottom: var(--space-5);
}

.tabs-wrap::before,
.tabs-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 1px;
  width: 2.5rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.tabs-wrap::before {
  left: 0;
  background: linear-gradient(to right, var(--bg-app), transparent);
}

.tabs-wrap::after {
  right: 0;
  background: linear-gradient(to left, var(--bg-app), transparent);
}

.tabs-wrap.fade-start::before,
.tabs-wrap.fade-end::after {
  opacity: 1;
}

@media (max-width: 639.98px) {
  /* Muitas abas: no celular a fileira rola para o lado (sem esticar a página). */
  .app-tabs {
    contain: inline-size;
  }
}
</style>

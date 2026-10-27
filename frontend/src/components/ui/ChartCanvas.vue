<template>
  <div class="chart-canvas">
    <canvas
      ref="canvasEl"
      role="img"
      :aria-label="ariaLabel || undefined"
    ></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import {
  Chart,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js'

// Só o que o app usa (barras e rosca, com dica e legenda). O chart.js/auto
// registrava todos os tipos e plugins: ~210 KB a mais no Painel.
// Gráfico de outro tipo precisa do controller/elemento registrado aqui.
Chart.register(BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Legend)

/**
 * Gráfico do Chart.js direto, sem o embrulho do PrimeVue.
 *   <ChartCanvas type="bar" :data="…" :options="…" />
 * Recria o gráfico quando data/options mudam (troca de ano, de tema).
 */
const props = defineProps({
  type: { type: String, required: true },
  data: { type: Object, required: true },
  options: { type: Object, default: () => ({}) },
  ariaLabel: { type: String, default: '' }
})

const canvasEl = ref(null)
const chart = shallowRef(null)

function render() {
  chart.value?.destroy()
  if (!canvasEl.value) return
  chart.value = new Chart(canvasEl.value, {
    type: props.type,
    // structuredClone não aceita Proxy nem funções; o Chart.js mexe nos objetos, então vai uma cópia rasa
    data: { ...toRaw(props.data), datasets: (toRaw(props.data).datasets || []).map(set => ({ ...toRaw(set) })) },
    options: toRaw(props.options)
  })
}

onMounted(render)
watch(() => [props.type, props.data, props.options], render)
onBeforeUnmount(() => chart.value?.destroy())
</script>

<style scoped>
.chart-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>

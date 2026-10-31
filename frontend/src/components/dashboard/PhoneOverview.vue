<template>
  <!-- Painel no celular (abaixo de 640 px), como no trailer: números do ano,
       barras do mês que crescem, rosca das categorias e "Meu ano em livros".
       As barras e a rosca são HTML/SVG (animam só transform/opacity); a tabela
       com os números continua para leitor de tela. -->
  <section
    ref="root"
    class="phone-overview"
    :class="{ 'in-view': inView }"
    :aria-label="t('dashboard.overviewLabel', { year })"
  >
    <dl class="tiles">
      <div class="tile">
        <dt>{{ t('dashboard.tileRead') }}</dt>
        <dd>{{ formatNumber(totals?.books ?? readInYear) }}</dd>
      </div>
      <div class="tile">
        <dt>{{ t('dashboard.tilePages') }}</dt>
        <dd>{{ totals ? formatNumber(totals.pages) : '—' }}</dd>
      </div>
      <div class="tile">
        <dt>{{ t('dashboard.tileRating') }}</dt>
        <dd>
          <template v-if="totals?.averageRating">
            {{ formatAverage(totals.averageRating) }}
            <i
              class="pi pi-star-fill"
              aria-hidden="true"
            ></i>
          </template>
          <template v-else>—</template>
        </dd>
      </div>
    </dl>

    <div class="card">
      <h3>{{ t('dashboard.readingByMonth', { year }) }}</h3>
      <p
        v-if="readInYear === 0"
        class="no-data"
      >{{ t('dashboard.noMonthData', { year }) }}</p>
      <template v-else>
        <ol
          class="bars"
          aria-hidden="true"
        >
          <li
            v-for="(count, index) in months"
            :key="index"
            :style="{ '--h': count / maxMonth, '--i': index }"
          >
            <button
              type="button"
              class="bar-col"
              tabindex="-1"
              :disabled="!count"
              @click="$emit('open-month', index + 1)"
            >
              <span class="bar-track">
                <span class="bar-fill"></span>
                <span class="bar-value">{{ count || '' }}</span>
              </span>
              <span class="bar-label">{{ monthInitials[index] }}</span>
            </button>
          </li>
        </ol>
        <slot name="month-table" />
      </template>
    </div>

    <div class="card">
      <h3>{{ t('dashboard.favoriteGenres') }}</h3>
      <p
        v-if="slices.length === 0"
        class="no-data"
      >{{ t('dashboard.noTagsData') }}</p>
      <div
        v-else
        class="donut-row"
      >
        <svg
          class="donut"
          viewBox="0 0 42 42"
          aria-hidden="true"
        >
          <circle
            class="donut-hole"
            cx="21"
            cy="21"
            r="15.915"
          />
          <circle
            v-for="slice in slices"
            :key="slice.name"
            class="donut-slice"
            cx="21"
            cy="21"
            r="15.915"
            :stroke="slice.color"
            :stroke-dasharray="`${slice.pct} ${100 - slice.pct}`"
            :stroke-dashoffset="25 - slice.start"
          />
        </svg>
        <ul class="legend">
          <li
            v-for="(slice, index) in slices"
            :key="slice.name"
            :style="{ '--i': index }"
          >
            <component
              :is="slice.other ? 'span' : 'button'"
              :type="slice.other ? undefined : 'button'"
              class="legend-item"
              @click="!slice.other && $emit('open-tag', slice.name)"
            >
              <span
                class="swatch"
                :style="{ background: slice.color }"
                aria-hidden="true"
              ></span>
              <span class="legend-name">{{ slice.label }}</span>
              <span class="legend-pct">{{ Math.round(slice.pct) }}%</span>
            </component>
          </li>
        </ul>
      </div>
    </div>

    <router-link
      :to="{ name: 'year', params: { year } }"
      class="btn btn-primary year-btn"
    >
      <i
        class="pi pi-sparkles"
        aria-hidden="true"
      ></i>
      {{ t('dashboard.myYear') }}
    </router-link>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { colorFor } from '../../utils/tagColors.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
  year: { type: Number, required: true },
  // Leituras por mês (12 números)
  months: { type: Array, default: () => [] },
  readInYear: { type: Number, default: 0 },
  // [{ name, count }]
  topTags: { type: Array, default: () => [] },
  // GET /dashboard/year/:ano → totals (livros, páginas, nota média); null enquanto carrega
  totals: { type: Object, default: null }
})

defineEmits(['open-month', 'open-tag'])

const { t, locale } = useI18n()
const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const monthInitials = computed(() =>
  Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'narrow' })))
const maxMonth = computed(() => Math.max(1, ...props.months))

// Rosca: as 4 maiores categorias e o resto em "Outras"
const DONUT_SLICES = 4
const slices = computed(() => {
  const tags = props.topTags.filter(tag => tag.count > 0)
  const total = tags.reduce((sum, tag) => sum + tag.count, 0)
  if (!total) return []
  const top = tags.slice(0, DONUT_SLICES)
  const rest = tags.slice(DONUT_SLICES).reduce((sum, tag) => sum + tag.count, 0)
  const list = top.map(tag => ({ name: tag.name, label: tag.name, count: tag.count, color: colorFor(tag.name) }))
  if (rest > 0) list.push({ name: '__other', label: t('dashboard.otherTags'), count: rest, color: 'var(--text-muted)', other: true })
  let start = 0
  return list.map(slice => {
    const pct = (slice.count / total) * 100
    const out = { ...slice, pct, start }
    start += pct
    return out
  })
})

const formatNumber = value => Number(value || 0).toLocaleString(dateLocale.value)
const formatAverage = value => Number(value).toLocaleString(dateLocale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Barras e rosca crescem quando entram na tela (não lá embaixo, sem ninguém ver)
const root = ref(null)
const inView = ref(false)
let observer = null
onMounted(() => {
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    inView.value = true
    return
  }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      inView.value = true
      observer.disconnect()
    }
  }, { threshold: 0.15 })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.phone-overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

.tile {
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  min-width: 0;
}

.tile dt {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.tile dd {
  margin: var(--space-1) 0 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tile dd .pi {
  color: var(--rating);
  font-size: var(--fs-md);
}

.card {
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

.card h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--fs-md);
}

.no-data {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

/* Barras do mês */
.bars {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 4px;
  height: 148px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.bar-col:disabled {
  cursor: default;
}

.bar-value {
  position: absolute;
  left: 50%;
  bottom: calc(var(--h) * 100% + 2px);
  transform: translateX(-50%);
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: var(--text-primary);
  opacity: 0;
  transition: opacity var(--dur-medium) var(--ease-standard);
  transition-delay: calc(var(--dur-long) + var(--i) * var(--stagger));
}

.bar-track {
  position: relative;
  flex: 1;
  width: 100%;
  max-width: 18px;
  margin-top: 1rem;
}

.bar-fill {
  position: absolute;
  inset: 0;
  border-radius: 4px 4px 2px 2px;
  background: var(--main-color);
  transform-origin: bottom;
  transform: scaleY(0);
  transition: transform var(--dur-long) var(--ease-spring);
  transition-delay: calc(var(--i) * var(--stagger) * 1.5);
}

.bar-label {
  margin-top: var(--space-1);
  font-size: var(--fs-2xs);
  text-transform: uppercase;
}

.in-view .bar-fill {
  transform: scaleY(max(var(--h), 0.02));
}

.in-view .bar-value {
  opacity: 1;
}

/* Rosca */
.donut-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.donut {
  flex: 0 0 112px;
  width: 112px;
  height: 112px;
  opacity: 0;
  transform: rotate(-90deg) scale(0.7);
  transition: transform var(--dur-spring) var(--ease-spring), opacity var(--dur-medium) var(--ease-standard);
}

.in-view .donut {
  opacity: 1;
  transform: none;
}

.donut-hole {
  fill: none;
}

.donut-slice {
  fill: none;
  stroke-width: 6;
}

.legend {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend li {
  opacity: 0;
  transform: translate3d(8px, 0, 0);
  transition: transform var(--dur-medium) var(--ease-enter), opacity var(--dur-medium) var(--ease-enter);
  transition-delay: calc(var(--dur-medium) + var(--i) * var(--stagger) * 2);
}

.in-view .legend li {
  opacity: 1;
  transform: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  text-align: left;
}

button.legend-item {
  cursor: pointer;
}

.swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-pct {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.year-btn {
  justify-content: center;
  min-height: 48px;
  text-decoration: none;
}

@media (prefers-reduced-motion: reduce) {
  .bar-fill,
  .bar-value,
  .donut,
  .legend li {
    transition: none;
  }
}
</style>

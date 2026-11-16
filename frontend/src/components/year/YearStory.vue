<template>
  <!-- Imagem para stories -->
  <YearPanel
    class="story"
    :aria-labelledby="`${uid}-story`"
  >
    <div class="story-preview">
      <canvas
        ref="canvasEl"
        class="story-canvas"
        :class="{ ready: storyReady }"
        role="img"
        :aria-label="t('year.storyAlt', { year, n: data.totals.readings })"
      ></canvas>
      <span
        v-if="!storyReady"
        class="story-loading"
      >{{ t('year.storyDrawing') }}</span>
    </div>
    <div class="story-text">
      <h2 :id="`${uid}-story`">{{ t('year.storyTitle') }}</h2>
      <p>{{ t('year.storyText') }}</p>
      <div class="story-actions">
        <AppButton
          v-if="canShareFile"
          :label="t('year.share')"
          icon="pi pi-share-alt"
          class="btn-primary"
          :disabled="!storyReady"
          @click="shareStory"
        />
        <AppButton
          :label="t('year.download')"
          icon="pi pi-download"
          :class="canShareFile ? 'btn-outlined btn-secondary' : 'btn-primary'"
          :disabled="!storyReady"
          @click="downloadStory"
        />
      </div>
      <p class="story-note">{{ t('year.storyPrivacy') }}</p>
    </div>
  </YearPanel>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import { currentUser } from '../../services/session.js'
import { useToast } from '../../services/toast.js'
import { drawYearStory, canvasToBlob } from '../../utils/yearStory.js'
import YearPanel from './YearPanel.vue'
import { useYearFormat } from './useYearFormat.js'

/**
 * Imagem 9:16 para stories, desenhada no navegador quando a seção aparece
 * (o pai a monta de novo a cada ano carregado). Compartilhar só onde o
 * navegador aceita arquivo; senão, baixar.
 */
const props = defineProps({
  data: { type: Object, required: true },
  year: { type: Number, required: true },
  // "até 12 de novembro", no ano corrente
  todayLabel: { type: String, required: true }
})

const { t } = useI18n()
const toast = useToast()
const { formatNumber, formatDecimal, monthName } = useYearFormat()

const uid = `year-${Math.random().toString(36).slice(2, 8)}`
const canvasEl = ref(null)
const storyReady = ref(false)
let storyBlob = null
let storyUrl = ''

// Compartilhar arquivo (folha do sistema) só onde o navegador aceita imagem
const canShareFile = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' &&
  (() => {
    try {
      return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })
    } catch {
      return false
    }
  })()

function storyText() {
  const d = props.data
  const highlights = []
  if (d.topRated[0]) highlights.push(t('year.storyFavorite', { title: d.topRated[0].title }))
  if (d.authors[0]?.count > 1) highlights.push(t('year.storyAuthor', { name: d.authors[0].name }))
  if (d.busiestMonth) highlights.push(t('year.storyMonth', { month: monthName(d.busiestMonth.month) }))
  if (highlights.length < 3 && d.longest) highlights.push(t('year.storyLongest', { title: d.longest.title, n: formatNumber(d.longest.pages) }))

  const stats = [{ value: formatNumber(d.totals.readings), label: t('year.booksRead', d.totals.readings) }]
  if (d.totals.pages) stats.push({ value: formatNumber(d.totals.pages), label: t('year.pages', d.totals.pages) })
  if (d.totals.averageRating) stats.push({ value: `${formatDecimal(d.totals.averageRating)}★`, label: t('year.averageRatingShort') })

  const user = currentUser.value
  const site = window.location.host
  return {
    kicker: 'LIBRISHELF',
    title: t('year.storyHeading'),
    subtitle: d.isCurrentYear ? t('year.soFar', { date: props.todayLabel }) : '',
    stats,
    highlights,
    footer: user?.isPublic ? `${site}/u/${user.name}` : site
  }
}

async function drawStory() {
  if (!canvasEl.value) return
  storyReady.value = false
  try {
    await drawYearStory(canvasEl.value, { year: props.year, covers: props.data.covers, text: storyText() })
    storyBlob = await canvasToBlob(canvasEl.value)
    if (storyUrl) URL.revokeObjectURL(storyUrl)
    storyUrl = URL.createObjectURL(storyBlob)
    storyReady.value = true
  } catch {
    toast.add({ severity: 'error', summary: t('year.storyFailed'), life: 4000 })
  }
}

const fileName = () => `librishelf-${props.year}.png`

function downloadStory() {
  if (!storyUrl) return
  const link = document.createElement('a')
  link.href = storyUrl
  link.download = fileName()
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// A imagem já está pronta: o share sai no mesmo clique (o navegador exige)
async function shareStory() {
  if (!storyBlob) return
  const file = new File([storyBlob], fileName(), { type: 'image/png' })
  try {
    await navigator.share({ files: [file], title: t('year.title', { year: props.year }) })
  } catch (error) {
    if (error?.name !== 'AbortError') downloadStory()
  }
}

onMounted(drawStory)

onBeforeUnmount(() => {
  if (storyUrl) URL.revokeObjectURL(storyUrl)
})
</script>

<style scoped>
.story {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-7);
}

.story-preview {
  position: relative;
  width: 15rem;
  aspect-ratio: 9 / 16;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #0e0e11;
  box-shadow: var(--shadow-3);
}

.story-canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.story-canvas.ready {
  opacity: 1;
}

.story-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--fs-sm);
}

.story-text h2 {
  margin-bottom: var(--space-2);
}

.story-text p {
  margin: 0 0 var(--space-4);
  color: var(--text-secondary);
  line-height: 1.5;
}

.story-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.story-text .story-note {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .story-canvas {
    transition: none;
  }
}

@media (max-width: 639.98px) {
  .story {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
  }

  .story-actions {
    justify-content: center;
  }
}
</style>

<template>
  <section
    class="reading-card"
    :class="`is-${status}`"
    aria-labelledby="reading-card-title"
  >
    <div
      v-if="showProgress"
      class="rc-head"
    >
      <h3
        id="reading-card-title"
        class="rc-title"
      >{{ t('readCard.title') }}</h3>
      <span
        class="rc-percent"
        aria-hidden="true"
      >{{ shownPercent }}%</span>
    </div>
    <h3
      v-else
      id="reading-card-title"
      class="sr-only"
    >{{ t('status.label') }}</h3>

    <!-- Barra que enche (transform: scaleX); o número fica no progressbar -->
    <div
      v-if="showProgress"
      class="rc-bar"
      role="progressbar"
      :aria-valuenow="shownPercent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('progress.label')"
    >
      <span
        class="rc-fill"
        :style="{ transform: `scaleX(${shownPercent / 100})` }"
      ></span>
    </div>

    <!-- Lendo: "Página 212 de 340 · 62%" e atualizar (o editor do progresso) -->
    <ReadingProgress
      v-if="status === 'reading'"
      class="rc-progress"
      :book-id="bookId"
      :title="book.title"
      :page-count="book.page_count ?? null"
      :current-page="book.current_page ?? null"
      :progress-percent="book.progress_percent ?? null"
      @saved="value => emit('progress-saved', value)"
    />
    <p
      v-else-if="status === 'read' && book.page_count"
      class="rc-caption"
    >{{ t('progress.pageOf', { page: book.page_count, total: book.page_count, percent: 100 }) }}</p>

    <!-- Botão que muda de estado: "Marcar como lido" → "✓ Lido em …" -->
    <button
      type="button"
      class="read-main-btn"
      :class="{ done: status === 'read' }"
      :aria-pressed="status === 'read'"
      :disabled="saving"
      data-press
      @click="emit('change-status', 'read')"
    >
      <span
        :key="status === 'read' ? 'done' : 'todo'"
        class="rmb-content"
      >
        <i
          class="pi pi-check"
          aria-hidden="true"
        ></i>
        {{ status === 'read' ? t('readCard.readOn', { date: readDateText }) : t('readCard.markRead') }}
      </span>
    </button>

    <!-- Os outros status, menores -->
    <div
      v-if="status !== 'read'"
      class="rc-secondary"
      role="group"
      :aria-label="t('status.label')"
    >
      <PillButton
        v-for="option in ['want', 'reading']"
        :key="option"
        :icon="STATUS_ICONS[option]"
        :label="t(`status.${option}`)"
        :active="status === option"
        :disabled="saving"
        @click="emit('change-status', option)"
      />
    </div>
    <div
      v-else
      class="rc-secondary"
    >
      <AppButton
        :label="t('history.readAgain')"
        icon="pi pi-replay"
        class="btn-text btn-sm"
        :loading="againBusy"
        @click="emit('read-again')"
      />
      <span
        v-if="readCount > 1"
        class="rc-count"
      >{{ t('history.readTimes', { n: readCount }, readCount) }}</span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ReadingProgress from './ReadingProgress.vue'
import PillButton from '../form/PillButton.vue'
import AppButton from '../ui/AppButton.vue'
import { statusOf, STATUS_ICONS } from '../../utils/readingStatus.js'

/**
 * Celular: cartão da leitura do livro aberto, como no trailer. Progresso
 * (barra que enche) e o botão grande que vira "✓ Lido em …"; "Quero ler" e
 * "Lendo" ficam menores embaixo. Quem salva é o BookDialog (change-status,
 * na hora e com o servidor confirmando depois).
 */
const props = defineProps({
  bookId: { type: Number, required: true },
  book: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  againBusy: { type: Boolean, default: false }
})
const emit = defineEmits(['change-status', 'progress-saved', 'read-again'])
const { t, locale } = useI18n()

const status = computed(() => statusOf(props.book))
const readCount = computed(() => props.book.read_count ?? (props.book.read_date ? 1 : 0))
const showProgress = computed(() => status.value === 'reading' || status.value === 'read')

const shownPercent = computed(() => {
  if (status.value === 'read') return 100
  const { progress_percent: percent, current_page: page, page_count: total } = props.book
  if (percent != null) return Math.max(0, Math.min(100, Math.round(percent)))
  if (page != null && total) return Math.min(100, Math.round((page / total) * 100))
  return 0
})

const readDateText = computed(() => {
  const date = props.book.read_date
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR')
})
</script>

<style scoped>
.reading-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-app);
}

.rc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.rc-title {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.rc-percent {
  font-size: var(--fs-lg);
  font-weight: 800;
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  font-variant-numeric: tabular-nums;
}

.rc-bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.rc-fill {
  display: block;
  height: 100%;
  background: var(--main-solid);
  transform-origin: left center;
  transition: transform var(--dur-long) var(--ease-standard);
}

.is-read .rc-fill {
  background: var(--success);
}

/* O progresso de verdade já está na barra de cima */
.rc-progress :deep(.bar) {
  display: none;
}

.rc-caption {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.read-main-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border: 1px solid var(--main-solid);
  border-radius: var(--radius-md);
  background: var(--main-solid);
  color: var(--on-main);
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
}

/* Lido: verde tingido com texto verde (≥ 4,5:1 nos dois temas: --success
   sobre o próprio tingido de 15%, main.css) */
.read-main-btn.done {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 15%, var(--bg-app));
  color: var(--success);
}

.read-main-btn:disabled {
  cursor: progress;
}

.read-main-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.rmb-content {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  animation: rmb-in var(--dur-medium) var(--ease-enter);
}

.read-main-btn.done .pi-check {
  animation: rmb-check var(--dur-spring) var(--ease-spring);
}

.rc-secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.rc-count {
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

@keyframes rmb-in {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }
}

@keyframes rmb-check {
  from {
    transform: scale(0.2) rotate(-25deg);
  }
}
</style>

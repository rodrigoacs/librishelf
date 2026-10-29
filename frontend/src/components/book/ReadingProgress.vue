<template>
  <div
    class="reading-progress"
    :class="{ compact }"
  >
    <div
      class="bar"
      role="progressbar"
      :aria-valuenow="percent ?? 0"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="label"
      :aria-label="t('progress.label')"
    >
      <span
        class="fill"
        :style="{ width: `${percent ?? 0}%` }"
      ></span>
    </div>

    <div
      v-if="!editing"
      class="summary"
    >
      <span class="label">{{ compact ? shortLabel : label }}</span>
      <button
        v-if="editable"
        type="button"
        class="update-btn"
        :class="{ 'icon-only': compact }"
        :aria-label="t('progress.updateFor', { title })"
        :title="compact ? t('progress.update') : undefined"
        @click="startEditing"
      >
        <i
          class="pi pi-pencil"
          aria-hidden="true"
        ></i>
        <span v-if="!compact">{{ t('progress.update') }}</span>
      </button>
    </div>

    <form
      v-else
      class="editor"
      novalidate
      @submit.prevent="save"
      @keydown.esc.stop.prevent="editing = false"
    >
      <div class="inputs">
        <template v-if="mode === 'page'">
          <label
            :for="`${uid}-page`"
            class="sr-only"
          >{{ t('progress.page') }}</label>
          <span
            v-if="!compact"
            class="prefix"
            aria-hidden="true"
          >{{ t('progress.pageShort') }}</span>
          <input
            :id="`${uid}-page`"
            ref="firstInput"
            v-model.number="pageInput"
            type="number"
            inputmode="numeric"
            min="0"
            :max="totalInput || 20000"
            class="num"
          />
          <span class="of">{{ compact ? '/' : t('progress.of') }}</span>
          <label
            :for="`${uid}-total`"
            class="sr-only"
          >{{ t('progress.totalPages') }}</label>
          <input
            v-if="!pageCount || editTotal"
            :id="`${uid}-total`"
            v-model.number="totalInput"
            type="number"
            inputmode="numeric"
            min="1"
            max="20000"
            class="num"
            :placeholder="t('progress.totalShort')"
          />
          <button
            v-else
            type="button"
            class="total-btn"
            :title="t('progress.editTotal')"
            @click="editTotal = true"
          >{{ pageCount }}</button>
        </template>
        <template v-else>
          <label
            :for="`${uid}-percent`"
            class="sr-only"
          >{{ t('progress.percent') }}</label>
          <input
            :id="`${uid}-percent`"
            ref="firstInput"
            v-model.number="percentInput"
            type="number"
            inputmode="numeric"
            min="0"
            max="100"
            class="num"
          />
          <span
            class="of"
            aria-hidden="true"
          >%</span>
        </template>
        <button
          type="button"
          class="mode-btn"
          @click="toggleMode"
        >{{ mode === 'page' ? t('progress.usePercent') : t('progress.usePages') }}</button>
      </div>

      <div class="editor-actions">
        <AppButton
          type="button"
          :label="t('common.cancel')"
          class="btn-text btn-secondary btn-sm"
          @click="editing = false"
        />
        <AppButton
          type="submit"
          :label="t('progress.save')"
          class="btn-primary btn-sm"
          :loading="saving"
        />
      </div>
      <small
        v-if="error"
        class="error"
        role="alert"
      >{{ error }}</small>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import api from '../../services/api.js'

/**
 * Progresso da leitura em andamento: barra, "Página 150 de 600 · 25%" e
 * atualização rápida por página ou por %. Sem o total de páginas, dá para
 * informar junto. Emite "saved" com { reading, pageCount }.
 */
const props = defineProps({
  bookId: { type: Number, required: true },
  title: { type: String, default: '' },
  pageCount: { type: Number, default: null },
  currentPage: { type: Number, default: null },
  progressPercent: { type: Number, default: null },
  editable: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
})
const emit = defineEmits(['saved'])
const { t } = useI18n()

const uid = `progress-${Math.random().toString(36).slice(2, 8)}`
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const mode = ref('page') // page | percent
const editTotal = ref(false)
const pageInput = ref(null)
const totalInput = ref(null)
const percentInput = ref(null)
const firstInput = ref(null)

const percent = computed(() => {
  if (props.progressPercent != null) return props.progressPercent
  if (props.currentPage != null && props.pageCount) return Math.min(100, Math.round((props.currentPage / props.pageCount) * 100))
  return null
})

// Card estreito do Início: "42 de 246 · 17%"
const shortLabel = computed(() => {
  if (props.currentPage != null && props.pageCount) {
    return t('progress.pageOfShort', { page: props.currentPage, total: props.pageCount, percent: percent.value ?? 0 })
  }
  return label.value
})

const label = computed(() => {
  if (props.currentPage != null && props.pageCount) {
    return t('progress.pageOf', { page: props.currentPage, total: props.pageCount, percent: percent.value ?? 0 })
  }
  if (percent.value != null) return t('progress.percentOnly', { percent: percent.value })
  if (props.currentPage != null) return t('progress.pageOnly', { page: props.currentPage })
  return t('progress.none')
})

async function startEditing() {
  error.value = ''
  editTotal.value = false
  // Com total de páginas, começa pela página; sem ele, pela % (se já havia %)
  mode.value = props.pageCount || props.currentPage != null || props.progressPercent == null ? 'page' : 'percent'
  pageInput.value = props.currentPage
  totalInput.value = props.pageCount
  percentInput.value = percent.value
  editing.value = true
  await nextTick()
  firstInput.value?.focus()
  firstInput.value?.select?.()
}

async function toggleMode() {
  mode.value = mode.value === 'page' ? 'percent' : 'page'
  error.value = ''
  await nextTick()
  firstInput.value?.focus()
}

const isInt = value => Number.isInteger(value)

async function save() {
  error.value = ''
  const body = {}
  if (mode.value === 'page') {
    if (!isInt(pageInput.value) || pageInput.value < 0) {
      error.value = t('progress.errors.page')
      return
    }
    const total = (!props.pageCount || editTotal.value) ? totalInput.value : props.pageCount
    if (total !== null && total !== '' && total !== undefined) {
      if (!isInt(total) || total < 1 || total > 20000) {
        error.value = t('progress.errors.total')
        return
      }
      if (pageInput.value > total) {
        error.value = t('progress.errors.over', { total })
        return
      }
      if (total !== props.pageCount) body.totalPages = total
    }
    body.page = pageInput.value
  } else {
    if (!isInt(percentInput.value) || percentInput.value < 0 || percentInput.value > 100) {
      error.value = t('progress.errors.percent')
      return
    }
    body.percent = percentInput.value
  }

  saving.value = true
  try {
    const result = await api.setProgress(props.bookId, body)
    emit('saved', result)
    editing.value = false
  } catch (err) {
    error.value = err.message || t('progress.errors.save')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.reading-progress {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.compact .bar {
  height: 6px;
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--main-solid);
  transition: width 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}

.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  min-height: 2rem;
  gap: 0.25rem 0.75rem;
  min-width: 0;
}

.label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.update-btn,
.mode-btn,
.total-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.1rem;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.update-btn .pi {
  font-size: var(--fs-xs);
}

.update-btn.icon-only {
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  color: var(--text-secondary);
}

.update-btn.icon-only:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  text-decoration: none;
}

.update-btn:hover,
.mode-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.update-btn:focus-visible,
.mode-btn:focus-visible,
.total-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inputs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.prefix,
.of {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.num {
  width: 4.75rem;
  appearance: textfield;
  -moz-appearance: textfield;
  height: 2.4rem;
  padding: 0 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.num::-webkit-outer-spin-button,
.num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.num:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.total-btn {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.mode-btn {
  font-weight: 500;
  color: var(--text-secondary);
}

.compact .mode-btn {
  flex-basis: 100%;
  justify-content: flex-start;
}

.compact .editor-actions {
  justify-content: flex-start;
}

.error {
  color: var(--red);
  font-size: var(--fs-xs);
}

@media (pointer: coarse) {
  .num {
    height: 44px;
  }

  .update-btn,
  .mode-btn,
  .total-btn {
    min-height: 44px;
  }

  .update-btn.icon-only {
    width: 44px;
  }
}
</style>

<template>
  <form
    class="reading-editor"
    novalidate
    @submit.prevent="submit"
    @keydown.esc.stop.prevent="emit('cancel')"
  >
    <div class="dates">
      <DateField
        :id="`${idPrefix}-start`"
        v-model="startedOn"
        :label="t('history.startedOn')"
        :min-date="READ_MIN_DATE"
        :max-date="today"
      />
      <DateField
        :id="`${idPrefix}-end`"
        v-model="finishedOn"
        :label="requireFinish || reading?.finishedOn ? t('history.finishedOnLabel') : t('history.finishedOnOptional')"
        :min-date="READ_MIN_DATE"
        :max-date="today"
        :error="localError"
      />
    </div>
    <div class="rating-row">
      <span
        :id="`${idPrefix}-rating-label`"
        class="rating-label"
      >{{ t('history.ratingOptional') }}</span>
      <StarRating
        v-model="rating"
        size="sm"
        :label="t('history.ratingOptional')"
      />
    </div>
    <small
      v-if="error"
      class="error"
      role="alert"
    >{{ error }}</small>
    <div class="actions">
      <AppButton
        type="button"
        :label="t('common.cancel')"
        class="btn-text btn-secondary btn-sm"
        @click="emit('cancel')"
      />
      <AppButton
        type="submit"
        :label="t('history.save')"
        class="btn-primary btn-sm"
        :loading="saving"
      />
    </div>
  </form>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import DateField from '../form/DateField.vue'
import StarRating from '../StarRating.vue'
import { fromApiDate, toApiDate, READ_MIN_DATE } from '../../utils/dates.js'

/** Datas e nota de uma leitura (editar uma do histórico ou registrar uma antiga). */
const props = defineProps({
  idPrefix: { type: String, required: true },
  reading: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  // Registrar leitura antiga: precisa da data de fim
  requireFinish: { type: Boolean, default: false }
})
const emit = defineEmits(['save', 'cancel'])
const { t } = useI18n()

const today = new Date()
const startedOn = ref(fromApiDate(props.reading?.startedOn))
const finishedOn = ref(fromApiDate(props.reading?.finishedOn))
const rating = ref(props.reading?.rating ?? null)
const localError = ref('')

function submit() {
  localError.value = ''
  const start = toApiDate(startedOn.value)
  const end = toApiDate(finishedOn.value)
  if ((props.requireFinish || props.reading?.finishedOn) && !end) {
    localError.value = t('history.errors.finishRequired')
    return
  }
  if (start && end && start > end) {
    localError.value = t('history.errors.order')
    return
  }
  emit('save', { startedOn: start, finishedOn: end, rating: rating.value })
}
</script>

<style scoped>
.reading-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem;
  border-radius: 10px;
  background: rgba(var(--main-color-rgb), 0.05);
  border: 1px solid var(--border-color);
}

.dates {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
}

.rating-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.rating-label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.error {
  color: var(--red);
  font-size: var(--fs-xs);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}

@media (max-width: 480px) {
  .dates {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

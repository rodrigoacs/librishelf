<template>
  <FormSection :legend="t('bookForm.readingSection')">
    <div>
      <FieldLabel :id="`${idPrefix}-status-label`">{{ t('status.label') }}</FieldLabel>
      <div
        class="status-picker"
        role="group"
        :aria-labelledby="`${idPrefix}-status-label`"
      >
        <PillButton
          v-for="option in STATUS_OPTIONS"
          :key="option"
          :icon="STATUS_ICONS[option]"
          :label="t(`status.${option}`)"
          :active="status === option"
          @click="pickStatus(option)"
        />
      </div>
      <p class="status-caption">{{ statusCaption }}</p>
    </div>

    <DateField
      v-if="status === 'read' || status === 'reading'"
      :id="`${idPrefix}-status-date`"
      v-model="statusDate"
      :label="status === 'read' ? t('bookForm.readOn') : t('bookForm.startedOn')"
      :min-date="READ_MIN_DATE"
      :max-date="today"
      :error="errors.statusDate"
    />

    <div>
      <FieldLabel :id="`${idPrefix}-rating-label`">{{ t('rating.label') }}</FieldLabel>
      <StarRating
        v-model="rating"
        size="lg"
        :label="t('rating.label')"
      />
      <small
        v-if="errors.rating"
        class="inline-error"
      >{{ errors.rating }}</small>
    </div>

    <TextField
      :id="`${idPrefix}-notes`"
      v-model="notes"
      :label="t('notes.label')"
      :hint="`${t('notes.privateHint')} · ${(notes || '').length}/5000`"
      :error="errors.notes"
      multiline
      rows="3"
      maxlength="5000"
    />
  </FormSection>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FormSection from '../form/FormSection.vue'
import FieldLabel from '../form/FieldLabel.vue'
import PillButton from '../form/PillButton.vue'
import TextField from '../form/TextField.vue'
import DateField from '../form/DateField.vue'
import StarRating from '../StarRating.vue'
import { READ_MIN_DATE } from '../../utils/dates.js'
import { STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'

/**
 * "Sua leitura" do formulário de livro (BookEditForm): status, data de
 * leitura/início, nota e anotação pessoal.
 */
defineProps({
  idPrefix: { type: String, required: true },
  // Mensagens por campo (BookEditForm valida e limpa)
  errors: { type: Object, required: true }
})

// status: none | want | reading | read
const status = defineModel('status', { type: String })
const statusDate = defineModel('statusDate', { type: Date })
const rating = defineModel('rating', { type: Number })
const notes = defineModel('notes', { type: String })

const { t } = useI18n()

// Data de leitura não pode estar no futuro (o servidor também recusa).
const today = new Date()

// Tocar no status ativo tira o status; "Lido"/"Lendo" sem data começam hoje
function pickStatus(option) {
  const next = status.value === option ? 'none' : option
  status.value = next
  if ((next === 'read' || next === 'reading') && !statusDate.value) {
    const now = new Date()
    statusDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
}

const statusCaption = computed(() => {
  if (status.value === 'want') return t('status.wantCaption')
  if (status.value === 'none') return t('bookForm.statusNone')
  return t('bookForm.statusClear')
})
</script>

<style scoped>
.status-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.status-caption {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.inline-error {
  display: block;
  margin-top: var(--space-1);
  color: var(--red);
  font-size: var(--fs-xs);
}
</style>

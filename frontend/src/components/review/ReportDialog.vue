<template>
  <!-- No body: a resenha pode estar dentro de outro diálogo (o do livro) -->
  <Teleport to="body">
    <AppDialog
      :visible="visible"
      size="sm"
      :header="t(isAvatar ? 'avatar.reportTitle' : 'review.reportTitle')"
      @update:visible="value => emit('update:visible', value)"
    >
      <form
        class="report-form"
        novalidate
        @submit.prevent="submit"
      >
        <p class="intro">{{ t(isAvatar ? 'avatar.reportIntro' : 'review.reportIntro', { name: username }) }}</p>

        <fieldset class="reasons">
          <legend class="sr-only">{{ t('review.reportReason') }}</legend>
          <label
            v-for="option in reasons"
            :key="option"
            class="reason"
            :class="{ selected: reason === option }"
          >
            <input
              v-model="reason"
              type="radio"
              name="report-reason"
              :value="option"
            />
            <span>{{ t(isAvatar ? `avatar.reasons.${option}` : `review.reasons.${option}`) }}</span>
          </label>
        </fieldset>

        <div class="note-field">
          <label
            :for="noteId"
            class="note-label"
          >{{ t('review.reportNote') }}</label>
          <textarea
            :id="noteId"
            v-model="note"
            rows="3"
            :maxlength="MAX_NOTE"
            class="note"
          ></textarea>
          <small class="counter">{{ note.length }}/{{ MAX_NOTE }}</small>
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
            class="btn-text btn-secondary"
            @click="emit('update:visible', false)"
          />
          <AppButton
            type="submit"
            :label="t('review.reportSend')"
            icon="pi pi-flag"
            class="btn-primary"
            :loading="sending"
          />
        </div>
      </form>
    </AppDialog>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'

/**
 * Denunciar uma resenha (reviewId) ou uma foto de perfil (kind="avatar" +
 * username): motivo + observação opcional (vai para a moderação).
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  kind: { type: String, default: 'review' }, // review | avatar
  reviewId: { type: Number, default: null },
  username: { type: String, default: '' }
})
const emit = defineEmits(['update:visible'])
const { t } = useI18n()
const toast = useToast()

const REASONS = { review: ['spoiler', 'offensive', 'spam', 'other'], avatar: ['offensive', 'impersonation', 'spam', 'other'] }
const isAvatar = computed(() => props.kind === 'avatar')
const reasons = computed(() => REASONS[isAvatar.value ? 'avatar' : 'review'])
const MAX_NOTE = 500
const noteId = `report-note-${Math.random().toString(36).slice(2, 8)}`

const reason = ref(reasons.value[0])
const note = ref('')
const error = ref('')
const sending = ref(false)

watch(() => props.visible, open => {
  if (!open) return
  reason.value = reasons.value[0]
  note.value = ''
  error.value = ''
})

async function submit() {
  error.value = ''
  sending.value = true
  try {
    if (isAvatar.value) await api.reportAvatar(props.username, reason.value, note.value.trim() || undefined)
    else await api.reportReview(props.reviewId, reason.value, note.value.trim() || undefined)
    emit('update:visible', false)
    toast.add({ severity: 'success', summary: t('review.reportSent'), detail: t('review.reportSentDetail'), life: 4000 })
  } catch (err) {
    error.value = err.message || t('review.reportFailed')
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.report-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.intro {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.reasons {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  border: none;
}

.reason {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.75rem;
  padding: 0 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--fs-md);
}

.reason:hover {
  border-color: var(--border-hover);
}

.reason.selected {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

.reason input {
  accent-color: var(--main-solid);
  width: 1.05rem;
  height: 1.05rem;
  margin: 0;
}

.reason:has(input:focus-visible) {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.note-label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.note {
  width: 100%;
  resize: vertical;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.45;
}

.note:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.counter {
  align-self: flex-end;
  color: var(--text-muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

.error {
  color: var(--red);
  font-size: var(--fs-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>

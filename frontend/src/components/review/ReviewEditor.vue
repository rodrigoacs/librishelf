<template>
  <section
    class="review-section"
    :aria-labelledby="headingId"
  >
    <div class="section-head">
      <h3
        :id="headingId"
        class="section-title"
      >
        <i
          class="pi pi-comment"
          aria-hidden="true"
        ></i>
        {{ t('review.title') }}
      </h3>
      <div
        v-if="review && !editing"
        class="head-actions"
      >
        <button
          type="button"
          class="text-btn"
          :aria-label="t('review.editAria')"
          @click="startEditing"
        >{{ t('review.edit') }}</button>
        <button
          type="button"
          class="text-btn danger"
          :aria-label="t('review.deleteAria')"
          @click="remove"
        >{{ t('review.delete') }}</button>
      </div>
    </div>

    <p
      v-if="loading"
      class="muted"
    >{{ t('common.loading') }}</p>

    <p
      v-else-if="loadError"
      class="muted"
    >{{ t('review.loadFailed') }}</p>

    <!-- Sem resenha -->
    <button
      v-else-if="!review && !editing"
      type="button"
      class="write-btn"
      @click="startEditing"
    >
      <i
        class="pi pi-pencil"
        aria-hidden="true"
      ></i>
      <span>
        <strong>{{ t('review.write') }}</strong>
        <small>{{ t('review.writeHint') }}</small>
      </span>
    </button>

    <!-- Resenha salva -->
    <template v-else-if="!editing">
      <p
        v-if="review.hidden"
        class="notice warn"
        role="status"
      >
        <i
          class="pi pi-eye-slash"
          aria-hidden="true"
        ></i>
        {{ t('review.hiddenNotice') }}
      </p>
      <p
        v-else-if="reachHint"
        class="notice"
      >
        <i
          class="pi pi-info-circle"
          aria-hidden="true"
        ></i>
        <i18n-t
          scope="global"
          :keypath="reachHint"
          tag="span"
        >
          <template #settings>
            <router-link :to="{ name: 'settings' }">{{ t('review.settingsLink') }}</router-link>
          </template>
        </i18n-t>
      </p>
      <ReviewCard
        :review="review"
        flat
      />
    </template>

    <!-- Escrevendo -->
    <form
      v-else
      class="editor"
      novalidate
      @submit.prevent="save"
      @keydown.esc.stop.prevent="cancel"
    >
      <label
        :for="`${uid}-body`"
        class="sr-only"
      >{{ t('review.title') }}</label>
      <textarea
        :id="`${uid}-body`"
        ref="textareaEl"
        v-model="draft.body"
        class="body-input"
        rows="6"
        :maxlength="MAX_BODY"
        :placeholder="t('review.placeholder')"
        :aria-describedby="`${uid}-counter`"
      ></textarea>
      <small
        :id="`${uid}-counter`"
        class="counter"
        :class="{ near: draft.body.length > MAX_BODY - 200 }"
      >{{ t('review.counter', { n: draft.body.length, max: MAX_BODY }) }}</small>

      <div class="option-row">
        <label
          :for="`${uid}-spoiler`"
          class="option-label"
        >
          <span>{{ t('review.spoiler') }}</span>
          <small>{{ t('review.spoilerHint') }}</small>
        </label>
        <AppSwitch
          v-model="draft.hasSpoiler"
          :input-id="`${uid}-spoiler`"
        />
      </div>

      <div
        class="visibility"
        role="radiogroup"
        :aria-label="t('review.visibility')"
      >
        <span
          class="option-label"
          aria-hidden="true"
        >{{ t('review.visibility') }}</span>
        <div class="pills">
          <PillButton
            v-for="option in VISIBILITIES"
            :key="option.value"
            role="radio"
            :aria-checked="draft.visibility === option.value ? 'true' : 'false'"
            :pressable="false"
            :active="draft.visibility === option.value"
            :icon="option.icon"
            :label="t(option.label)"
            @click="draft.visibility = option.value"
          />
        </div>
      </div>

      <p
        v-if="reachHint"
        class="notice"
      >
        <i
          class="pi pi-info-circle"
          aria-hidden="true"
        ></i>
        <i18n-t
          scope="global"
          :keypath="reachHint"
          tag="span"
        >
          <template #settings>
            <router-link :to="{ name: 'settings' }">{{ t('review.settingsLink') }}</router-link>
          </template>
        </i18n-t>
      </p>

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
          @click="cancel"
        />
        <AppButton
          type="submit"
          :label="t('review.save')"
          class="btn-primary btn-sm"
          :loading="saving"
        />
      </div>
    </form>
  </section>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import PillButton from '../form/PillButton.vue'
import ReviewCard from './ReviewCard.vue'
import api from '../../services/api.js'
import { currentUser } from '../../services/session.js'
import { useToast } from '../../services/toast.js'
import { useConfirm, confirmDiscard } from '../../services/confirm.js'
import { formSnapshot, hasChanges } from '../../utils/formState.js'

/**
 * Resenha do dono, no livro aberto: escrever, editar, apagar. Diferente das
 * anotações (privadas), aparece para outros leitores conforme a visibilidade.
 */
const props = defineProps({
  bookId: { type: Number, required: true }
})
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const MAX_BODY = 5000
const VISIBILITIES = [
  { value: 'public', icon: 'pi pi-globe', label: 'review.public' },
  { value: 'followers', icon: 'pi pi-users', label: 'review.followers' }
]

const uid = `review-${Math.random().toString(36).slice(2, 8)}`
const headingId = `${uid}-heading`
const review = ref(null)
const loading = ref(false)
const loadError = ref(false)
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const textareaEl = ref(null)
const draft = reactive({ body: '', hasSpoiler: false, visibility: 'public' })

// Quem vai conseguir ler: biblioteca privada não mostra nada; "só seguidores"
// precisa aceitar seguidores
const reachHint = computed(() => {
  const user = currentUser.value
  if (!user) return ''
  if (!user.isPublic) return 'review.privateHint'
  const visibility = editing.value ? draft.visibility : review.value?.visibility
  if (visibility === 'followers' && !user.showActivity) return 'review.followersOffHint'
  return ''
})

async function load() {
  if (!props.bookId) return
  loading.value = true
  loadError.value = false
  editing.value = false
  try {
    review.value = (await api.getReview(props.bookId)).review
  } catch {
    loadError.value = true
    review.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.bookId, load, { immediate: true })

async function startEditing() {
  draft.body = review.value?.body ?? ''
  draft.hasSpoiler = review.value?.hasSpoiler ?? false
  draft.visibility = review.value?.visibility ?? 'public'
  error.value = ''
  draftSnapshot = formSnapshot(draft)
  editing.value = true
  await nextTick()
  textareaEl.value?.focus()
}

// Texto, spoiler e visibilidade ao começar a editar (utils/formState.js)
let draftSnapshot = null
function isDirty() {
  return editing.value && !saving.value && hasChanges(draftSnapshot, draft)
}

function discard() {
  editing.value = false
  error.value = ''
}

// Cancelar ou Esc com o texto mudado: pergunta antes de jogar fora
async function cancel() {
  if (isDirty() && !(await confirmDiscard(t))) {
    textareaEl.value?.focus()
    return
  }
  discard()
}

defineExpose({ isDirty, discard })

async function save() {
  error.value = ''
  const body = draft.body.trim()
  if (!body) {
    error.value = t('errors.REVIEW_EMPTY')
    return
  }
  saving.value = true
  try {
    review.value = (await api.saveReview(props.bookId, { body, hasSpoiler: draft.hasSpoiler, visibility: draft.visibility })).review
    editing.value = false
    toast.add({ severity: 'success', summary: t('review.saved'), life: 2500 })
  } catch (err) {
    error.value = err.message || t('review.saveFailed')
  } finally {
    saving.value = false
  }
}

function remove() {
  confirm.require({
    header: t('review.deleteTitle'),
    message: t('review.deleteMessage'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('review.deleteConfirm'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      try {
        await api.deleteReview(props.bookId)
        review.value = null
        toast.add({ severity: 'success', summary: t('review.deleted'), life: 2500 })
      } catch (err) {
        toast.add({ severity: 'error', summary: t('review.deleteFailed'), detail: err.message, life: 4000 })
      }
    }
  })
}
</script>

<style scoped>
.review-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
}

.section-title .pi {
  color: var(--text-secondary);
}

.head-actions {
  display: flex;
  gap: 0.75rem;
}

.text-btn {
  padding: 0.25rem 0.1rem;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.text-btn.danger {
  color: var(--red);
}

.text-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.text-btn:focus-visible,
.write-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.write-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  border: 1px dashed var(--border-hover);
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.write-btn:hover {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.05);
}

.write-btn .pi {
  color: var(--main-color);
}

.write-btn span {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.write-btn strong {
  font-size: var(--fs-md);
  font-weight: 600;
}

.write-btn small {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.notice .pi {
  margin-top: 0.15rem;
  color: var(--main-color);
}

.notice.warn {
  background: rgba(var(--orange-rgb), 0.12);
}

.notice.warn .pi {
  color: var(--orange);
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.05);
  border: 1px solid var(--border-color);
}

.body-input {
  width: 100%;
  min-height: 8rem;
  resize: vertical;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.55;
}

.body-input:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.counter {
  align-self: flex-end;
  margin-top: -0.4rem;
  color: var(--text-muted);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

.counter.near {
  color: var(--orange);
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.option-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.option-label small {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.visibility {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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
</style>

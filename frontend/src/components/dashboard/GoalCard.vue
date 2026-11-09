<template>
  <section
    class="goal-card"
    aria-labelledby="goal-title"
  >
    <div class="goal-head">
      <h2
        id="goal-title"
        class="section-title"
      >{{ t('goal.title', { year }) }}</h2>
      <div
        v-if="!editing"
        class="goal-actions"
      >
        <AppButton
          v-if="goal"
          :label="t('goal.edit')"
          icon="pi pi-pencil"
          class="btn-text btn-sm"
          @click="startEdit"
        />
        <AppButton
          v-else
          :label="t('goal.set')"
          icon="pi pi-flag"
          class="btn-sm btn-primary"
          @click="startEdit"
        />
      </div>
    </div>

    <form
      v-if="editing"
      class="goal-form"
      @submit.prevent="save"
    >
      <label for="goal-target">{{ t('goal.question', { year }) }}</label>
      <div class="goal-form-row">
        <NumberField
          v-model="draft"
          inputId="goal-target"
          :min="1"
          :max="1000"
          class="goal-input"
        />
        <AppButton
          type="submit"
          :label="t('goal.save')"
          :loading="saving"
          class="btn-sm btn-primary"
        />
        <AppButton
          type="button"
          :label="t('common.cancel')"
          class="btn-text btn-sm"
          @click="editing = false"
        />
        <AppButton
          v-if="goal"
          type="button"
          :label="t('goal.remove')"
          class="btn-text btn-sm btn-danger"
          :disabled="saving"
          @click="remove"
        />
      </div>
    </form>

    <template v-else-if="goal">
      <p class="goal-numbers">
        <strong>{{ read }}</strong>
        <span>{{ t('goal.ofTarget', { goal }, goal) }}</span>
      </p>
      <div
        class="goal-bar"
        role="progressbar"
        :aria-valuenow="read"
        aria-valuemin="0"
        :aria-valuemax="goal"
        :aria-label="t('goal.title', { year })"
      >
        <span
          class="goal-fill"
          :style="{ width: `${progress.percent}%` }"
        ></span>
        <span
          v-if="progress.pace !== null"
          class="goal-pace"
          :style="{ left: `${progress.pace}%` }"
          :title="t('goal.paceMarker')"
        ></span>
      </div>
      <p
        class="goal-status"
        :class="progress.status.tone"
      >{{ statusText }}</p>
    </template>

    <p
      v-else
      class="goal-empty"
    >{{ t('goal.empty', { n: read }, read) }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import NumberField from '../ui/NumberField.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { goalProgress } from '../../utils/readingGoal.js'

/**
 * Meta de leitura do ano: progresso, ritmo e o formulário para definir,
 * mudar ou excluir. v-model:goal = a meta salva (null sem meta).
 * O Painel recria o cartão ao trocar de ano (o carregando o desmonta),
 * então o formulário aberto não passa de um ano para outro.
 */
const props = defineProps({
  year: { type: Number, required: true },
  // Leituras no ano
  read: { type: Number, required: true }
})
const goal = defineModel('goal', { type: Number, default: null })

const { t } = useI18n()
const toast = useToast()

const editing = ref(false)
const draft = ref(12)
const saving = ref(false)

const progress = computed(() => goalProgress({ goal: goal.value, read: props.read, year: props.year }))
const statusText = computed(() => {
  const status = progress.value.status
  if (!status) return ''
  return status.n === undefined ? t(`goal.${status.key}`) : t(`goal.${status.key}`, { n: status.n }, status.n)
})

function startEdit() {
  draft.value = goal.value || Math.max(12, props.read)
  editing.value = true
}

async function run(task) {
  saving.value = true
  try {
    await task()
    editing.value = false
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    saving.value = false
  }
}

function save() {
  if (!draft.value) return
  return run(async () => {
    goal.value = (await api.setReadingGoal(props.year, draft.value)).target
  })
}

function remove() {
  return run(async () => {
    await api.deleteReadingGoal(props.year)
    goal.value = null
  })
}
</script>

<style scoped>
.goal-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  margin-bottom: var(--space-6);
}

.goal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.goal-head h2 {
  margin: 0;
}

.goal-numbers {
  margin: 0 0 var(--space-3);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  color: var(--text-secondary);
}

.goal-numbers strong {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  line-height: 1;
  color: var(--text-primary);
}

.goal-bar {
  position: relative;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-hover);
  overflow: visible;
}

.goal-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--main-color);
  transition: width 0.4s ease;
}

/* Onde deveria estar hoje para bater a meta no fim do ano. */
.goal-pace {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 20px;
  margin-left: -1px;
  background: var(--text-primary);
  opacity: 0.55;
  border-radius: 1px;
}

.goal-status {
  margin: var(--space-3) 0 0;
  font-size: var(--fs-md);
  color: var(--text-secondary);
}

.goal-status.good {
  color: var(--green);
}

.goal-status.warn {
  color: var(--orange);
}

.goal-empty {
  margin: 0;
  color: var(--text-secondary);
}

.goal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.goal-form label {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.goal-form-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

@media (max-width: 639.98px) {
  .goal-card {
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }
}
</style>

<template>
  <!-- Meta -->
  <YearPanel class="goal">
    <div class="goal-head">
      <h2 class="section-title">{{ t('year.goalTitle') }}</h2>
      <span class="goal-numbers">{{ t('year.goalProgress', { done: goal.done, target: goal.target }) }}</span>
    </div>
    <ProgressBar
      :value="goal.done"
      :max="goal.target"
      :label="t('year.goalTitle')"
      size="lg"
    />
    <p class="goal-note">{{ goal.done >= goal.target ? t('year.goalDone') : t('year.goalLeft', { n: goal.target - goal.done }, goal.target - goal.done) }}</p>
  </YearPanel>
</template>

<script setup>
import ProgressBar from '../ui/ProgressBar.vue'
import { useI18n } from 'vue-i18n'
import YearPanel from './YearPanel.vue'

/** Meta do ano: { done, target }. */
defineProps({
  goal: { type: Object, required: true }
})

const { t } = useI18n()
</script>

<style scoped>
.goal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.goal-numbers {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.goal-note {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
</style>

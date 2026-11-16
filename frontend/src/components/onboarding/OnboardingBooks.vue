<template>
  <OnboardingStep
    title-id="onb-books-title"
    :title="t('onboarding.books.title')"
    :text="t(`onboarding.books.text.${start || 'search'}`)"
    :next-label="t('onboarding.next')"
    :next-class="books >= firstBooks ? 'btn-primary' : 'btn-outlined btn-secondary'"
    :busy="busy"
    @back="emit('back')"
    @next="emit('next')"
  >
    <div class="onb-meter">
      <ProgressBar
        :value="Math.min(books, firstBooks)"
        :max="firstBooks"
        :label="t('onboarding.books.progressLabel')"
        :value-text="countText"
      />
      <p
        class="onb-meter-text"
        role="status"
      >{{ countText }}</p>
    </div>

    <div class="onb-actions">
      <router-link
        v-if="start === 'import'"
        :to="{ name: 'import' }"
        class="btn btn-primary"
      >{{ t('onboarding.books.import') }}</router-link>
      <AppButton
        :label="start === 'scan' ? t('onboarding.books.scan') : t('onboarding.books.add')"
        :icon="start === 'scan' ? 'pi pi-barcode' : 'pi pi-plus'"
        :class="start === 'import' ? 'btn-outlined btn-secondary' : 'btn-primary'"
        @click="addOpen = true"
      />
    </div>

    <AddBookDialog
      v-model:visible="addOpen"
      :find-mode="start === 'search' ? 'title' : 'isbn'"
      @save="emit('added')"
    />
  </OnboardingStep>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import ProgressBar from '../ui/ProgressBar.vue'
import AddBookDialog from '../AddBookDialog.vue'
import OnboardingStep from './OnboardingStep.vue'
import { booksLeft } from '../../utils/onboarding.js'

/** Passo 2: os primeiros livros, do jeito escolhido no passo 1. */
const props = defineProps({
  start: { type: String, default: null },
  books: { type: Number, default: 0 },
  firstBooks: { type: Number, default: 3 },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['added', 'next', 'back'])

const { t } = useI18n()
const addOpen = ref(false)

const countText = computed(() => {
  const left = booksLeft(props.books, props.firstBooks)
  return left ? t('onboarding.books.left', { n: left }, left) : t('onboarding.books.done', { n: props.books }, props.books)
})
</script>

<style scoped>
.onb-meter {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>

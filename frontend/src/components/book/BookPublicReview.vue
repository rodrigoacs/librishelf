<template>
  <!-- Biblioteca de outra pessoa: a resenha dela, se puder ver -->
  <section
    class="public-review"
    aria-labelledby="public-review-title"
  >
    <h3
      id="public-review-title"
      class="section-title public-review-title"
    >
      <i
        class="pi pi-comment"
        aria-hidden="true"
      ></i>
      {{ t('review.ofOwner', { name: ownerUsername }) }}
    </h3>
    <ReviewCard
      :review="review"
      flat
    />
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import ReviewCard from '../review/ReviewCard.vue'

defineProps({
  review: { type: Object, required: true },
  ownerUsername: { type: String, required: true }
})

const { t } = useI18n()
</script>

<style scoped>
.public-review {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--border-color);
  padding-top: var(--space-4);
}

.public-review-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}

.public-review-title .pi {
  color: var(--text-secondary);
}
</style>

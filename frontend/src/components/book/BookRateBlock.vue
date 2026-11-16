<template>
  <section
    class="rate-block"
    aria-labelledby="rate-block-title"
  >
    <h3
      id="rate-block-title"
      class="section-title rate-title"
    >{{ t('rating.yours') }}</h3>
    <StarRating
      :model-value="rating"
      size="lg"
      animated
      :disabled="saving"
      :label="t('rating.label')"
      @update:model-value="value => emit('rate', value)"
    />
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import StarRating from '../StarRating.vue'

/** "Sua nota" logo depois do cartão da leitura (celular). */
defineProps({
  rating: { type: Number, default: null },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['rate'])

const { t } = useI18n()
</script>

<style scoped>
@media (max-width: 639.98px) {
  .rate-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .rate-title {
    margin: 0;
  }

  /* 5 estrelas de 44 px + o X de limpar = 264 px: cabe a partir de 296 px
     (antes passavam da coluna ao lado da capa e cortavam o X) */
  .rate-block :deep(.star-rating) {
    flex-wrap: nowrap;
    margin-left: calc(-1 * var(--space-2));
  }
}
</style>

<template>
  <nav
    v-if="pages > 1"
    class="pager"
    :aria-label="t('admin.pager')"
  >
    <AppButton
      icon="pi pi-chevron-left"
      :aria-label="t('admin.prev')"
      class="btn-text btn-sm btn-secondary"
      :disabled="page <= 1 || busy"
      @click="emit('go', page - 1)"
    />
    <span>{{ t('admin.pageOf', { page, pages }) }}</span>
    <AppButton
      icon="pi pi-chevron-right"
      :aria-label="t('admin.next')"
      class="btn-text btn-sm btn-secondary"
      :disabled="page >= pages || busy"
      @click="emit('go', page + 1)"
    />
  </nav>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'

/** Anterior · página X de Y · próxima, das listas do Admin. */
defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['go'])
const { t } = useI18n()
</script>

<style scoped>
.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}
</style>

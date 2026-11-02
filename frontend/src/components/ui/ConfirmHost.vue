<template>
  <AppDialog
    :visible="Boolean(current)"
    size="sm"
    aria-labelledby="confirm-title"
    dialog-class="confirm-dialog"
    @update:visible="value => !value && settleConfirm(false)"
  >
    <template v-if="current">
      <div class="confirm-body">
        <i
          v-if="current.icon"
          :class="current.icon"
          class="confirm-icon"
          aria-hidden="true"
        ></i>
        <div>
          <h2 id="confirm-title">{{ current.header || t('bookDialog.confirm') }}</h2>
          <p>{{ current.message }}</p>
        </div>
      </div>
      <div class="confirm-actions">
        <AppButton
          :label="current.rejectLabel || t('common.cancel')"
          :class="current.rejectClass || 'btn-text btn-secondary'"
          @click="settleConfirm(false)"
        />
        <AppButton
          ref="acceptBtn"
          :label="current.acceptLabel || t('common.save')"
          :class="current.acceptClass || 'btn-primary'"
          @click="settleConfirm(true)"
        />
      </div>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from './AppDialog.vue'
import AppButton from './AppButton.vue'
import { pendingConfirm, settleConfirm } from '../../services/confirm.js'

/** Mostra a pergunta de services/confirm.js. */
const { t } = useI18n()
const current = computed(() => pendingConfirm.value)
</script>

<style>
.confirm-body {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-6) var(--space-4);
}

.confirm-body h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-lg);
}

.confirm-body p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.confirm-icon {
  font-size: var(--fs-xl);
  color: var(--main-color);
  margin-top: 0.1rem;
}

.confirm-dialog .pi-exclamation-triangle.confirm-icon {
  color: var(--red);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6) var(--space-5);
}
</style>

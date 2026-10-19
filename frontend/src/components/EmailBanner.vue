<template>
  <div
    class="email-banner"
    role="status"
  >
    <i
      class="pi pi-envelope"
      aria-hidden="true"
    ></i>
    <p>
      <i18n-t
        scope="global"
        keypath="emailBanner.text"
        tag="span"
      >
        <template #email>
          <strong>{{ email }}</strong>
        </template>
      </i18n-t>
    </p>
    <Button
      :label="sent ? t('emailBanner.sent') : t('emailBanner.resend')"
      :icon="sent ? 'pi pi-check' : undefined"
      class="p-button-sm p-button-text resend-btn"
      :disabled="sent"
      :loading="sending"
      @click="resend"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import api from '../services/api.js'
import { updateUser } from '../services/session.js'

/** Aviso fixo no topo enquanto o e-mail não for confirmado. */
defineProps({
  email: { type: String, default: '' }
})

const { t, locale } = useI18n()
const toast = useToast()
const sending = ref(false)
const sent = ref(false)

async function resend() {
  sending.value = true
  try {
    const result = await api.resendVerification(locale.value)
    if (result.alreadyVerified) {
      updateUser({ emailVerified: true })
    } else {
      sent.value = true
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 5000 })
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.email-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1.25rem;
  background: rgba(var(--main-color-rgb), 0.1);
  border-bottom: 1px solid rgba(var(--main-color-rgb), 0.3);
  color: var(--text-primary);
  font-size: var(--fs-md);
}

.email-banner > .pi {
  color: var(--main-color);
}

.email-banner p {
  margin: 0;
  flex: 1;
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.resend-btn {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .email-banner {
    padding: 0.6rem 1rem;
    flex-wrap: wrap;
  }
}
</style>

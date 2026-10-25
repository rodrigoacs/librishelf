<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('login.header')"
  >
    <div
      class="header"
      role="status"
    >
      <h1>{{ heading }}</h1>
      <p class="subtitle">{{ message }}</p>
    </div>

    <div
      v-if="state !== 'loading'"
      class="auth-form"
    >
      <template v-if="state === 'done'">
        <AppButton
          :label="t('unsubscribe.undo')"
          icon="pi pi-undo"
          class="btn-outlined btn-secondary w-full"
          :loading="busy"
          @click="undo"
        />
        <AppButton
          :label="t('unsubscribe.settings')"
          class="btn-text w-full"
          @click="router.replace({ name: 'settings', hash: '#settings-notifications' })"
        />
      </template>
      <template v-else-if="state === 'undone'">
        <AppButton
          :label="t('unsubscribe.home')"
          class="btn-primary w-full btn-lg"
          @click="router.replace({ name: 'home' })"
        />
      </template>
      <AppButton
        v-else
        :label="t('unsubscribe.settings')"
        class="btn-primary w-full"
        @click="router.replace({ name: 'settings', hash: '#settings-notifications' })"
      />
    </div>
  </AuthLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'
import { updateUser } from '../services/session.js'

/**
 * Link "Descadastrar com um clique" do e-mail de avisos: descadastra ao abrir
 * (sem login; o token identifica a conta) e oferece desfazer. Os provedores
 * de e-mail usam o mesmo endpoint pelo cabeçalho List-Unsubscribe.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const state = ref('loading') // loading | done | undone | failed
const errorMessage = ref('')
const busy = ref(false)
let token = ''

const heading = computed(() => ({
  loading: t('unsubscribe.loading'),
  done: t('unsubscribe.doneTitle'),
  undone: t('unsubscribe.undoneTitle'),
  failed: t('unsubscribe.failedTitle')
}[state.value]))

const message = computed(() => {
  if (state.value === 'done') return t('unsubscribe.doneText')
  if (state.value === 'undone') return t('unsubscribe.undoneText')
  if (state.value === 'failed') return errorMessage.value || t('unsubscribe.failedText')
  return ''
})

async function undo() {
  busy.value = true
  try {
    await api.resubscribe(token)
    updateUser({ followEmails: true })
    state.value = 'undone'
  } catch (error) {
    errorMessage.value = error.message
    state.value = 'failed'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  token = String(route.query.token || '')
  // Tira o token da barra de endereço/histórico.
  router.replace({ query: {} })

  try {
    await api.unsubscribe(token)
    updateUser({ followEmails: false })
    state.value = 'done'
  } catch (error) {
    errorMessage.value = error.status === 400 ? t('unsubscribe.failedText') : error.message
    state.value = 'failed'
  }
})
</script>

<template>
  <SettingsGroup
    :title="t('settings.groups.security')"
    title-id="settings-group-security"
  >
    <SettingsRow
      :label="t('settings.password.title')"
      :help="t('settings.password.desc')"
      icon="pi pi-lock"
      interactive
      class="row-password"
      @click="sheetOpen = true"
    />

    <template #after>
      <AppDialog
        v-model:visible="sheetOpen"
        size="sm"
        dialog-class="settings-sheet password-sheet"
        :header="t('settings.password.title')"
      >
        <form
          class="sheet-stack"
          novalidate
          @submit.prevent="changePassword"
        >
          <p class="sheet-text">{{ t('settings.password.desc') }}</p>
          <!-- Campo de usuário oculto: gerenciadores de senha associam a nova senha à conta certa. -->
          <input
            type="text"
            :value="user?.name"
            autocomplete="username"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            readonly
          />
          <PasswordField
            id="settings-current-password"
            ref="currentField"
            v-model="form.current"
            :label="t('settings.password.current')"
            autocomplete="current-password"
            :error="errors.current"
          />
          <PasswordField
            id="settings-new-password"
            ref="nextField"
            v-model="form.next"
            :label="t('settings.password.new')"
            autocomplete="new-password"
            strength
            :error="errors.next"
          />
          <PasswordField
            id="settings-confirm-password"
            ref="confirmField"
            v-model="form.confirm"
            :label="t('settings.password.confirm')"
            autocomplete="new-password"
            :error="errors.confirm"
          />
          <AppButton
            type="submit"
            :label="t('settings.password.submit')"
            class="btn-primary sheet-submit"
            :loading="saving"
          />
        </form>
      </AppDialog>
    </template>
  </SettingsGroup>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import PasswordField from '../form/PasswordField.vue'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { currentUser as user, setUser } from '../../services/session.js'
import { isWeakPassword } from '../../utils/password.js'
import { focusFirstError } from '../../utils/formState.js'

const { t } = useI18n()
const toast = useToast()

const sheetOpen = ref(false)

// Erros embaixo de cada campo (como no cadastro), em vez de um aviso solto
// no canto. Erro do servidor vai para o campo a que se refere.
const form = reactive({ current: '', next: '', confirm: '' })
const errors = reactive({ current: '', next: '', confirm: '' })
const saving = ref(false)
const currentField = ref(null)
const nextField = ref(null)
const confirmField = ref(null)
const fields = { current: currentField, next: nextField, confirm: confirmField }

// Digitou de novo no campo: o erro dele some
for (const key of ['current', 'next', 'confirm']) {
  watch(() => form[key], () => { errors[key] = '' })
}

async function changePassword() {
  const required = t('settings.errors.required')
  errors.current = form.current ? '' : required
  errors.next = !form.next
    ? required
    : (isWeakPassword(form.next) ? t('register.passwordTooWeak') : '')
  errors.confirm = !form.confirm
    ? required
    : (form.next !== form.confirm ? t('settings.password.mismatch') : '')

  if (focusFirstError(errors, fields)) return

  saving.value = true
  try {
    const result = await api.changePassword(form.current, form.next)
    setUser(result.user)
    Object.assign(form, { current: '', next: '', confirm: '' })
    sheetOpen.value = false
    toast.add({ severity: 'success', detail: t('settings.password.success'), life: 3000 })
    // Os watchers limpam os erros no próximo tick; o formulário volta vazio e sem erro
  } catch (error) {
    if (error.status === 401) errors.current = error.message
    else if (error.status === 400) errors.next = error.message
    else toast.add({ severity: 'error', detail: error.message, life: 4000 })
    focusFirstError(errors, fields)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Excluir conta: separado, no fim -->
  <SettingsGroup
    :title="t('settings.delete.title')"
    title-id="settings-group-danger"
    hidden-title
  >
    <SettingsRow
      :label="t('settings.delete.button')"
      :help="t('settings.delete.desc')"
      icon="pi pi-trash"
      interactive
      danger
      class="row-delete"
      @click="openDialog"
    />

    <template #after>
      <AppDialog
        v-model:visible="dialogVisible"
        size="sm"
        :header="t('settings.delete.confirmTitle')"
        :closable="!deleting"
      >
        <form
          class="sheet-stack"
          novalidate
          @submit.prevent="deleteAccount"
        >
          <p class="sheet-text">{{ t('settings.delete.confirmMsg') }}</p>
          <PasswordField
            id="settings-delete-password"
            ref="passwordField"
            v-model="password"
            :label="t('settings.delete.password')"
            autocomplete="current-password"
            :error="error"
          />
          <div class="dialog-actions">
            <AppButton
              type="button"
              :label="t('common.cancel')"
              class="btn-text btn-secondary"
              :disabled="deleting"
              @click="dialogVisible = false"
            />
            <AppButton
              type="submit"
              :label="t('settings.delete.confirmButton')"
              icon="pi pi-trash"
              class="btn-danger"
              :loading="deleting"
            />
          </div>
        </form>
      </AppDialog>
    </template>
  </SettingsGroup>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import PasswordField from '../form/PasswordField.vue'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { clearSession } from '../../services/session.js'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const dialogVisible = ref(false)
const password = ref('')
const deleting = ref(false)
const error = ref('')
const passwordField = ref(null)

watch(password, () => { error.value = '' })

function openDialog() {
  password.value = ''
  error.value = ''
  dialogVisible.value = true
}

async function deleteAccount() {
  if (!password.value) {
    error.value = t('settings.errors.required')
    passwordField.value?.focus()
    return
  }

  deleting.value = true
  try {
    await api.deleteAccount(password.value)
    dialogVisible.value = false
    clearSession()
    toast.add({ severity: 'success', detail: t('settings.delete.success'), life: 5000 })
    router.replace({ name: 'login' })
  } catch (err) {
    if (err.status === 401) {
      error.value = err.message
      passwordField.value?.focus()
    } else {
      toast.add({ severity: 'error', detail: err.message, life: 4000 })
    }
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>

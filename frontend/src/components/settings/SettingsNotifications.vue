<template>
  <!-- Avisos por e-mail (opt-in) -->
  <SettingsGroup
    :title="t('settings.notifications.title')"
    title-id="settings-group-notifications"
  >
    <SettingsRow
      :label="t('settings.notifications.follow')"
      :help="emailVerified ? t('settings.notifications.followHelp', { hours: 6, email: user?.email || '' }) : t('settings.notifications.verifyFirst')"
      label-for="settings-follow-emails"
      help-id="settings-follow-emails-help"
    >
      <template #trailing>
        <AppSwitch
          inputId="settings-follow-emails"
          :modelValue="followEmails"
          :disabled="saving || (!emailVerified && !followEmails)"
          aria-describedby="settings-follow-emails-help"
          @update:modelValue="saveFollowEmails"
        />
      </template>
    </SettingsRow>
  </SettingsGroup>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { currentUser as user, isEmailVerified as emailVerified, updateUser } from '../../services/session.js'

const { t, locale } = useI18n()
const toast = useToast()

const followEmails = computed(() => Boolean(user.value?.followEmails))
const saving = ref(false)

// Os avisos vão no idioma atual do app
async function saveFollowEmails(value) {
  saving.value = true
  try {
    const result = await api.setNotifications({ followEmails: value, locale: locale.value === 'en' ? 'en' : 'pt' })
    updateUser({ followEmails: result.followEmails })
    toast.add({ severity: 'success', detail: result.followEmails ? t('settings.notifications.on') : t('settings.notifications.off'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    saving.value = false
  }
}
</script>

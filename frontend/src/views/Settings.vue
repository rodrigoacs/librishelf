<template>
  <!-- Conta: cada grupo é um componente em components/settings/, com as
       próprias folhas. A ordem aqui é a ordem na tela. -->
  <div class="page settings-container">
    <PageHeader :title="t('settings.title')" />
    <div class="settings-content">
      <SettingsAccount />
      <SettingsProfilePage />
      <SettingsPlan />
      <SettingsPersonalization />
      <SettingsBackup />
      <SettingsPrivacy />
      <SettingsNotifications />
      <SettingsSecurity />
      <SettingsData />
      <SettingsDeleteAccount />
      <LegalLinks class="legal-links-row" />
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import LegalLinks from '../components/legal/LegalLinks.vue'
import SettingsAccount from '../components/settings/SettingsAccount.vue'
import SettingsProfilePage from '../components/settings/SettingsProfilePage.vue'
import SettingsPlan from '../components/settings/SettingsPlan.vue'
import SettingsPersonalization from '../components/settings/SettingsPersonalization.vue'
import SettingsBackup from '../components/settings/SettingsBackup.vue'
import SettingsPrivacy from '../components/settings/SettingsPrivacy.vue'
import SettingsNotifications from '../components/settings/SettingsNotifications.vue'
import SettingsSecurity from '../components/settings/SettingsSecurity.vue'
import SettingsData from '../components/settings/SettingsData.vue'
import SettingsDeleteAccount from '../components/settings/SettingsDeleteAccount.vue'

const { t } = useI18n()
</script>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* Termos de uso · Privacidade, no fim da Conta */
.legal-links-row {
  min-height: 44px;
  padding: 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

@media (max-width: 639.98px) {
  .settings-content {
    gap: var(--space-4);
  }
}
</style>

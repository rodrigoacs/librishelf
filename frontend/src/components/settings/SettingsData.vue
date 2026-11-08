<template>
  <!-- Seus dados: exportar aqui; importar abre a tela /import -->
  <SettingsGroup
    :title="t('settings.data.title')"
    title-id="settings-group-data"
  >
    <SettingsRow
      :label="t('settings.data.exportJson')"
      :help="t('settings.data.exportJsonHelp')"
      icon="pi pi-download"
      trail-icon=""
      interactive
      :loading="exporting === 'json'"
      :disabled="Boolean(exporting)"
      class="row-export-json"
      @click="downloadExport('json')"
    />
    <SettingsRow
      :label="t('settings.data.exportCsv')"
      :help="t('settings.data.exportCsvHelp')"
      icon="pi pi-file"
      trail-icon=""
      interactive
      :loading="exporting === 'csv'"
      :disabled="Boolean(exporting)"
      class="row-export-csv"
      @click="downloadExport('csv')"
    />
    <SettingsRow
      :label="t('settings.data.importTitle')"
      :help="t('settings.data.importShort')"
      icon="pi pi-upload"
      interactive
      class="row-import"
      @click="router.push({ name: 'import' })"
    />
  </SettingsGroup>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const exporting = ref(null)

async function downloadExport(format) {
  exporting.value = format
  try {
    const { blob, filename } = await api.exportData(format)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    exporting.value = null
  }
}
</script>

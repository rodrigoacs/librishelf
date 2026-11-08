<template>
  <!-- Backup automático (Pro: auto_backup). Linhas como o resto da Conta:
       interruptor na linha, frequência e lista em folhas. Sem Pro, os backups
       que existem continuam para baixar e excluir; ligar e pedir são do Pro. -->
  <SettingsGroup
    :title="t('backup.title')"
    title-id="settings-group-backup"
    anchor="settings-backup"
  >
    <p
      v-if="loading && !data"
      class="row-status"
      role="status"
    >{{ t('common.loading') }}</p>
    <p
      v-else-if="loadError"
      class="row-status"
    >{{ loadError }}</p>

    <template v-else-if="data">
      <SettingsRow
        :label="t('backup.enabled')"
        :help="enabledHelp"
        label-for="backup-enabled"
        help-id="backup-enabled-help"
      >
        <template #trailing>
          <AppSwitch
            inputId="backup-enabled"
            :modelValue="data.settings.enabled"
            :disabled="!pro || busy"
            aria-describedby="backup-enabled-help"
            @update:modelValue="value => save({ enabled: value })"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        v-if="data.settings.enabled"
        :label="t('backup.frequency')"
        :value="t(`backup.frequencies.${data.settings.frequency}`)"
        interactive
        :disabled="!pro"
        @click="sheet = 'frequency'"
      />
      <SettingsRow
        v-if="data.settings.enabled"
        :label="t('backup.notify')"
        label-for="backup-notify"
      >
        <template #trailing>
          <AppSwitch
            inputId="backup-notify"
            :modelValue="data.settings.notify"
            :disabled="!pro || busy"
            @update:modelValue="value => save({ notify: value })"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        :label="t('backup.list')"
        :value="data.backups.length ? String(data.backups.length) : t('backup.none')"
        interactive
        @click="sheet = 'list'"
      />
    </template>

    <template #after>
      <!-- Frequência -->
      <AppDialog
        :visible="sheet === 'frequency'"
        size="sm"
        dialog-class="settings-sheet"
        :header="t('backup.frequency')"
        @update:visible="value => { if (!value) sheet = '' }"
      >
        <div
          v-if="data"
          class="choice-list"
          role="radiogroup"
          :aria-label="t('backup.frequency')"
        >
          <button
            v-for="option in frequencyOptions"
            :key="option.value"
            type="button"
            role="radio"
            class="choice"
            :aria-checked="data.settings.frequency === option.value"
            :disabled="!pro || busy"
            @click="pickFrequency(option.value)"
          >
            <span>{{ option.label }}</span>
            <i
              v-if="data.settings.frequency === option.value"
              class="pi pi-check"
              aria-hidden="true"
            ></i>
          </button>
        </div>
      </AppDialog>

      <!-- Backups guardados -->
      <AppDialog
        :visible="sheet === 'list'"
        size="sm"
        dialog-class="settings-sheet"
        :header="t('backup.list')"
        @update:visible="value => { if (!value) sheet = '' }"
      >
        <div
          v-if="data"
          class="sheet-stack"
        >
          <p class="sheet-help">{{ t('backup.help', { n: data.keep }) }}</p>
          <AppButton
            v-if="pro"
            :label="t('backup.runNow')"
            icon="pi pi-download"
            class="btn-secondary"
            :loading="busy"
            @click="runNow"
          />
          <p
            v-if="!data.backups.length"
            class="sheet-help"
          >{{ t('backup.empty') }}</p>
          <ul
            v-else
            class="backup-list"
          >
            <li
              v-for="backup in data.backups"
              :key="backup.id"
            >
              <span class="backup-when">
                {{ when(backup.createdAt) }}
                <span class="backup-meta">{{ t(`backup.trigger.${backup.trigger}`) }} · {{ t('backup.books', { n: backup.books }, backup.books) }} · {{ size(backup.bytes) }}</span>
              </span>
              <span class="backup-actions">
                <a
                  :href="`${API_URL}/backups/${backup.id}/download`"
                  class="btn btn-sm btn-text"
                  download
                >{{ t('backup.download') }}</a>
                <AppButton
                  :label="t('backup.remove')"
                  class="btn-sm btn-text btn-danger"
                  :disabled="busy"
                  @click="remove(backup)"
                />
              </span>
            </li>
          </ul>
        </div>
      </AppDialog>
    </template>
  </SettingsGroup>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { usePlan } from '../../services/plan.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { API_URL } from '../../config/site.js'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsGroup from './SettingsGroup.vue'

const { t, locale } = useI18n()
const { canUse } = usePlan()
const toast = useToast()
const confirm = useConfirm()

const pro = computed(() => canUse('auto_backup'))
const data = ref(null)
const loading = ref(false)
const loadError = ref('')
const busy = ref(false)
const sheet = ref('')

const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const when = value => new Date(value).toLocaleString(dateLocale.value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const size = bytes => (bytes < 1024 * 1024
  ? t('backup.kb', { n: Math.max(1, Math.round(bytes / 1024)) })
  : t('backup.mb', { n: new Intl.NumberFormat(dateLocale.value, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) }))

const frequencyOptions = computed(() =>
  ['weekly', 'monthly'].map(value => ({ value, label: t(`backup.frequencies.${value}`) })))

// Linha do interruptor: quando é o próximo, ou para que serve
const enabledHelp = computed(() => {
  const settings = data.value?.settings
  if (settings?.enabled && settings.nextRunAt) return t('backup.next', { date: when(settings.nextRunAt) })
  return t('backup.short')
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    data.value = await api.getBackups()
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function run(task, done) {
  busy.value = true
  try {
    const result = await task()
    if (result?.settings) data.value = result
    else await load()
    if (done) toast.add({ severity: 'success', detail: t(done) })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = false
  }
}

const save = changes => run(() => api.saveBackupSettings(changes))

async function pickFrequency(value) {
  if (data.value?.settings.frequency !== value) await save({ frequency: value })
  sheet.value = ''
}
const runNow = () => run(() => api.requestBackup(), 'backup.queued')

function remove(backup) {
  confirm.require({
    header: t('backup.removeTitle'),
    message: t('backup.removeMessage'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('backup.remove'),
    rejectLabel: t('common.cancel'),
    accept: () => run(() => api.deleteBackup(backup.id))
  })
}

onMounted(load)
</script>

<style scoped>
.row-status {
  margin: 0;
  padding: var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

/* Folhas */
.choice-list {
  display: flex;
  flex-direction: column;
}

.choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 3rem;
  padding: var(--space-2) 0;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}

.choice:last-child {
  border-bottom: none;
}

.choice .pi {
  color: var(--main-color);
}

.choice:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.choice:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.backup-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.backup-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--border-color);
}

.backup-when {
  display: flex;
  flex: 1 1 12rem;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.backup-meta {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-weight: 400;
}

.backup-actions {
  display: flex;
  gap: var(--space-1);
}
</style>

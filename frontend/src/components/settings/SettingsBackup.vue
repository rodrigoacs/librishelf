<template>
  <!-- Backup automático (Pro: auto_backup, pacote 30). Sem Pro, os backups
       que existem continuam para baixar; ligar, pedir e excluir são do Pro. -->
  <section
    id="settings-backup"
    class="settings-group"
    aria-labelledby="settings-group-backup"
    tabindex="-1"
  >
    <h2
      id="settings-group-backup"
      class="section-title group-title"
    >{{ t('backup.title') }}</h2>

    <ProNotice
      v-if="plan && !pro"
      feature="auto_backup"
      :readonly="Boolean(data?.backups.length)"
      compact
    />

    <div class="group-panel">
      <p
        v-if="loading && !data"
        class="muted"
      >{{ t('common.loading') }}</p>
      <p
        v-else-if="loadError"
        class="muted"
      >{{ loadError }}</p>

      <template v-else-if="data">
        <div class="switch-row">
          <AppSwitch
            inputId="backup-enabled"
            :modelValue="data.settings.enabled"
            :disabled="!pro || busy"
            @update:modelValue="value => save({ enabled: value })"
          />
          <label
            for="backup-enabled"
            class="switch-label"
          >{{ t('backup.enabled') }}</label>
        </div>
        <p class="muted">{{ t('backup.help', { n: data.keep }) }}</p>

        <div
          v-if="data.settings.enabled"
          class="options"
        >
          <div class="field">
            <span
              id="backup-frequency"
              class="field-label"
            >{{ t('backup.frequency') }}</span>
            <AppSelect
              :modelValue="data.settings.frequency"
              :options="frequencyOptions"
              ariaLabelledby="backup-frequency"
              :disabled="!pro || busy"
              @update:modelValue="value => save({ frequency: value })"
            />
          </div>
          <div class="switch-row">
            <AppSwitch
              inputId="backup-notify"
              :modelValue="data.settings.notify"
              :disabled="!pro || busy"
              @update:modelValue="value => save({ notify: value })"
            />
            <label
              for="backup-notify"
              class="switch-label"
            >{{ t('backup.notify') }}</label>
          </div>
          <p
            v-if="data.settings.nextRunAt"
            class="muted"
          >{{ t('backup.next', { date: when(data.settings.nextRunAt) }) }}</p>
        </div>

        <div class="actions">
          <AppButton
            v-if="pro"
            :label="t('backup.runNow')"
            icon="pi pi-download"
            class="btn-sm btn-secondary"
            :loading="busy"
            @click="runNow"
          />
        </div>

        <div class="list-block">
          <h3 class="field-label">{{ t('backup.list') }}</h3>
          <p
            v-if="!data.backups.length"
            class="muted"
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
                <span class="muted">{{ t(`backup.trigger.${backup.trigger}`) }} · {{ t('backup.books', { n: backup.books }, backup.books) }} · {{ size(backup.bytes) }}</span>
              </span>
              <a
                :href="`${API_URL}/backups/${backup.id}/download`"
                class="link-button"
                download
              >{{ t('backup.download') }}</a>
              <button
                v-if="pro"
                type="button"
                class="link-button danger"
                :disabled="busy"
                @click="remove(backup)"
              >{{ t('backup.remove') }}</button>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
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
import AppSelect from '../ui/AppSelect.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import ProNotice from '../ProNotice.vue'

const { t, locale } = useI18n()
const { plan, canUse } = usePlan()
const toast = useToast()
const confirm = useConfirm()

const pro = computed(() => canUse('auto_backup'))
const data = ref(null)
const loading = ref(false)
const loadError = ref('')
const busy = ref(false)

const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const when = value => new Date(value).toLocaleString(dateLocale.value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const size = bytes => (bytes < 1024 * 1024
  ? t('backup.kb', { n: Math.max(1, Math.round(bytes / 1024)) })
  : t('backup.mb', { n: new Intl.NumberFormat(dateLocale.value, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) }))

const frequencyOptions = computed(() =>
  ['weekly', 'monthly'].map(value => ({ value, label: t(`backup.frequencies.${value}`) })))

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
.settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings-group:focus {
  outline: none;
}

.group-title {
  margin: 0;
  padding: 0 var(--space-4);
}

.group-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.switch-label {
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-left: var(--space-3);
  border-left: 2px solid var(--border-color);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-width: 16rem;
}

.field-label {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  line-height: 1.45;
}

.actions {
  display: flex;
}

.list-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}

.backup-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.backup-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-4);
  font-size: var(--fs-sm);
}

.backup-when {
  display: flex;
  flex: 1 1 14rem;
  flex-direction: column;
  color: var(--text-primary);
}

.link-button {
  padding: var(--space-1) 0;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.link-button.danger {
  color: var(--red);
}

.link-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
</style>

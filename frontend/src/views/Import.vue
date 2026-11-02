<template>
  <div class="page import-container">
    <PageHeader
      :title="t('settings.data.importTitle')"
      back="/settings"
      :back-label="t('settings.title')"
    />

    <p
      v-if="step === 'loading'"
      class="muted"
      role="status"
    >{{ t('common.loading') }}</p>

    <!-- 1. Arquivo -->
    <section
      v-else-if="step === 'pick'"
      class="card"
      aria-labelledby="import-pick-title"
    >
      <h2
        id="import-pick-title"
        class="section-title"
      >{{ t('import.fromGoodreads') }}</h2>
      <p class="text">{{ t('settings.data.importDesc') }}</p>
      <ol class="steps">
        <li>{{ t('settings.data.step1') }}</li>
        <li>{{ t('settings.data.step2') }}</li>
        <li>{{ t('settings.data.step3') }}</li>
      </ol>
      <p class="text">{{ t('import.otherCsv') }}</p>
      <router-link
        :to="{ name: 'import-skoob' }"
        class="link"
      >{{ t('import.skoobLink') }}</router-link>

      <label
        class="file-drop"
        :class="{ busy: uploading }"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="sr-only"
          :disabled="uploading"
          @change="upload"
        />
        <i
          :class="uploading ? 'pi pi-spin pi-spinner' : 'pi pi-upload'"
          aria-hidden="true"
        ></i>
        <span>{{ uploading ? t('import.reading') : t('settings.data.chooseFile') }}</span>
      </label>
    </section>

    <!-- 2. Prévia e mapeamento -->
    <template v-else-if="step === 'preview' && current">
      <section
        class="card"
        aria-labelledby="import-preview-title"
      >
        <h2
          id="import-preview-title"
          class="section-title"
        >{{ t('import.previewTitle') }}</h2>
        <p class="file-line">
          <i
            class="pi pi-file"
            aria-hidden="true"
          ></i>
          <span>{{ current.filename || t('import.noName') }}</span>
          <span class="muted">· {{ t(`import.formats.${current.format}`) }}</span>
        </p>

        <p
          v-if="preview.needsMapping"
          class="notice"
        >{{ t('import.needsMapping') }}</p>
        <dl
          v-else
          class="counts"
        >
          <div>
            <dt>{{ t('import.counts.total') }}</dt>
            <dd>{{ preview.total }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.duplicates') }}</dt>
            <dd>{{ preview.duplicates }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.withoutIsbn') }}</dt>
            <dd>{{ preview.withoutIsbn }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.want') }}</dt>
            <dd>{{ preview.want }}</dd>
          </div>
        </dl>
        <p
          v-if="!preview.needsMapping && (preview.untitled || preview.rereads)"
          class="muted small"
        >
          <template v-if="preview.untitled">{{ t('import.untitled', { n: preview.untitled }, preview.untitled) }} </template>
          <template v-if="preview.rereads">{{ t('import.rereadsNote', { n: preview.rereads }, preview.rereads) }}</template>
        </p>
        <p
          v-if="!preview.needsMapping"
          class="muted small"
        >{{ t('import.duplicatesHint') }}</p>
      </section>

      <section
        v-if="current.format === 'generic'"
        class="card"
        aria-labelledby="import-mapping-title"
      >
        <h2
          id="import-mapping-title"
          class="section-title"
        >{{ t('import.mappingTitle') }}</h2>
        <p class="text">{{ t('import.mappingHint') }}</p>
        <div class="mapping">
          <div
            v-for="field in FIELDS"
            :key="field"
            class="mapping-row"
          >
            <span
              :id="`import-field-${field}`"
              class="mapping-label"
            >{{ t(`import.fields.${field}`) }}<span
              v-if="field === 'title'"
              class="required"
            > *</span></span>
            <AppSelect
              v-model="mapping[field]"
              :options="columnOptions"
              :aria-labelledby="`import-field-${field}`"
            />
          </div>
        </div>
        <AppButton
          :label="t('import.refresh')"
          icon="pi pi-refresh"
          class="btn-outlined btn-sm"
          :loading="refreshing"
          @click="refreshPreview"
        />
      </section>

      <section
        v-if="preview.sample?.length"
        class="card"
        aria-labelledby="import-sample-title"
      >
        <h2
          id="import-sample-title"
          class="section-title"
        >{{ t('import.sampleTitle') }}</h2>
        <ul class="sample">
          <li
            v-for="(item, index) in preview.sample"
            :key="index"
          >
            <span class="strong">{{ item.title }}</span>
            <span class="muted small">
              {{ item.authors.join(', ') || t('import.noAuthor') }}
              · {{ t(`import.statuses.${item.status}`) }}
              <template v-if="item.rating"> · {{ '★'.repeat(item.rating) }}</template>
              <template v-if="item.isbn"> · {{ item.isbn }}</template>
            </span>
          </li>
        </ul>
      </section>

      <section class="card">
        <label class="switch-row">
          <span class="switch-text">
            <span class="strong">{{ t('import.includeWant') }}</span>
            <span class="muted small">{{ t('import.includeWantHint', { n: preview.want ?? 0 }, preview.want ?? 0) }}</span>
          </span>
          <AppSwitch
            v-model="includeWant"
            input-id="import-include-want"
          />
        </label>
      </section>

      <div class="actions">
        <AppButton
          :label="t('import.otherFile')"
          class="btn-text btn-secondary"
          :disabled="starting"
          @click="discard"
        />
        <AppButton
          :label="t('import.start', { n: booksToImport }, booksToImport)"
          icon="pi pi-download"
          :disabled="preview.needsMapping || booksToImport === 0"
          :loading="starting"
          @click="start"
        />
      </div>
    </template>

    <!-- 3. Andando -->
    <section
      v-else-if="step === 'running' && current"
      class="card"
      aria-labelledby="import-running-title"
    >
      <h2
        id="import-running-title"
        class="section-title"
      >{{ t('settings.data.importing') }}</h2>
      <div
        class="bar"
        role="progressbar"
        :aria-valuenow="current.processed"
        aria-valuemin="0"
        :aria-valuemax="current.total"
        :aria-label="t('settings.data.importing')"
      ><span :style="{ width: `${percent(current.processed, current.total)}%` }"></span></div>
      <p class="text">{{ t('import.progress', { done: current.processed, total: current.total }) }}</p>
      <p class="muted small">{{ t('import.canLeave') }}</p>
    </section>

    <!-- 4. Relatório -->
    <template v-else-if="step === 'done' && current">
      <section
        class="card"
        aria-labelledby="import-report-title"
      >
        <h2
          id="import-report-title"
          class="section-title"
        >{{ current.status === 'failed' ? t('import.failedTitle') : t('import.reportTitle') }}</h2>
        <dl class="counts">
          <div>
            <dt>{{ t('import.counts.imported') }}</dt>
            <dd>{{ current.imported }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.duplicates') }}</dt>
            <dd>{{ current.duplicates }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.skippedWant') }}</dt>
            <dd>{{ current.skippedWant }}</dd>
          </div>
          <div>
            <dt>{{ t('import.counts.failed') }}</dt>
            <dd :class="{ warn: current.failed }">{{ current.failed }}</dd>
          </div>
        </dl>
        <p
          v-if="current.rereadsWithoutDate"
          class="muted small"
        >{{ t('import.rereadsDone', { n: current.rereadsWithoutDate }, current.rereadsWithoutDate) }}</p>

        <template v-if="current.covers.total">
          <p class="text covers">
            <template v-if="current.covers.done < current.covers.total">
              <i
                class="pi pi-spin pi-spinner"
                aria-hidden="true"
              ></i>
              {{ t('import.coversRunning', { done: current.covers.done, total: current.covers.total }) }}
            </template>
            <template v-else>{{ t('import.coversDone', { found: current.covers.found, total: current.covers.total }) }}</template>
          </p>
        </template>

        <div class="actions start">
          <router-link
            v-if="current.imported"
            :to="{ name: 'library' }"
            class="link"
          >{{ t('settings.data.seeLibrary') }}</router-link>
          <AppButton
            :label="t('import.another')"
            class="btn-outlined btn-sm"
            @click="reset"
          />
        </div>
      </section>

      <section
        v-if="current.errors.length"
        class="card"
        aria-labelledby="import-errors-title"
      >
        <h2
          id="import-errors-title"
          class="section-title"
        >{{ t('import.errorsTitle') }}</h2>
        <ul class="errors">
          <li
            v-for="(error, index) in current.errors"
            :key="index"
          >
            <span class="strong">{{ error.line ? t('settings.data.errorLine', { line: error.line, title: error.title || '—' }) : t('import.fileError') }}</span>
            <span class="muted small">{{ reason(error) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import api from '../services/api.js'
import { translateApiError } from '../services/fetchClient.js'
import { useToast } from '../services/toast.js'

/**
 * Importação em etapas: arquivo → prévia (e colunas, no CSV genérico) →
 * importar → relatório. A importação roda no servidor; dá para sair da tela
 * e voltar, que ela aparece de novo aqui.
 */
const { t } = useI18n()
const toast = useToast()

const FIELDS = ['title', 'authors', 'isbn', 'publisher', 'status', 'rating', 'readDate', 'startedAt', 'pubDate', 'pages', 'tags', 'notes', 'series', 'seriesIndex']
const RUNNING_POLL_MS = 1500
const COVERS_POLL_MS = 5000

const step = ref('loading')
const current = ref(null)
const preview = ref({})
const mapping = reactive({})
const includeWant = ref(false)
const uploading = ref(false)
const refreshing = ref(false)
const starting = ref(false)
const fileInput = ref(null)
let timer = null

const columnOptions = computed(() => [
  { value: '', label: t('import.skipColumn') },
  ...(current.value?.headers || []).map(name => ({ value: name, label: name }))
])

const booksToImport = computed(() => {
  const p = preview.value
  if (!p || p.needsMapping) return 0
  return Math.max(0, p.total - (p.untitled || 0) - (includeWant.value ? 0 : p.want || 0))
})

const percent = (done, total) => (total ? Math.min(100, Math.round((done / total) * 100)) : 0)

function reason(error) {
  return translateApiError(error.code, error.params, error.reason)
}

function setMapping(source) {
  for (const field of FIELDS) mapping[field] = source?.[field] || ''
}

function show(data) {
  current.value = data.import
  if (data.preview) preview.value = data.preview
  if (data.import.format === 'generic' && data.import.status === 'draft') setMapping(data.import.mapping || data.import.suggestedMapping)
  const status = data.import.status
  step.value = status === 'draft' ? 'preview' : ['queued', 'running'].includes(status) ? 'running' : 'done'
  schedule()
}

function schedule() {
  clearTimeout(timer)
  const item = current.value
  if (!item) return
  if (step.value === 'running') timer = setTimeout(poll, RUNNING_POLL_MS)
  else if (step.value === 'done' && item.covers.done < item.covers.total) timer = setTimeout(poll, COVERS_POLL_MS)
}

async function poll() {
  try {
    show(await api.importStatus(current.value.id))
  } catch {
    // Sem rede por um instante: tenta de novo no próximo ciclo
    schedule()
  }
}

async function upload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  uploading.value = true
  includeWant.value = false
  try {
    show(await api.importCreate(file))
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const chosenMapping = () => Object.fromEntries(Object.entries(mapping).filter(([, column]) => column))

async function refreshPreview() {
  refreshing.value = true
  try {
    const data = await api.importPreview(current.value.id, chosenMapping())
    current.value = data.import
    preview.value = data.preview
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    refreshing.value = false
  }
}

async function start() {
  starting.value = true
  try {
    const body = { includeWant: includeWant.value }
    if (current.value.format === 'generic') body.mapping = chosenMapping()
    show(await api.importStart(current.value.id, body))
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    starting.value = false
  }
}

async function discard() {
  const id = current.value?.id
  reset()
  if (id) await api.importDelete(id).catch(() => { })
}

function reset() {
  clearTimeout(timer)
  current.value = null
  preview.value = {}
  step.value = 'pick'
}

onMounted(async () => {
  try {
    const { imports } = await api.importList()
    const active = imports.find(item => ['queued', 'running'].includes(item.status))
    if (active) {
      show({ import: active })
      return
    }
  } catch {
    // Sem a lista, começa do arquivo
  }
  step.value = 'pick'
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.import-container {
  --page-max: 760px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.section-title {
  margin: 0;
}

.text {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.55;
}

.muted {
  margin: 0;
  color: var(--text-secondary);
}

.small {
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.strong {
  font-weight: 600;
  color: var(--text-primary);
}

.steps {
  margin: 0;
  padding-left: var(--space-5);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.6;
}

.link {
  align-self: flex-start;
  color: var(--main-color);
  font-weight: 600;
  font-size: var(--fs-sm);
}

.file-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 56px;
  padding: var(--space-4);
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-weight: 600;
  cursor: pointer;
}

.file-drop:hover,
.file-drop:focus-within {
  border-color: var(--main-color);
  color: var(--text-primary);
}

.file-drop.busy {
  cursor: progress;
}

.file-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.notice {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.counts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

@media (min-width: 640px) {
  .counts {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.counts dt {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.counts dd {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.counts dd.warn {
  color: var(--orange);
}

.mapping {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mapping-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  align-items: center;
  gap: var(--space-3);
}

.mapping-label {
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.required {
  color: var(--red);
}

.sample,
.errors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.sample li,
.errors li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: var(--space-2) 0;
  font-size: var(--fs-sm);
}

.sample li + li,
.errors li + li {
  border-top: 1px solid var(--border-color);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  cursor: pointer;
}

.switch-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--fs-sm);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
}

.actions.start {
  justify-content: flex-start;
  gap: var(--space-5);
}

.bar {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: var(--main-color);
  transition: width 0.3s ease;
}

.covers {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>

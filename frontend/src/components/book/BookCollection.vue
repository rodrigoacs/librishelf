<template>
  <!-- Coleção do livro (pacote 28): empréstimo (grátis) e exemplar (Pro). -->
  <section
    class="collection-section"
    aria-labelledby="collection-title"
  >
    <h3
      id="collection-title"
      class="section-title"
    >{{ t('collection.title') }}</h3>

    <p
      v-if="loading && !data"
      class="muted-line"
    >{{ t('common.loading') }}</p>
    <p
      v-else-if="loadError"
      class="muted-line"
    >{{ loadError }}</p>

    <template v-else-if="data">
      <!-- Empréstimo -->
      <div class="block">
        <h4 class="block-title">{{ t('collection.loan.title') }}</h4>

        <div
          v-if="data.loan && !editingLoan"
          class="loan-card"
          :class="{ overdue: isOverdue(data.loan) }"
        >
          <p class="loan-who">{{ t('collection.loan.with', { name: data.loan.borrower }) }}</p>
          <p class="loan-dates">
            {{ t('collection.loan.since', { date: longDate(data.loan.lentOn) }) }}
            <template v-if="data.loan.dueOn"> · {{ t(isOverdue(data.loan) ? 'collection.loan.overdue' : 'collection.loan.due', { date: longDate(data.loan.dueOn) }) }}</template>
          </p>
          <p
            v-if="data.loan.notes"
            class="loan-notes"
          >{{ data.loan.notes }}</p>

          <div
            v-if="data.loan.dueOn"
            class="reminder-row"
          >
            <AppSwitch
              :modelValue="data.loan.remind"
              inputId="loan-remind"
              :disabled="!canUse('collector') || saving"
              @update:modelValue="toggleReminder"
            />
            <label
              for="loan-remind"
              class="reminder-label"
            >{{ t('collection.loan.remind') }}</label>
          </div>
          <p
            v-if="data.loan.dueOn && !canUse('collector')"
            class="pro-hint"
          >
            {{ t('collection.loan.remindPro') }}
            <router-link :to="{ name: 'pricing', query: { feature: 'collector' } }">{{ t('pro.notice.plans') }}</router-link>
          </p>

          <div class="actions">
            <AppButton
              :label="t('collection.loan.markReturned')"
              class="btn-sm"
              :loading="saving"
              @click="markReturned"
            />
            <button
              type="button"
              class="link-button"
              @click="startEdit(data.loan)"
            >{{ t('collection.loan.edit') }}</button>
          </div>
        </div>

        <form
          v-else-if="editingLoan"
          class="loan-form"
          @submit.prevent="saveLoan"
        >
          <TextField
            id="loan-borrower"
            v-model="draft.borrower"
            :label="t('collection.loan.borrower')"
            maxlength="120"
            required
          />
          <div class="two">
            <DateField
              id="loan-lent"
              v-model="draft.lentOn"
              :label="t('collection.loan.lentOn')"
            />
            <DateField
              id="loan-due"
              v-model="draft.dueOn"
              :label="t('collection.loan.dueOn')"
              :minDate="draft.lentOn"
            />
          </div>
          <TextField
            id="loan-notes"
            v-model="draft.notes"
            :label="t('collection.loan.notes')"
            maxlength="500"
            multiline
            rows="2"
          />
          <div class="actions">
            <AppButton
              type="submit"
              :label="t('collection.save')"
              class="btn-sm"
              :loading="saving"
              :disabled="!draft.borrower.trim()"
            />
            <button
              type="button"
              class="link-button"
              @click="editingLoan = false"
            >{{ t('common.cancel') }}</button>
            <button
              v-if="draft.id"
              type="button"
              class="link-button danger"
              @click="removeLoan(draft.id)"
            >{{ t('collection.loan.remove') }}</button>
          </div>
        </form>

        <div
          v-else
          class="actions"
        >
          <p class="muted-line">{{ t('collection.loan.none') }}</p>
          <AppButton
            :label="t('collection.loan.lend')"
            icon="pi pi-arrow-up-right"
            class="btn-sm"
            @click="startEdit(null)"
          />
        </div>

        <details
          v-if="data.history.length"
          class="history"
        >
          <summary>{{ t('collection.loan.history', { n: data.history.length }, data.history.length) }}</summary>
          <ul>
            <li
              v-for="loan in data.history"
              :key="loan.id"
            >
              <span>{{ loan.borrower }}</span>
              <span class="muted">{{ shortDate(loan.lentOn) }} – {{ shortDate(loan.returnedOn) }}</span>
            </li>
          </ul>
        </details>
      </div>

      <!-- Exemplar (Pro) -->
      <div class="block">
        <h4 class="block-title">{{ t('collection.copy.title') }}</h4>

        <ProNotice
          v-if="!canUse('collector')"
          feature="collector"
          :readonly="hasCopyData"
          compact
        />

        <dl
          v-if="!canUse('collector') && hasCopyData"
          class="copy-read"
        >
          <div v-if="data.copy.location">
            <dt>{{ t('collection.copy.location') }}</dt>
            <dd>{{ data.copy.location }}</dd>
          </div>
          <div v-if="data.copy.priceCents !== null">
            <dt>{{ t('collection.copy.price') }}</dt>
            <dd>{{ money(data.copy.priceCents) }}</dd>
          </div>
          <div v-if="data.copy.valueCents !== null">
            <dt>{{ t('collection.copy.value') }}</dt>
            <dd>{{ money(data.copy.valueCents) }}</dd>
          </div>
          <div v-if="data.copy.acquiredOn">
            <dt>{{ t('collection.copy.acquiredOn') }}</dt>
            <dd>{{ longDate(data.copy.acquiredOn) }}</dd>
          </div>
        </dl>

        <form
          v-if="canUse('collector')"
          class="copy-form"
          @submit.prevent="saveCopy"
        >
          <TextField
            id="copy-location"
            v-model="copyDraft.location"
            :label="t('collection.copy.location')"
            :hint="t('collection.copy.locationHint')"
            maxlength="200"
          />
          <div class="two">
            <TextField
              id="copy-price"
              v-model="copyDraft.price"
              :label="t('collection.copy.price')"
              inputmode="decimal"
              :error="priceError"
            />
            <TextField
              id="copy-value"
              v-model="copyDraft.value"
              :label="t('collection.copy.value')"
              :hint="t('collection.copy.valueHint')"
              inputmode="decimal"
              :error="valueError"
            />
          </div>
          <DateField
            id="copy-acquired"
            v-model="copyDraft.acquiredOn"
            :label="t('collection.copy.acquiredOn')"
          />
          <div class="actions">
            <AppButton
              type="submit"
              :label="t('collection.save')"
              class="btn-sm"
              :loading="saving"
              :disabled="Boolean(priceError || valueError) || !copyDirty"
            />
          </div>
        </form>

        <!-- Fotos do exemplar -->
        <div
          v-if="data.photos.length || canUse('collector')"
          class="photos"
        >
          <div class="photos-head">
            <span class="block-title">{{ t('collection.photos.title') }}</span>
            <span class="muted">{{ t('collection.photos.quota', { used: data.quota.used, max: data.quota.max }) }}</span>
          </div>
          <ul
            v-if="data.photos.length"
            class="photo-grid"
          >
            <li
              v-for="photo in data.photos"
              :key="photo.id"
            >
              <a
                :href="`${API_URL}${photo.url}?size=lg`"
                target="_blank"
                rel="noopener"
              >
                <img
                  :src="`${API_URL}${photo.url}?size=sm`"
                  :alt="t('collection.photos.alt', { title: bookTitle })"
                  loading="lazy"
                >
              </a>
              <button
                type="button"
                class="photo-remove"
                :aria-label="t('collection.photos.remove')"
                @click="removePhoto(photo)"
              >
                <i
                  class="pi pi-times"
                  aria-hidden="true"
                ></i>
              </button>
            </li>
          </ul>
          <template v-if="canUse('collector')">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="sr-only"
              :aria-label="t('collection.photos.add')"
              @change="addPhoto"
            >
            <AppButton
              :label="t('collection.photos.add')"
              icon="pi pi-camera"
              class="btn-sm btn-secondary"
              :loading="uploading"
              :disabled="photosFull"
              @click="fileInput?.click()"
            />
            <p
              v-if="photosFull"
              class="muted-line"
            >{{ data.quota.used >= data.quota.max ? t('collection.photos.accountFull', { max: data.quota.max }) : t('collection.photos.bookFull', { max: data.quota.perBook }) }}</p>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { usePlan } from '../../services/plan.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { API_URL } from '../../config/site.js'
import AppButton from '../ui/AppButton.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import TextField from '../form/TextField.vue'
import DateField from '../form/DateField.vue'
import ProNotice from '../ProNotice.vue'
import { isoDate, fromIso } from '../../utils/statPeriods.js'
import { parseCents, centsToInput, formatMoney } from '../../utils/money.js'

const props = defineProps({
  bookId: { type: Number, required: true },
  bookTitle: { type: String, default: '' }
})

const { t, locale } = useI18n()
const { canUse } = usePlan()
const toast = useToast()
const confirm = useConfirm()

const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const longDate = text => fromIso(text).toLocaleDateString(dateLocale.value, { day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = text => (text ? fromIso(text).toLocaleDateString(dateLocale.value, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')
const money = cents => formatMoney(cents, dateLocale.value, data.value?.copy?.currency || 'BRL')
const isOverdue = loan => Boolean(loan.dueOn && !loan.returnedOn && loan.dueOn < isoDate(new Date()))

const data = ref(null)
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref(null)

async function load() {
  const asked = props.bookId
  loading.value = true
  loadError.value = ''
  try {
    const result = await api.getBookCollection(asked)
    if (asked === props.bookId) {
      data.value = result
      resetCopyDraft()
    }
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function run(task, done) {
  saving.value = true
  try {
    await task()
    if (done) toast.add({ severity: 'success', detail: t(done) })
    await load()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    saving.value = false
  }
}

// ------------------------------------------------------------------ empréstimo
const editingLoan = ref(false)
const draft = reactive({ id: null, borrower: '', lentOn: null, dueOn: null, notes: '' })

function startEdit(loan) {
  Object.assign(draft, {
    id: loan?.id ?? null,
    borrower: loan?.borrower ?? '',
    lentOn: loan ? fromIso(loan.lentOn) : new Date(),
    dueOn: loan?.dueOn ? fromIso(loan.dueOn) : null,
    notes: loan?.notes ?? ''
  })
  editingLoan.value = true
}

function saveLoan() {
  const body = {
    borrower: draft.borrower,
    lentOn: draft.lentOn ? isoDate(draft.lentOn) : null,
    dueOn: draft.dueOn ? isoDate(draft.dueOn) : null,
    notes: draft.notes
  }
  return run(async () => {
    if (draft.id) await api.updateLoan(draft.id, body)
    else await api.lendBook(props.bookId, body)
    editingLoan.value = false
  }, draft.id ? 'collection.loan.saved' : 'collection.loan.lent')
}

const markReturned = () => run(() => api.returnLoan(data.value.loan.id), 'collection.loan.returned')
const toggleReminder = value => run(() => api.setLoanReminder(data.value.loan.id, value), value ? 'collection.loan.remindOn' : null)

function removeLoan(id) {
  confirm.require({
    header: t('collection.loan.removeTitle'),
    message: t('collection.loan.removeMessage'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('collection.loan.remove'),
    rejectLabel: t('common.cancel'),
    accept: () => run(async () => {
      await api.deleteLoan(id)
      editingLoan.value = false
    })
  })
}

// ------------------------------------------------------------------ exemplar
const copyDraft = reactive({ location: '', price: '', value: '', acquiredOn: null })

const hasCopyData = computed(() => {
  const copy = data.value?.copy
  return Boolean(copy && (copy.location || copy.priceCents !== null || copy.valueCents !== null || copy.acquiredOn)) || Boolean(data.value?.photos.length)
})

function resetCopyDraft() {
  const copy = data.value.copy
  Object.assign(copyDraft, {
    location: copy.location ?? '',
    price: centsToInput(copy.priceCents, dateLocale.value),
    value: centsToInput(copy.valueCents, dateLocale.value),
    acquiredOn: copy.acquiredOn ? fromIso(copy.acquiredOn) : null
  })
}

const amountError = text => (Number.isNaN(parseCents(text)) ? t('collection.copy.amountInvalid') : '')
const priceError = computed(() => amountError(copyDraft.price))
const valueError = computed(() => amountError(copyDraft.value))

const copyBody = computed(() => ({
  location: copyDraft.location.trim() || null,
  priceCents: parseCents(copyDraft.price),
  valueCents: parseCents(copyDraft.value),
  acquiredOn: copyDraft.acquiredOn ? isoDate(copyDraft.acquiredOn) : null
}))

const copyDirty = computed(() => {
  const copy = data.value?.copy
  if (!copy) return false
  const body = copyBody.value
  return body.location !== (copy.location ?? null) || body.priceCents !== copy.priceCents ||
    body.valueCents !== copy.valueCents || body.acquiredOn !== copy.acquiredOn
})

const saveCopy = () => run(() => api.saveBookCopy(props.bookId, { ...copyBody.value, currency: data.value.copy.currency }), 'collection.copy.saved')

// ------------------------------------------------------------------ fotos
const photosFull = computed(() =>
  data.value.quota.used >= data.value.quota.max || data.value.quota.inBook >= data.value.quota.perBook)

async function addPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    await api.uploadCopyPhoto(props.bookId, file)
    await load()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    uploading.value = false
  }
}

function removePhoto(photo) {
  confirm.require({
    header: t('collection.photos.removeTitle'),
    message: t('collection.photos.removeMessage'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('collection.photos.remove'),
    rejectLabel: t('common.cancel'),
    accept: () => run(() => api.deleteCopyPhoto(props.bookId, photo.id))
  })
}

watch(() => props.bookId, () => {
  editingLoan.value = false
  data.value = null
  load()
}, { immediate: true })
</script>

<style scoped>
.collection-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.collection-section > h3 {
  margin: 0;
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.block-title {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.loan-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--main-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.loan-card.overdue {
  border-left-color: var(--red);
}

.loan-card p {
  margin: 0;
}

.loan-who {
  color: var(--text-primary);
  font-weight: 600;
}

.loan-dates,
.loan-notes,
.pro-hint {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.loan-card.overdue .loan-dates {
  color: var(--red);
}

.pro-hint a {
  color: var(--main-color);
  font-weight: 600;
}

.reminder-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.reminder-label {
  font-size: var(--fs-sm);
}

.loan-form,
.copy-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.actions .muted-line {
  flex: 1 1 12rem;
}

.link-button {
  padding: var(--space-1) 0;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.link-button.danger {
  color: var(--red);
}

.link-button:focus-visible,
.photo-remove:focus-visible,
.photo-grid a:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.history {
  font-size: var(--fs-sm);
}

.history summary {
  color: var(--text-secondary);
  cursor: pointer;
}

.history ul {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.history li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.muted,
.muted-line {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.copy-read {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: var(--space-2) var(--space-4);
  margin: 0;
  font-size: var(--fs-sm);
}

.copy-read dt {
  color: var(--text-secondary);
}

.copy-read dd {
  margin: 0;
  color: var(--text-primary);
}

.photos {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.photos-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--space-2);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.photo-grid li {
  position: relative;
}

.photo-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
}

.photo-remove {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: var(--radius-pill);
  background: rgb(0 0 0 / 60%);
  color: #fff;
  cursor: pointer;
}

@media (max-width: 639.98px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

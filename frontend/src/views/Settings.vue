<template>
  <div class="settings-container">
    <div class="settings-content">
      <div class="view-header">
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>

      <!-- Índice: no celular são 7 cartões em coluna -->
      <nav
        class="settings-index"
        :aria-label="t('settings.index.label')"
      >
        <a
          v-for="item in indexItems"
          :key="item.id"
          :href="`#${item.id}`"
          class="index-link"
          @click.prevent="jumpTo(item.id)"
        >{{ item.label }}</a>
      </nav>

      <div class="settings-grid">
        <!-- Biblioteca pública -->
        <section
          class="settings-card"
          aria-labelledby="settings-public-title"
          id="settings-privacy"
          tabindex="-1"
        >
          <h2 id="settings-public-title">{{ t('settings.public.title') }}</h2>
          <p class="card-desc">{{ t('settings.public.desc') }}</p>
          <p
            v-if="!emailVerified"
            class="verify-note"
          >
            <i
              class="pi pi-envelope"
              aria-hidden="true"
            ></i>
            {{ t('settings.verifyFirst') }}
          </p>

          <div class="toggle-row">
            <AppSwitch
              inputId="settings-public-toggle"
              :modelValue="isPublic"
              :disabled="savingVisibility || (!emailVerified && !isPublic)"
              @update:modelValue="value => savePrivacy('isPublic', value)"
            />
            <label for="settings-public-toggle">{{ t('settings.public.toggle') }}</label>
          </div>

          <div
            v-if="isPublic"
            class="toggle-block"
          >
            <div class="toggle-row">
              <AppSwitch
                inputId="settings-indexing-toggle"
                :modelValue="allowIndexing"
                :disabled="savingVisibility || (!emailVerified && !allowIndexing)"
                aria-describedby="settings-indexing-help"
                @update:modelValue="value => savePrivacy('allowIndexing', value)"
              />
              <label for="settings-indexing-toggle">{{ t('settings.indexing.toggle') }}</label>
            </div>
            <small
              id="settings-indexing-help"
              class="toggle-help"
            >{{ t('settings.indexing.help') }}</small>
          </div>

          <div
            v-if="isPublic"
            class="public-link"
          >
            <label for="settings-public-link">{{ t('settings.public.link') }}</label>
            <div class="link-row">
              <input
                id="settings-public-link"
                :value="publicUrl"
                class="modern-input"
                readonly
                @focus="event => event.target.select()"
              />
              <AppButton
                :label="copied ? t('common.copied') : t('common.copy')"
                :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
                class="btn-outlined btn-secondary"
                @click="copyLink"
              />
            </div>
          </div>
        </section>

        <!-- Comunidade -->
        <section
          class="settings-card"
          aria-labelledby="settings-community-title"
        >
          <h2 id="settings-community-title">{{ t('settings.community.title') }}</h2>
          <p class="card-desc">{{ t('settings.community.desc') }}</p>

          <div class="stack">
            <div class="toggle-block">
              <div class="toggle-row">
                <AppSwitch
                  inputId="settings-community-toggle"
                  :modelValue="showInCommunity"
                  :disabled="savingVisibility || !isPublic || (!emailVerified && !showInCommunity)"
                  aria-describedby="settings-community-help"
                  @update:modelValue="value => savePrivacy('showInCommunity', value)"
                />
                <label for="settings-community-toggle">{{ t('settings.community.toggle') }}</label>
              </div>
              <small
                id="settings-community-help"
                class="toggle-help"
              >{{ isPublic ? t('settings.community.help') : t('settings.community.needs_public') }}</small>
            </div>

            <div class="toggle-block">
              <div class="toggle-row">
                <AppSwitch
                  inputId="settings-activity-toggle"
                  :modelValue="showActivity"
                  :disabled="savingVisibility || (!emailVerified && !showActivity)"
                  aria-describedby="settings-activity-help"
                  @update:modelValue="value => savePrivacy('showActivity', value)"
                />
                <label for="settings-activity-toggle">{{ t('settings.activity.toggle') }}</label>
              </div>
              <small
                id="settings-activity-help"
                class="toggle-help"
              >{{ t('settings.activity.help') }}</small>
            </div>

            <!-- Leitores bloqueados: não veem você na comunidade nem pedem para seguir -->
            <div
              class="blocked-block"
              id="settings-blocked"
              tabindex="-1"
            >
              <h3 class="sub-title">{{ t('block.listTitle') }}</h3>
              <p
                v-if="blockedUsers.length === 0"
                class="toggle-help"
              >{{ t('block.listEmpty') }}</p>
              <ul
                v-else
                class="blocked-list"
              >
                <li
                  v-for="person in blockedUsers"
                  :key="person.username"
                >
                  <ReaderAvatar
                    :username="person.username"
                    size="sm"
                  />
                  <span class="blocked-name">{{ person.username }}</span>
                  <AppButton
                    :label="t('block.unblock')"
                    class="btn-sm btn-text btn-secondary"
                    :loading="unblocking === person.username"
                    @click="unblockUser(person.username)"
                  />
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Conta: nome de usuário e e-mail -->
        <section
          class="settings-card"
          aria-labelledby="settings-account-title"
          id="settings-account"
          tabindex="-1"
        >
          <h2 id="settings-account-title">{{ t('settings.account.title') }}</h2>
          <p class="card-desc">{{ t('settings.account.desc') }}</p>

          <dl class="account-rows">
            <div class="account-row">
              <dt>{{ t('settings.account.username') }}</dt>
              <dd>
                <span class="account-value">{{ user?.name }}</span>
                <AppButton
                  :label="t('settings.account.change')"
                  class="btn-text btn-sm"
                  @click="openAccountDialog('username')"
                />
              </dd>
            </div>
            <div class="account-row">
              <dt>{{ t('settings.account.email') }}</dt>
              <dd>
                <span class="account-value">
                  {{ user?.email }}
                  <span
                    v-if="!emailVerified"
                    class="badge-pending"
                  >{{ t('settings.account.notVerified') }}</span>
                </span>
                <AppButton
                  :label="t('settings.account.change')"
                  class="btn-text btn-sm"
                  @click="openAccountDialog('email')"
                />
              </dd>
            </div>
          </dl>
        </section>

        <!-- Avisos por e-mail (opt-in) -->
        <section
          class="settings-card"
          aria-labelledby="settings-notifications-title"
          id="settings-notifications"
          tabindex="-1"
        >
          <h2 id="settings-notifications-title">{{ t('settings.notifications.title') }}</h2>
          <p class="card-desc">{{ t('settings.notifications.desc') }}</p>
          <p
            v-if="!emailVerified"
            class="verify-note"
          >
            <i
              class="pi pi-envelope"
              aria-hidden="true"
            ></i>
            {{ t('settings.notifications.verifyFirst') }}
          </p>

          <div class="toggle-block">
            <div class="toggle-row">
              <AppSwitch
                inputId="settings-follow-emails"
                :modelValue="followEmails"
                :disabled="savingNotifications || (!emailVerified && !followEmails)"
                aria-describedby="settings-follow-emails-help"
                @update:modelValue="saveFollowEmails"
              />
              <label for="settings-follow-emails">{{ t('settings.notifications.follow') }}</label>
            </div>
            <small
              id="settings-follow-emails-help"
              class="toggle-help"
            >{{ t('settings.notifications.followHelp', { hours: 6, email: user?.email || '' }) }}</small>
          </div>
        </section>

        <!-- Senha -->
        <section
          class="settings-card"
          aria-labelledby="settings-password-title"
          id="settings-password"
          tabindex="-1"
        >
          <h2 id="settings-password-title">{{ t('settings.password.title') }}</h2>
          <p class="card-desc">{{ t('settings.password.desc') }}</p>

          <form
            class="stack"
            novalidate
            @submit.prevent="changePassword"
          >
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

            <div class="field">
              <PasswordField
                id="settings-current-password"
                ref="currentPasswordField"
                v-model="passwordForm.current"
                :label="t('settings.password.current')"
                autocomplete="current-password"
                :error="passwordErrors.current"
              />
            </div>
            <div class="field">
              <PasswordField
                id="settings-new-password"
                ref="newPasswordField"
                v-model="passwordForm.next"
                :label="t('settings.password.new')"
                autocomplete="new-password"
                strength
                :error="passwordErrors.next"
              />
            </div>
            <div class="field">
              <PasswordField
                id="settings-confirm-password"
                ref="confirmPasswordField"
                v-model="passwordForm.confirm"
                :label="t('settings.password.confirm')"
                autocomplete="new-password"
                :error="passwordErrors.confirm"
              />
            </div>

            <AppButton
              type="submit"
              :label="t('settings.password.submit')"
              class="btn-primary"
              :loading="savingPassword"
            />
          </form>
        </section>

        <!-- Seus dados: exportar e importar -->
        <section
          class="settings-card"
          aria-labelledby="settings-data-title"
          id="settings-data"
          tabindex="-1"
        >
          <h2 id="settings-data-title">{{ t('settings.data.title') }}</h2>
          <p class="card-desc">{{ t('settings.data.exportDesc') }}</p>
          <div class="button-row">
            <AppButton
              :label="t('settings.data.exportJson')"
              icon="pi pi-download"
              class="btn-outlined btn-sm"
              :loading="exporting === 'json'"
              :disabled="Boolean(exporting)"
              @click="downloadExport('json')"
            />
            <AppButton
              :label="t('settings.data.exportCsv')"
              icon="pi pi-file"
              class="btn-outlined btn-sm"
              :loading="exporting === 'csv'"
              :disabled="Boolean(exporting)"
              @click="downloadExport('csv')"
            />
          </div>

          <h3 class="sub-title">{{ t('settings.data.importTitle') }}</h3>
          <p class="card-desc">{{ t('settings.data.importDesc') }}</p>
          <ol class="import-steps">
            <li>{{ t('settings.data.step1') }}</li>
            <li>{{ t('settings.data.step2') }}</li>
            <li>{{ t('settings.data.step3') }}</li>
          </ol>

          <label
            class="file-drop"
            :class="{ busy: importing }"
          >
            <input
              ref="importInput"
              type="file"
              accept=".csv,text/csv"
              class="sr-only"
              :disabled="importing"
              @change="importFile"
            />
            <i
              :class="importing ? 'pi pi-spin pi-spinner' : 'pi pi-upload'"
              aria-hidden="true"
            ></i>
            <span>{{ importing ? t('settings.data.importing') : t('settings.data.chooseFile') }}</span>
          </label>

          <div
            v-if="importResult"
            class="import-result"
            role="status"
          >
            <p class="import-summary">
              <strong>{{ t('settings.data.imported', { n: importResult.imported }, importResult.imported) }}</strong>
              <span v-if="importResult.duplicates"> · {{ t('settings.data.duplicates', { n: importResult.duplicates }, importResult.duplicates) }}</span>
              <span v-if="importResult.failed"> · {{ t('settings.data.failed', { n: importResult.failed }, importResult.failed) }}</span>
            </p>
            <ul
              v-if="importResult.errors?.length"
              class="import-errors"
            >
              <li
                v-for="error in importResult.errors.slice(0, 10)"
                :key="error.line"
              >{{ t('settings.data.errorLine', { line: error.line, title: error.title || '—' }) }}: {{ error.reason }}</li>
            </ul>
            <router-link
              v-if="importResult.imported"
              :to="{ name: 'library' }"
              class="see-library"
            >{{ t('settings.data.seeLibrary') }}</router-link>
          </div>
        </section>

        <!-- Excluir conta -->
        <section
          class="settings-card danger"
          aria-labelledby="settings-delete-title"
          id="settings-delete"
          tabindex="-1"
        >
          <h2 id="settings-delete-title">{{ t('settings.delete.title') }}</h2>
          <p class="card-desc">{{ t('settings.delete.desc') }}</p>
          <AppButton
            :label="t('settings.delete.button')"
            icon="pi pi-trash"
            class="btn-danger btn-outlined"
            @click="openDeleteDialog"
          />
        </section>

        <router-link
          to="/privacy"
          class="privacy-link"
        >
          <i
            class="pi pi-shield"
            aria-hidden="true"
          ></i>
          {{ t('settings.privacyLink') }}
        </router-link>
      </div>
    </div>

    <AppDialog
      v-model:visible="deleteDialogVisible"
      size="sm"
      :header="t('settings.delete.confirmTitle')"
      :closable="!deleting"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="deleteAccount"
      >
        <p class="card-desc">{{ t('settings.delete.confirmMsg') }}</p>
        <div class="field">
          <PasswordField
            id="settings-delete-password"
            ref="deletePasswordField"
            v-model="deletePassword"
            :label="t('settings.delete.password')"
            autocomplete="current-password"
            :error="deleteError"
          />
        </div>
        <div class="dialog-actions">
          <AppButton
            type="button"
            :label="t('common.cancel')"
            class="btn-text btn-secondary"
            :disabled="deleting"
            @click="deleteDialogVisible = false"
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

    <AppDialog
      v-model:visible="accountDialog.visible"
      size="sm"
      :header="accountDialog.field === 'email' ? t('settings.account.emailTitle') : t('settings.account.usernameTitle')"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="saveAccount"
      >
        <p class="dialog-hint">{{ accountDialog.field === 'email' ? t('settings.account.emailHint') : t('settings.account.usernameHint') }}</p>
        <div class="field">
          <TextField
            id="settings-account-value"
            ref="accountValueField"
            v-model="accountDialog.value"
            :label="accountDialog.field === 'email' ? t('settings.account.newEmail') : t('settings.account.newUsername')"
            :type="accountDialog.field === 'email' ? 'email' : 'text'"
            :autocomplete="accountDialog.field === 'email' ? 'email' : 'username'"
            maxlength="254"
            :input-attrs="{ autocapitalize: 'none', spellcheck: 'false' }"
            :error="accountDialog.errors.value"
          />
        </div>
        <div class="field">
          <PasswordField
            id="settings-account-password"
            ref="accountPasswordField"
            v-model="accountDialog.password"
            :label="t('settings.password.current')"
            autocomplete="current-password"
            :error="accountDialog.errors.password"
          />
        </div>
        <AppButton
          type="submit"
          :label="t('common.save')"
          class="btn-primary"
          :loading="accountDialog.saving"
        />
      </form>
    </AppDialog>
  </div>
</template>

<script setup>
import PasswordField from '../components/form/PasswordField.vue'
import TextField from '../components/form/TextField.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import api from '../services/api.js'
import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'
import { isWeakPassword } from '../utils/password.js'

// Espelha a regra do backend para nome de usuário (a mesma do cadastro)
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t, locale } = useI18n()

const indexItems = computed(() => [
  { id: 'settings-privacy', label: t('settings.index.privacy') },
  { id: 'settings-account', label: t('settings.index.account') },
  { id: 'settings-notifications', label: t('settings.index.notifications') },
  { id: 'settings-password', label: t('settings.index.password') },
  { id: 'settings-data', label: t('settings.index.data') },
  { id: 'settings-delete', label: t('settings.index.delete') }
])

function jumpTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
}

const toast = useToast()
const router = useRouter()

const user = currentUser
const isPublic = computed(() => Boolean(user.value?.isPublic))
const emailVerified = computed(() => user.value?.emailVerified !== false)
const showInCommunity = computed(() => Boolean(user.value?.showInCommunity))
const showActivity = computed(() => Boolean(user.value?.showActivity))
const allowIndexing = computed(() => Boolean(user.value?.allowIndexing))
const followEmails = computed(() => Boolean(user.value?.followEmails))
const savingNotifications = ref(false)

// Avisos por e-mail: vão no idioma atual do app
async function saveFollowEmails(value) {
  savingNotifications.value = true
  try {
    const result = await api.setNotifications({ followEmails: value, locale: locale.value === 'en' ? 'en' : 'pt' })
    updateUser({ followEmails: result.followEmails })
    toast.add({ severity: 'success', summary: t('common.success'), detail: result.followEmails ? t('settings.notifications.on') : t('settings.notifications.off'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    savingNotifications.value = false
  }
}
const publicUrl = computed(() => `${window.location.origin}/u/${encodeURIComponent(user.value?.name || '')}`)

const savingVisibility = ref(false)
const copied = ref(false)

const PRIVACY_MESSAGES = {
  isPublic: ['settings.public.on', 'settings.public.off'],
  showInCommunity: ['settings.community.on', 'settings.community.off'],
  showActivity: ['settings.activity.on', 'settings.activity.off'],
  allowIndexing: ['settings.indexing.on', 'settings.indexing.off']
}

async function savePrivacy(field, value) {
  savingVisibility.value = true
  try {
    const result = await api.setPrivacy({ [field]: value })
    updateUser({
      isPublic: result.isPublic,
      showInCommunity: result.showInCommunity,
      showActivity: result.showActivity,
      allowIndexing: result.allowIndexing
    })
    const [onKey, offKey] = PRIVACY_MESSAGES[field]
    toast.add({ severity: 'success', summary: t('common.success'), detail: result[field] ? t(onKey) : t(offKey), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('settings.public.error'), life: 4000 })
  } finally {
    savingVisibility.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
  } catch {
    // Sem permissão de clipboard (http, navegador antigo): seleciona o texto.
    document.getElementById('settings-public-link')?.select()
    return
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// --- Bloqueados ---
const blockedUsers = ref([])
const unblocking = ref('')

async function loadBlocked() {
  try {
    blockedUsers.value = (await api.getBlocked()).blocked
  } catch {
    // Lista opcional: se falhar, a seção só fica vazia
  }
}

async function unblockUser(username) {
  unblocking.value = username
  try {
    await api.unblock(username)
    blockedUsers.value = blockedUsers.value.filter(person => person.username !== username)
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('block.unblocked', { name: username }), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    unblocking.value = ''
  }
}

onMounted(loadBlocked)

// --- Senha ---
// Erros embaixo de cada campo (como no cadastro), em vez de um aviso solto
// no canto. Erro do servidor vai para o campo a que se refere.
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordErrors = reactive({ current: '', next: '', confirm: '' })
const savingPassword = ref(false)
const currentPasswordField = ref(null)
const newPasswordField = ref(null)
const confirmPasswordField = ref(null)

// Digitou de novo no campo: o erro dele some
for (const key of ['current', 'next', 'confirm']) {
  watch(() => passwordForm[key], () => { passwordErrors[key] = '' })
}

function focusFirstError(errors, fields) {
  const key = Object.keys(fields).find(k => errors[k])
  if (key) fields[key].value?.focus()
}

async function changePassword() {
  const required = t('settings.errors.required')
  passwordErrors.current = passwordForm.current ? '' : required
  passwordErrors.next = !passwordForm.next
    ? required
    : (isWeakPassword(passwordForm.next) ? t('register.passwordTooWeak') : '')
  passwordErrors.confirm = !passwordForm.confirm
    ? required
    : (passwordForm.next !== passwordForm.confirm ? t('settings.password.mismatch') : '')

  const fields = { current: currentPasswordField, next: newPasswordField, confirm: confirmPasswordField }
  if (Object.values(passwordErrors).some(Boolean)) {
    focusFirstError(passwordErrors, fields)
    return
  }

  savingPassword.value = true
  try {
    const result = await api.changePassword(passwordForm.current, passwordForm.next)
    setUser(result.user)
    Object.assign(passwordForm, { current: '', next: '', confirm: '' })
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('settings.password.success'), life: 3000 })
    // Os watchers limpam os erros no próximo tick; o formulário volta vazio e sem erro
  } catch (error) {
    if (error.status === 401) passwordErrors.current = error.message
    else if (error.status === 400) passwordErrors.next = error.message
    else toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
    focusFirstError(passwordErrors, fields)
  } finally {
    savingPassword.value = false
  }
}

// --- Conta: nome de usuário e e-mail ---
const accountDialog = reactive({ visible: false, field: 'username', value: '', password: '', saving: false, errors: { value: '', password: '' } })
const accountValueField = ref(null)
const accountPasswordField = ref(null)

watch(() => accountDialog.value, () => { accountDialog.errors.value = '' })
watch(() => accountDialog.password, () => { accountDialog.errors.password = '' })

function openAccountDialog(field) {
  Object.assign(accountDialog, {
    visible: true,
    field,
    value: field === 'email' ? user.value?.email || '' : user.value?.name || '',
    password: '',
    saving: false,
    errors: { value: '', password: '' }
  })
}

function validateAccount() {
  const value = accountDialog.value.trim()
  const errors = accountDialog.errors
  const required = t('settings.errors.required')
  if (!value) errors.value = required
  else if (accountDialog.field === 'email' && !EMAIL_PATTERN.test(value)) errors.value = t('settings.errors.email')
  else if (accountDialog.field === 'username' && !USERNAME_PATTERN.test(value)) errors.value = t('register.invalidUsername')
  else errors.value = ''
  errors.password = accountDialog.password ? '' : required
  return !errors.value && !errors.password
}

async function saveAccount() {
  if (!validateAccount()) {
    focusFirstError(accountDialog.errors, { value: accountValueField, password: accountPasswordField })
    return
  }
  accountDialog.saving = true
  try {
    const value = accountDialog.value.trim()
    const result = accountDialog.field === 'email'
      ? await api.changeEmail(value, accountDialog.password, locale.value)
      : await api.changeUsername(value, accountDialog.password)
    setUser(result.user)
    accountDialog.visible = false
    toast.add({
      severity: 'success',
      summary: t('common.success'),
      detail: accountDialog.field === 'email' ? t('settings.account.emailChanged') : t('settings.account.usernameChanged', { name: result.user.name }),
      life: 5000
    })
  } catch (error) {
    // 401: senha errada; 400/409: valor inválido ou já em uso
    if (error.status === 401) accountDialog.errors.password = error.message
    else if (error.status === 400 || error.status === 409) accountDialog.errors.value = error.message
    else toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
    focusFirstError(accountDialog.errors, { value: accountValueField, password: accountPasswordField })
  } finally {
    accountDialog.saving = false
  }
}

// --- Seus dados ---
const exporting = ref(null)
const importing = ref(false)
const importResult = ref(null)
const importInput = ref(null)

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
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    exporting.value = null
  }
}

async function importFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  importing.value = true
  importResult.value = null
  try {
    importResult.value = await api.importBooks(file)
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 5000 })
  } finally {
    importing.value = false
    if (importInput.value) importInput.value.value = ''
  }
}

// --- Exclusão ---
const deleteDialogVisible = ref(false)
const deletePassword = ref('')
const deleting = ref(false)
const deleteError = ref('')
const deletePasswordField = ref(null)

watch(deletePassword, () => { deleteError.value = '' })

function openDeleteDialog() {
  deletePassword.value = ''
  deleteError.value = ''
  deleteDialogVisible.value = true
}

async function deleteAccount() {
  if (!deletePassword.value) {
    deleteError.value = t('settings.errors.required')
    deletePasswordField.value?.focus()
    return
  }

  deleting.value = true
  try {
    await api.deleteAccount(deletePassword.value)
    deleteDialogVisible.value = false
    clearSession()
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('settings.delete.success'), life: 5000 })
    router.replace({ name: 'login' })
  } catch (error) {
    if (error.status === 401) {
      deleteError.value = error.message
      deletePasswordField.value?.focus()
    } else {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
    }
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.settings-container {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.settings-content {
  max-width: 720px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 2.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1.5rem;
}

.view-header h1 {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  color: var(--text-primary);
  margin: 0;
}

.view-header p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0 0;
}

.settings-index {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: -1rem 0 1.75rem;
}

.index-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.index-link:hover {
  border-color: var(--main-color);
  color: var(--text-primary);
}

.settings-card {
  scroll-margin-top: 5rem;
}

.settings-card:focus {
  outline: none;
}

@media (pointer: coarse) {
  .index-link {
    min-height: 2.75rem;
  }
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-card {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
}

.settings-card.danger {
  border-color: rgba(var(--red-rgb), 0.4);
}

.settings-card h2 {
  margin: 0 0 0.5rem 0;
  font-size: var(--fs-lg);
  color: var(--text-primary);
}

.card-desc {
  margin: 0 0 1.25rem 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.5;
}

.verify-note {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: -0.5rem 0 1.25rem;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.verify-note .pi {
  color: var(--main-color);
  margin-top: 0.15rem;
}

.toggle-block {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.blocked-block .toggle-help {
  padding-left: 0;
}

.toggle-row + .toggle-block {
  margin-top: 1rem;
}

.toggle-help {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
  padding-left: 3.75rem;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-primary);
}

.public-link {
  margin-top: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.public-link label,
.field label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.link-row {
  display: flex;
  gap: 0.5rem;
}

.modern-input {
  flex: 1;
  min-width: 0;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.7rem 1rem;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--fs-md);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
}

.stack>.btn {
  align-self: flex-start;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.w-full,
.w-full :deep(input) {
  width: 100%;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.privacy-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--fs-md);
  width: fit-content;
}

.privacy-link:hover {
  color: var(--main-color);
}

.account-rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.account-row {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border-color);
}

.account-row:last-child {
  border-bottom: none;
}

.account-row dt {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.account-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
}

.account-value {
  color: var(--text-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.badge-pending {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #b45309;
  background: rgba(245, 158, 11, 0.15);
}

.button-row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.sub-title {
  margin: 1.5rem 0 0.25rem;
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.import-steps {
  margin: 0 0 1rem;
  padding-left: 1.2rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.6;
}

.file-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.1rem;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.file-drop:hover,
.file-drop:focus-within {
  border-color: var(--main-color);
  color: var(--text-primary);
}

.file-drop.busy {
  cursor: progress;
}

.import-result {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: rgba(var(--main-color-rgb), 0.08);
  border: 1px solid rgba(var(--main-color-rgb), 0.3);
}

.import-summary {
  margin: 0;
  color: var(--text-primary);
}

.import-errors {
  margin: 0.6rem 0 0;
  padding-left: 1.1rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.see-library {
  display: inline-block;
  margin-top: 0.6rem;
  color: var(--main-color);
  font-weight: 600;
}

.dialog-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.5;
}

.plain-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  color: var(--text-primary);
  font: inherit;
  box-sizing: border-box;
}

.plain-input:focus {
  border-color: var(--main-color);
  outline: none;
}

@media (max-width: 640px) {
  .account-row {
    grid-template-columns: 1fr;
    gap: 0.1rem;
  }

  .settings-container {
    padding: 1.25rem;
  }

  .view-header h1 {
    font-size: var(--fs-2xl);
  }

  .link-row {
    flex-direction: column;
  }
}
.blocked-block {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.blocked-block .sub-title {
  margin: 0 0 0.5rem;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text-primary);
}

.blocked-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.blocked-list li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.blocked-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
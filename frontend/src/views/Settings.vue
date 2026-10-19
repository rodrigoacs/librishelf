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
            <InputSwitch
              inputId="settings-public-toggle"
              :modelValue="isPublic"
              :disabled="savingVisibility || (!emailVerified && !isPublic)"
              @update:modelValue="value => savePrivacy('isPublic', value)"
            />
            <label for="settings-public-toggle">{{ t('settings.public.toggle') }}</label>
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
              <Button
                :label="copied ? t('common.copied') : t('common.copy')"
                :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
                class="p-button-outlined p-button-secondary"
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
                <InputSwitch
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
                <InputSwitch
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
                <Button
                  :label="t('settings.account.change')"
                  class="p-button-text p-button-sm"
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
                <Button
                  :label="t('settings.account.change')"
                  class="p-button-text p-button-sm"
                  @click="openAccountDialog('email')"
                />
              </dd>
            </div>
          </dl>
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
              <label for="settings-current-password">{{ t('settings.password.current') }}</label>
              <Password
                inputId="settings-current-password"
                v-model="passwordForm.current"
                :feedback="false"
                toggleMask
                class="w-full"
                :inputProps="{ autocomplete: 'current-password' }"
              />
            </div>
            <div class="field">
              <label for="settings-new-password">{{ t('settings.password.new') }}</label>
              <Password
                inputId="settings-new-password"
                v-model="passwordForm.next"
                toggleMask
                class="w-full"
                :promptLabel="t('register.passwordPrompt')"
                :weakLabel="t('register.weak')"
                :mediumLabel="t('register.medium')"
                :strongLabel="t('register.strong')"
                :inputProps="{ autocomplete: 'new-password' }"
              />
            </div>
            <div class="field">
              <label for="settings-confirm-password">{{ t('settings.password.confirm') }}</label>
              <Password
                inputId="settings-confirm-password"
                v-model="passwordForm.confirm"
                :feedback="false"
                toggleMask
                class="w-full"
                :inputProps="{ autocomplete: 'new-password' }"
              />
            </div>

            <Button
              type="submit"
              :label="t('settings.password.submit')"
              class="btn-action-primary"
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
            <Button
              :label="t('settings.data.exportJson')"
              icon="pi pi-download"
              class="p-button-outlined p-button-sm"
              :loading="exporting === 'json'"
              :disabled="Boolean(exporting)"
              @click="downloadExport('json')"
            />
            <Button
              :label="t('settings.data.exportCsv')"
              icon="pi pi-file"
              class="p-button-outlined p-button-sm"
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
          <Button
            :label="t('settings.delete.button')"
            icon="pi pi-trash"
            class="p-button-danger p-button-outlined"
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

    <Dialog
      v-model:visible="deleteDialogVisible"
      modal
      :header="t('settings.delete.confirmTitle')"
      :style="{ width: '460px', maxWidth: '95vw' }"
      :dismissableMask="!deleting"
      :closable="!deleting"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="deleteAccount"
      >
        <p class="card-desc">{{ t('settings.delete.confirmMsg') }}</p>
        <div class="field">
          <label for="settings-delete-password">{{ t('settings.delete.password') }}</label>
          <Password
            inputId="settings-delete-password"
            v-model="deletePassword"
            :feedback="false"
            toggleMask
            class="w-full"
            :inputProps="{ autocomplete: 'current-password' }"
          />
        </div>
        <div class="dialog-actions">
          <Button
            type="button"
            :label="t('common.cancel')"
            class="p-button-text p-button-secondary"
            :disabled="deleting"
            @click="deleteDialogVisible = false"
          />
          <Button
            type="submit"
            :label="t('settings.delete.confirmButton')"
            icon="pi pi-trash"
            class="p-button-danger"
            :loading="deleting"
            :disabled="!deletePassword"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="accountDialog.visible"
      modal
      :header="accountDialog.field === 'email' ? t('settings.account.emailTitle') : t('settings.account.usernameTitle')"
      :style="{ width: 'min(28rem, 92vw)' }"
      :draggable="false"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="saveAccount"
      >
        <p class="dialog-hint">{{ accountDialog.field === 'email' ? t('settings.account.emailHint') : t('settings.account.usernameHint') }}</p>
        <div class="field">
          <label for="settings-account-value">{{ accountDialog.field === 'email' ? t('settings.account.newEmail') : t('settings.account.newUsername') }}</label>
          <input
            id="settings-account-value"
            v-model="accountDialog.value"
            class="plain-input"
            :type="accountDialog.field === 'email' ? 'email' : 'text'"
            :autocomplete="accountDialog.field === 'email' ? 'email' : 'username'"
            maxlength="254"
          />
        </div>
        <div class="field">
          <label for="settings-account-password">{{ t('settings.password.current') }}</label>
          <Password
            inputId="settings-account-password"
            v-model="accountDialog.password"
            :feedback="false"
            toggleMask
            class="w-full"
            :inputProps="{ autocomplete: 'current-password' }"
          />
        </div>
        <Button
          type="submit"
          :label="t('common.save')"
          class="btn-action-primary"
          :loading="accountDialog.saving"
          :disabled="!accountDialog.value.trim() || !accountDialog.password"
        />
      </form>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputSwitch from 'primevue/inputswitch'
import Password from 'primevue/password'
import api from '../services/api.js'
import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'

const { t, locale } = useI18n()

const indexItems = computed(() => [
  { id: 'settings-privacy', label: t('settings.index.privacy') },
  { id: 'settings-account', label: t('settings.index.account') },
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
const publicUrl = computed(() => `${window.location.origin}/u/${encodeURIComponent(user.value?.name || '')}`)

const savingVisibility = ref(false)
const copied = ref(false)

const PRIVACY_MESSAGES = {
  isPublic: ['settings.public.on', 'settings.public.off'],
  showInCommunity: ['settings.community.on', 'settings.community.off'],
  showActivity: ['settings.activity.on', 'settings.activity.off']
}

async function savePrivacy(field, value) {
  savingVisibility.value = true
  try {
    const result = await api.setPrivacy({ [field]: value })
    updateUser({
      isPublic: result.isPublic,
      showInCommunity: result.showInCommunity,
      showActivity: result.showActivity
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

// --- Senha ---
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const savingPassword = ref(false)

async function changePassword() {
  if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
    toast.add({ severity: 'warn', summary: t('register.attention'), detail: t('settings.password.fill'), life: 3000 })
    return
  }

  if (passwordForm.next !== passwordForm.confirm) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('settings.password.mismatch'), life: 3000 })
    return
  }

  savingPassword.value = true
  try {
    const result = await api.changePassword(passwordForm.current, passwordForm.next)
    setUser(result.user)
    Object.assign(passwordForm, { current: '', next: '', confirm: '' })
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('settings.password.success'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    savingPassword.value = false
  }
}

// --- Conta: nome de usuário e e-mail ---
const accountDialog = reactive({ visible: false, field: 'username', value: '', password: '', saving: false })

function openAccountDialog(field) {
  Object.assign(accountDialog, {
    visible: true,
    field,
    value: field === 'email' ? user.value?.email || '' : user.value?.name || '',
    password: '',
    saving: false
  })
}

async function saveAccount() {
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
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
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

function openDeleteDialog() {
  deletePassword.value = ''
  deleteDialogVisible.value = true
}

async function deleteAccount() {
  if (!deletePassword.value) return

  deleting.value = true
  try {
    await api.deleteAccount(deletePassword.value)
    deleteDialogVisible.value = false
    clearSession()
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('settings.delete.success'), life: 5000 })
    router.replace({ name: 'login' })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    deleting.value = false
    deletePassword.value = ''
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

.stack>.p-button {
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
</style>
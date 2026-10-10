<template>
  <div class="settings-container">
    <div class="settings-content">
      <div class="view-header">
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>

      <div class="settings-grid">
        <!-- Biblioteca pública -->
        <section
          class="settings-card"
          aria-labelledby="settings-public-title"
        >
          <h2 id="settings-public-title">{{ t('settings.public.title') }}</h2>
          <p class="card-desc">{{ t('settings.public.desc') }}</p>

          <div class="toggle-row">
            <InputSwitch
              inputId="settings-public-toggle"
              :modelValue="isPublic"
              :disabled="savingVisibility"
              @update:modelValue="toggleVisibility"
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

        <!-- Senha -->
        <section
          class="settings-card"
          aria-labelledby="settings-password-title"
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

        <!-- Excluir conta -->
        <section
          class="settings-card danger"
          aria-labelledby="settings-delete-title"
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

const { t } = useI18n()
const toast = useToast()
const router = useRouter()

const user = currentUser
const isPublic = computed(() => Boolean(user.value?.isPublic))
const publicUrl = computed(() => `${window.location.origin}/u/${encodeURIComponent(user.value?.name || '')}`)

const savingVisibility = ref(false)
const copied = ref(false)

async function toggleVisibility(value) {
  savingVisibility.value = true
  try {
    const result = await api.setLibraryVisibility(value)
    updateUser({ isPublic: result.isPublic })
    toast.add({ severity: 'success', summary: t('common.success'), detail: result.isPublic ? t('settings.public.on') : t('settings.public.off'), life: 3000 })
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
  font-family: 'Georgia', serif;
  font-size: 2.5rem;
  color: var(--text-primary);
  margin: 0;
}

.view-header p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0 0;
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
  font-size: 1.15rem;
  color: var(--text-primary);
}

.card-desc {
  margin: 0 0 1.25rem 0;
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.5;
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
  font-size: 0.85rem;
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
  font-size: 0.9rem;
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
  font-size: 0.9rem;
  width: fit-content;
}

.privacy-link:hover {
  color: var(--main-color);
}

@media (max-width: 640px) {
  .settings-container {
    padding: 1.25rem;
  }

  .view-header h1 {
    font-size: 2rem;
  }

  .link-row {
    flex-direction: column;
  }
}
</style>
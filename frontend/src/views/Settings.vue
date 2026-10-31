<template>
  <div class="settings-container">
    <div class="settings-content">
      <PageHeader :title="t('settings.title')" />

      <!-- Perfil: foto (tocar troca), nome, e-mail e o atalho da biblioteca pública -->
      <section
        class="profile-card"
        aria-labelledby="settings-profile-name"
      >
        <button
          type="button"
          class="profile-photo"
          :aria-label="t('settings.profile.photoButton')"
          data-press
          @click="photoSheetOpen = true"
        >
          <ReaderAvatar
            :username="user?.name || '?'"
            :avatar="user?.avatarHidden ? null : (user?.avatarVersion ?? null)"
            size="xl"
          />
          <span
            class="photo-badge"
            aria-hidden="true"
          ><i class="pi pi-camera"></i></span>
        </button>
        <div class="profile-text">
          <h2 id="settings-profile-name">{{ user?.name }}</h2>
          <p class="profile-email">
            <span class="email-text">{{ user?.email }}</span>
            <span
              class="email-badge"
              :class="emailVerified ? 'ok' : 'pending'"
            >
              <i
                :class="emailVerified ? 'pi pi-check-circle' : 'pi pi-clock'"
                aria-hidden="true"
              ></i>
              {{ emailVerified ? t('settings.profile.verified') : t('settings.account.notVerified') }}
            </span>
          </p>
          <router-link
            v-if="isPublic"
            :to="{ name: 'public-library', params: { username: user?.name } }"
            class="profile-link"
          >
            {{ t('settings.profile.seeLibrary') }}
            <i
              class="pi pi-angle-right"
              aria-hidden="true"
            ></i>
          </router-link>
        </div>
      </section>

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

      <!-- Perfil -->
      <section
        class="settings-group"
        aria-labelledby="settings-group-profile"
      >
        <h2
          id="settings-group-profile"
          class="group-title"
        >{{ t('settings.groups.profile') }}</h2>
        <div class="group-list">
          <SettingsRow
            :label="t('avatar.title')"
            :value="photoStatus"
            icon="pi pi-image"
            interactive
            class="row-photo"
            @click="photoSheetOpen = true"
          />
          <SettingsRow
            :label="t('settings.account.username')"
            :value="user?.name || ''"
            icon="pi pi-at"
            interactive
            class="row-username"
            @click="openAccountDialog('username')"
          />
          <SettingsRow
            :label="t('settings.account.email')"
            :value="user?.email || ''"
            icon="pi pi-envelope"
            interactive
            class="row-email"
            @click="openAccountDialog('email')"
          />
        </div>
      </section>

      <!-- Privacidade -->
      <section
        id="settings-privacy"
        class="settings-group"
        aria-labelledby="settings-group-privacy"
        tabindex="-1"
      >
        <h2
          id="settings-group-privacy"
          class="group-title"
        >{{ t('settings.groups.privacy') }}</h2>
        <div class="group-list">
          <SettingsRow
            :label="t('settings.public.toggle')"
            :help="t('settings.public.desc')"
            label-for="settings-public-toggle"
            help-id="settings-public-help"
          >
            <template #trailing>
              <AppSwitch
                inputId="settings-public-toggle"
                :modelValue="isPublic"
                :disabled="savingVisibility || (!emailVerified && !isPublic)"
                aria-describedby="settings-public-help"
                @update:modelValue="value => savePrivacy('isPublic', value)"
              />
            </template>
          </SettingsRow>
          <SettingsRow
            v-if="isPublic"
            :label="t('settings.public.link')"
            :help="publicUrl"
            :value="copied ? t('common.copied') : t('common.copy')"
            :trail-icon="copied ? 'pi pi-check' : 'pi pi-copy'"
            interactive
            class="row-copy"
            @click="copyLink"
          />
          <SettingsRow
            v-if="isPublic"
            :label="t('settings.indexing.toggle')"
            :help="t('settings.indexing.help')"
            label-for="settings-indexing-toggle"
            help-id="settings-indexing-help"
          >
            <template #trailing>
              <AppSwitch
                inputId="settings-indexing-toggle"
                :modelValue="allowIndexing"
                :disabled="savingVisibility || (!emailVerified && !allowIndexing)"
                aria-describedby="settings-indexing-help"
                @update:modelValue="value => savePrivacy('allowIndexing', value)"
              />
            </template>
          </SettingsRow>
          <SettingsRow
            :label="t('settings.community.toggle')"
            :help="isPublic ? t('settings.community.help') : t('settings.community.needs_public')"
            label-for="settings-community-toggle"
            help-id="settings-community-help"
          >
            <template #trailing>
              <AppSwitch
                inputId="settings-community-toggle"
                :modelValue="showInCommunity"
                :disabled="savingVisibility || !isPublic || (!emailVerified && !showInCommunity)"
                aria-describedby="settings-community-help"
                @update:modelValue="value => savePrivacy('showInCommunity', value)"
              />
            </template>
          </SettingsRow>
          <SettingsRow
            :label="t('settings.activity.toggle')"
            :help="t('settings.activity.help')"
            label-for="settings-activity-toggle"
            help-id="settings-activity-help"
          >
            <template #trailing>
              <AppSwitch
                inputId="settings-activity-toggle"
                :modelValue="showActivity"
                :disabled="savingVisibility || (!emailVerified && !showActivity)"
                aria-describedby="settings-activity-help"
                @update:modelValue="value => savePrivacy('showActivity', value)"
              />
            </template>
          </SettingsRow>
          <SettingsRow
            :label="t('block.listTitle')"
            :value="blockedValue"
            icon="pi pi-ban"
            interactive
            class="row-blocked"
            @click="blockedSheetOpen = true"
          />
        </div>
      </section>

      <!-- Avisos por e-mail (opt-in) -->
      <section
        class="settings-group"
        aria-labelledby="settings-group-notifications"
      >
        <h2
          id="settings-group-notifications"
          class="group-title"
        >{{ t('settings.notifications.title') }}</h2>
        <div class="group-list">
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
                :disabled="savingNotifications || (!emailVerified && !followEmails)"
                aria-describedby="settings-follow-emails-help"
                @update:modelValue="saveFollowEmails"
              />
            </template>
          </SettingsRow>
        </div>
      </section>

      <!-- Segurança -->
      <section
        class="settings-group"
        aria-labelledby="settings-group-security"
      >
        <h2
          id="settings-group-security"
          class="group-title"
        >{{ t('settings.groups.security') }}</h2>
        <div class="group-list">
          <SettingsRow
            :label="t('settings.password.title')"
            :help="t('settings.password.desc')"
            icon="pi pi-lock"
            interactive
            class="row-password"
            @click="passwordSheetOpen = true"
          />
        </div>
      </section>

      <!-- Seus dados -->
      <section
        class="settings-group"
        aria-labelledby="settings-group-data"
      >
        <h2
          id="settings-group-data"
          class="group-title"
        >{{ t('settings.data.title') }}</h2>
        <div class="group-list">
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
            @click="importSheetOpen = true"
          />
        </div>
      </section>

      <!-- Excluir conta: separado, no fim -->
      <section
        class="settings-group"
        aria-labelledby="settings-group-danger"
      >
        <h2
          id="settings-group-danger"
          class="sr-only"
        >{{ t('settings.delete.title') }}</h2>
        <div class="group-list">
          <SettingsRow
            :label="t('settings.delete.button')"
            :help="t('settings.delete.desc')"
            icon="pi pi-trash"
            interactive
            danger
            class="row-delete"
            @click="openDeleteDialog"
          />
        </div>
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

    <!-- Foto de perfil -->
    <input
      ref="photoInput"
      type="file"
      accept="image/*"
      class="sr-only photo-input"
      tabindex="-1"
      aria-hidden="true"
      @change="onPhotoPicked"
    />
    <AppDialog
      v-model:visible="photoSheetOpen"
      size="sm"
      dialog-class="settings-sheet photo-sheet"
      :header="t('avatar.title')"
    >
      <div class="sheet-stack">
        <div
          class="photo-block"
          role="group"
          :aria-label="t('avatar.title')"
        >
          <ReaderAvatar
            :username="user?.name || '?'"
            :avatar="user?.avatarHidden ? null : (user?.avatarVersion ?? null)"
            size="xl"
          />
          <div class="photo-side">
            <span class="photo-status">{{ photoStatus }}</span>
            <div class="photo-actions">
              <AppButton
                :label="user?.avatarVersion ? t('avatar.change') : t('avatar.choose')"
                icon="pi pi-camera"
                class="btn-outlined btn-sm"
                :disabled="!emailVerified"
                @click="pickPhoto"
              />
              <AppButton
                v-if="user?.avatarVersion"
                :label="t('avatar.remove')"
                class="btn-text btn-sm btn-secondary"
                :loading="removingPhoto"
                @click="askRemovePhoto"
              />
            </div>
          </div>
        </div>
        <p
          v-if="!emailVerified"
          class="photo-note"
        >{{ t('avatar.needsEmail') }}</p>
        <p
          v-else-if="user?.avatarHidden"
          class="photo-note warn"
          role="status"
        >
          <i
            class="pi pi-exclamation-triangle"
            aria-hidden="true"
          ></i>
          {{ t('avatar.hiddenNotice') }}
        </p>
        <fieldset
          v-if="user?.avatarVersion"
          class="vis-group"
        >
          <legend>{{ t('avatar.visibilityLabel') }}</legend>
          <label
            v-for="option in ['everyone', 'followers', 'nobody']"
            :key="option"
            class="vis-option"
            :class="{ selected: (user?.avatarVisibility || 'followers') === option }"
          >
            <input
              type="radio"
              name="settings-photo-visibility"
              :value="option"
              :checked="(user?.avatarVisibility || 'followers') === option"
              :disabled="savingPhotoVisibility"
              @change="savePhotoVisibility(option)"
            />
            <span>{{ t(`avatar.visibility.${option}`) }}</span>
          </label>
        </fieldset>
      </div>
    </AppDialog>
    <AvatarCropSheet
      v-model:visible="cropOpen"
      :file="pickedPhoto"
      :initial-visibility="user?.avatarVisibility || 'followers'"
      @saved="onPhotoSaved"
    />

    <!-- Leitores bloqueados: não veem você na comunidade nem pedem para seguir -->
    <AppDialog
      v-model:visible="blockedSheetOpen"
      size="sm"
      dialog-class="settings-sheet blocked-sheet"
      :header="t('block.listTitle')"
    >
      <div class="sheet-stack">
        <AppSkeleton
          v-if="blockedLoading && !blockedLoaded"
          width="60%"
          height="1rem"
        />
        <!-- Falha não é "ninguém bloqueado": erro com "Tentar de novo" -->
        <EmptyState
          v-else-if="blockedError"
          variant="error"
          compact
          :level="3"
          :title="t('block.listFailed')"
          :loading="blockedLoading"
          @action="loadBlocked"
        />
        <p
          v-else-if="blockedUsers.length === 0"
          class="sheet-text"
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
    </AppDialog>

    <!-- Senha -->
    <AppDialog
      v-model:visible="passwordSheetOpen"
      size="sm"
      dialog-class="settings-sheet password-sheet"
      :header="t('settings.password.title')"
    >
      <form
        class="sheet-stack"
        novalidate
        @submit.prevent="changePassword"
      >
        <p class="sheet-text">{{ t('settings.password.desc') }}</p>
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
        <PasswordField
          id="settings-current-password"
          ref="currentPasswordField"
          v-model="passwordForm.current"
          :label="t('settings.password.current')"
          autocomplete="current-password"
          :error="passwordErrors.current"
        />
        <PasswordField
          id="settings-new-password"
          ref="newPasswordField"
          v-model="passwordForm.next"
          :label="t('settings.password.new')"
          autocomplete="new-password"
          strength
          :error="passwordErrors.next"
        />
        <PasswordField
          id="settings-confirm-password"
          ref="confirmPasswordField"
          v-model="passwordForm.confirm"
          :label="t('settings.password.confirm')"
          autocomplete="new-password"
          :error="passwordErrors.confirm"
        />
        <AppButton
          type="submit"
          :label="t('settings.password.submit')"
          class="btn-primary sheet-submit"
          :loading="savingPassword"
        />
      </form>
    </AppDialog>

    <!-- Importar livros (Goodreads ou CSV do Librishelf) -->
    <AppDialog
      v-model:visible="importSheetOpen"
      size="sm"
      dialog-class="settings-sheet import-sheet"
      :header="t('settings.data.importTitle')"
    >
      <div class="sheet-stack">
        <p class="sheet-text">{{ t('settings.data.importDesc') }}</p>
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
      </div>
    </AppDialog>

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
import PageHeader from '../components/ui/PageHeader.vue'
import PasswordField from '../components/form/PasswordField.vue'
import TextField from '../components/form/TextField.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import AvatarCropSheet from '../components/AvatarCropSheet.vue'
import SettingsRow from '../components/settings/SettingsRow.vue'
import { useConfirm } from '../services/confirm.js'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import api from '../services/api.js'
import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'
import { isWeakPassword } from '../utils/password.js'

// Espelha a regra do backend para nome de usuário (a mesma do cadastro)
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t, locale } = useI18n()

// Folhas da Conta (no celular sobem de baixo; no desktop, janelas)
const photoSheetOpen = ref(false)
const blockedSheetOpen = ref(false)
const passwordSheetOpen = ref(false)
const importSheetOpen = ref(false)

const toast = useToast()
const router = useRouter()
const confirm = useConfirm()

// ---------------------------------------------------------------- foto de perfil
const photoInput = ref(null)
const pickedPhoto = ref(null)
const cropOpen = ref(false)
const removingPhoto = ref(false)
const savingPhotoVisibility = ref(false)

const photoStatus = computed(() => {
  const u = currentUser.value
  if (!u?.avatarVersion) return t('avatar.none')
  return t(`avatar.visibilityShort.${u.avatarVisibility || 'followers'}`)
})

function pickPhoto() {
  photoInput.value?.click()
}

function onPhotoPicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ severity: 'error', detail: t('avatar.notImage'), life: 4000 })
    return
  }
  pickedPhoto.value = file
  // Escolheu a foto: a folha da foto dá lugar à de recorte
  photoSheetOpen.value = false
  cropOpen.value = true
}

function onPhotoSaved(result) {
  updateUser(result)
  toast.add({ severity: 'success', detail: t('avatar.saved'), life: 3000 })
}

function askRemovePhoto() {
  confirm.require({
    header: t('avatar.removeTitle'),
    message: t('avatar.removeText'),
    icon: 'pi pi-trash',
    acceptLabel: t('avatar.remove'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'btn-danger',
    rejectClass: 'btn-text btn-secondary',
    accept: removePhoto
  })
}

async function removePhoto() {
  removingPhoto.value = true
  try {
    updateUser(await api.removeAvatar())
    toast.add({ severity: 'success', detail: t('avatar.removed'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    removingPhoto.value = false
  }
}

async function savePhotoVisibility(value) {
  const before = currentUser.value?.avatarVisibility
  updateUser({ avatarVisibility: value })
  savingPhotoVisibility.value = true
  try {
    updateUser(await api.setAvatarVisibility(value))
  } catch (error) {
    updateUser({ avatarVisibility: before })
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    savingPhotoVisibility.value = false
  }
}

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
    toast.add({ severity: 'success', detail: result.followEmails ? t('settings.notifications.on') : t('settings.notifications.off'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
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
    toast.add({ severity: 'success', detail: result[field] ? t(onKey) : t(offKey), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message || t('settings.public.error'), life: 4000 })
  } finally {
    savingVisibility.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
  } catch {
    // Sem permissão de clipboard (http, navegador antigo): mostra o link para copiar à mão
    toast.add({ severity: 'info', detail: t('settings.public.copyFallback', { url: publicUrl.value }), life: 8000 })
    return
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// --- Bloqueados ---
const blockedUsers = ref([])
const unblocking = ref('')
const blockedLoading = ref(false)
const blockedLoaded = ref(false)
const blockedError = ref(false)

async function loadBlocked() {
  blockedLoading.value = true
  blockedError.value = false
  try {
    blockedUsers.value = (await api.getBlocked()).blocked
    blockedLoaded.value = true
  } catch {
    blockedError.value = true
  } finally {
    blockedLoading.value = false
  }
}

async function unblockUser(username) {
  unblocking.value = username
  try {
    await api.unblock(username)
    blockedUsers.value = blockedUsers.value.filter(person => person.username !== username)
    toast.add({ severity: 'success', detail: t('block.unblocked', { name: username }), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    unblocking.value = ''
  }
}

onMounted(loadBlocked)

// Valor da linha "Leitores bloqueados": quantos (ou "Ninguém")
const blockedValue = computed(() => {
  if (!blockedLoaded.value) return ''
  const n = blockedUsers.value.length
  return n ? t('settings.blockedCount', { n }, n) : t('settings.blockedNone')
})

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
    passwordSheetOpen.value = false
    toast.add({ severity: 'success', detail: t('settings.password.success'), life: 3000 })
    // Os watchers limpam os erros no próximo tick; o formulário volta vazio e sem erro
  } catch (error) {
    if (error.status === 401) passwordErrors.current = error.message
    else if (error.status === 400) passwordErrors.next = error.message
    else toast.add({ severity: 'error', detail: error.message, life: 4000 })
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
      detail: accountDialog.field === 'email' ? t('settings.account.emailChanged') : t('settings.account.usernameChanged', { name: result.user.name }),
      life: 5000
    })
  } catch (error) {
    // 401: senha errada; 400/409: valor inválido ou já em uso
    if (error.status === 401) accountDialog.errors.password = error.message
    else if (error.status === 400 || error.status === 409) accountDialog.errors.value = error.message
    else toast.add({ severity: 'error', detail: error.message, life: 4000 })
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
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
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
    toast.add({ severity: 'error', detail: error.message, life: 5000 })
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
    toast.add({ severity: 'success', detail: t('settings.delete.success'), life: 5000 })
    router.replace({ name: 'login' })
  } catch (error) {
    if (error.status === 401) {
      deleteError.value = error.message
      deletePasswordField.value?.focus()
    } else {
      toast.add({ severity: 'error', detail: error.message, life: 4000 })
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
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 640px;
  margin: 0 auto;
}

/* Cabeçalho de perfil */
.profile-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

.profile-photo {
  position: relative;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}

.profile-photo:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.photo-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--main-solid);
  color: var(--on-main);
  box-shadow: 0 0 0 3px var(--bg-panel);
  font-size: var(--fs-sm);
}

.profile-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.profile-text h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  overflow-wrap: anywhere;
}

.profile-email {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.email-text {
  overflow-wrap: anywhere;
}

.email-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.05rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.email-badge.ok {
  background: rgba(var(--green-rgb), 0.12);
  color: var(--success);
}

.email-badge.pending {
  background: rgba(var(--yellow-rgb), 0.16);
  color: var(--warning);
}

.profile-link {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 32px;
  width: fit-content;
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
}

.profile-link:hover {
  text-decoration: underline;
}

.verify-note {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.verify-note .pi {
  color: var(--main-color);
  margin-top: 0.15rem;
}

/* Grupos de linhas, como os Ajustes de um celular */
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
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.group-list {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

.privacy-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 var(--space-4);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--fs-md);
  width: fit-content;
}

.privacy-link:hover {
  color: var(--main-color);
}

/* Folhas */
.sheet-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sheet-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.5;
}

.sheet-submit {
  min-height: 48px;
}

.photo-block {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.photo-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.photo-status {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.photo-note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.photo-note.warn .pi {
  color: var(--warning);
  margin-top: 0.15rem;
}

.vis-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: none;
}

.vis-group legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-weight: 600;
}

.vis-option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.vis-option.selected {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

.vis-option input {
  accent-color: var(--main-solid);
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

.import-steps {
  margin: 0;
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
  min-height: 56px;
  padding: 1.1rem;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-md);
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
  padding: 0.9rem 1rem;
  border-radius: var(--radius-md);
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

/* Janelas de nome de usuário, e-mail e exclusão */
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

.card-desc,
.dialog-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

@media (max-width: 639.98px) {
  .settings-container {
    padding: 1.25rem 1rem;
  }

  .settings-content {
    gap: var(--space-4);
  }

  .profile-card {
    padding: var(--space-4);
  }

  /* Celular: o botão de cada folha ocupa a largura toda */
  .sheet-submit,
  .stack > .btn {
    align-self: stretch;
    width: 100%;
  }
}
</style>

<template>
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
        :avatar="avatar"
        size="xl"
      />
      <span
        class="photo-badge"
        aria-hidden="true"
      ><i class="pi pi-camera"></i></span>
    </button>
    <div class="profile-text">
      <h2 id="settings-profile-name">{{ user?.name }}</h2>
      <VanguardaBadge
        v-if="user?.badges?.includes('vanguarda')"
        class="profile-badge"
      />
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
        v-if="user?.isPublic"
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

  <SettingsGroup
    :title="t('settings.groups.profile')"
    title-id="settings-group-profile"
  >
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
  </SettingsGroup>

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
          :avatar="avatar"
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
          :class="{ selected: photoVisibility === option }"
        >
          <input
            type="radio"
            name="settings-photo-visibility"
            :value="option"
            :checked="photoVisibility === option"
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
    :initial-visibility="photoVisibility"
    @saved="onPhotoSaved"
  />

  <!-- Nome de usuário ou e-mail, com a senha atual -->
  <AppDialog
    v-model:visible="accountDialog.visible"
    size="sm"
    :header="accountDialog.field === 'email' ? t('settings.account.emailTitle') : t('settings.account.usernameTitle')"
  >
    <form
      class="sheet-stack"
      novalidate
      @submit.prevent="saveAccount"
    >
      <p class="sheet-text">{{ accountDialog.field === 'email' ? t('settings.account.emailHint') : t('settings.account.usernameHint') }}</p>
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
      <PasswordField
        id="settings-account-password"
        ref="accountPasswordField"
        v-model="accountDialog.password"
        :label="t('settings.password.current')"
        autocomplete="current-password"
        :error="accountDialog.errors.password"
      />
      <AppButton
        type="submit"
        :label="t('common.save')"
        class="btn-primary sheet-start"
        :loading="accountDialog.saving"
      />
    </form>
  </AppDialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import AvatarCropSheet from '../AvatarCropSheet.vue'
import VanguardaBadge from '../VanguardaBadge.vue'
import PasswordField from '../form/PasswordField.vue'
import TextField from '../form/TextField.vue'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { currentUser as user, isEmailVerified as emailVerified, updateUser, setUser } from '../../services/session.js'
import { USERNAME_PATTERN, EMAIL_PATTERN } from '../../utils/accountRules.js'
import { focusFirstError } from '../../utils/formState.js'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

// ---------------------------------------------------------------- foto de perfil
// No celular as folhas sobem de baixo; no desktop, janelas
const photoSheetOpen = ref(false)
const photoInput = ref(null)
const pickedPhoto = ref(null)
const cropOpen = ref(false)
const removingPhoto = ref(false)
const savingPhotoVisibility = ref(false)

const avatar = computed(() => user.value?.avatarHidden ? null : (user.value?.avatarVersion ?? null))
const photoVisibility = computed(() => user.value?.avatarVisibility || 'followers')

const photoStatus = computed(() => {
  if (!user.value?.avatarVersion) return t('avatar.none')
  return t(`avatar.visibilityShort.${photoVisibility.value}`)
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
  const before = user.value?.avatarVisibility
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

// ------------------------------------------------- nome de usuário e e-mail
const accountDialog = reactive({ visible: false, field: 'username', value: '', password: '', saving: false, errors: { value: '', password: '' } })
const accountValueField = ref(null)
const accountPasswordField = ref(null)
const accountFields = { value: accountValueField, password: accountPasswordField }

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
    focusFirstError(accountDialog.errors, accountFields)
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
    focusFirstError(accountDialog.errors, accountFields)
  } finally {
    accountDialog.saving = false
  }
}
</script>

<style scoped>
/* Cabeçalho de perfil */
.profile-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
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
  gap: var(--space-1);
  padding: 0.05rem var(--space-2);
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
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0;
  padding: var(--space-3) var(--space-4);
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

/* Folha da foto */
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

@media (max-width: 639.98px) {
  .profile-card {
    padding: var(--space-4);
  }
}
</style>

<template>
  <SettingsGroup
    :title="t('settings.groups.privacy')"
    title-id="settings-group-privacy"
    anchor="settings-privacy"
  >
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
          :disabled="saving || (!emailVerified && !isPublic)"
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
          :disabled="saving || (!emailVerified && !allowIndexing)"
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
          :disabled="saving || !isPublic || (!emailVerified && !showInCommunity)"
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
          :disabled="saving || (!emailVerified && !showActivity)"
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

    <template #after>
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
    </template>
  </SettingsGroup>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from './SettingsGroup.vue'
import SettingsRow from './SettingsRow.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { currentUser as user, isEmailVerified as emailVerified, updateUser } from '../../services/session.js'

const { t } = useI18n()
const toast = useToast()

const isPublic = computed(() => Boolean(user.value?.isPublic))
const showInCommunity = computed(() => Boolean(user.value?.showInCommunity))
const showActivity = computed(() => Boolean(user.value?.showActivity))
const allowIndexing = computed(() => Boolean(user.value?.allowIndexing))
const publicUrl = computed(() => `${window.location.origin}/u/${encodeURIComponent(user.value?.name || '')}`)

const saving = ref(false)
const copied = ref(false)

const PRIVACY_MESSAGES = {
  isPublic: ['settings.public.on', 'settings.public.off'],
  showInCommunity: ['settings.community.on', 'settings.community.off'],
  showActivity: ['settings.activity.on', 'settings.activity.off'],
  allowIndexing: ['settings.indexing.on', 'settings.indexing.off']
}

async function savePrivacy(field, value) {
  saving.value = true
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
    saving.value = false
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

// ------------------------------------------------------------- bloqueados
const blockedSheetOpen = ref(false)
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
</script>

<style scoped>
.blocked-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.blocked-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.blocked-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<template>
  <div class="follow-area">
    <template v-if="viewer?.isOwner">
      <span class="owner-note">{{ t('profile.own_page') }}</span>
      <router-link
        :to="{ name: 'settings' }"
        class="owner-link"
      >{{ t('profile.privacy_settings') }}</router-link>
      <AppButton
        :label="t('publicPage.share')"
        icon="pi pi-share-alt"
        class="btn-outlined btn-secondary"
        @click="share"
      />
    </template>

    <template v-else-if="viewer">
      <!-- Bloqueado por mim: só o desbloquear -->
      <AppButton
        v-if="viewer.blockedByMe"
        :label="t('block.unblock')"
        icon="pi pi-lock-open"
        class="btn-outlined btn-secondary"
        :loading="blockBusy"
        @click="unblock"
      />
      <AppButton
        v-else-if="followStatus === 'accepted'"
        :label="t('profile.following')"
        icon="pi pi-check"
        class="btn-outlined btn-secondary"
        :loading="followBusy"
        @click="unfollow"
      />
      <AppButton
        v-else-if="followStatus === 'pending'"
        :label="t('profile.cancel_request')"
        icon="pi pi-clock"
        class="btn-outlined btn-secondary"
        :loading="followBusy"
        @click="unfollow"
      />
      <AppButton
        v-else-if="profile.acceptsFollowers"
        :label="t('profile.follow')"
        icon="pi pi-user-plus"
        class="btn-primary"
        :loading="followBusy"
        @click="follow"
      />
      <IconButton
        icon="pi pi-share-alt"
        :label="t('publicPage.share')"
        class="share-btn"
        @click="share"
      />
      <IconButton
        v-if="!viewer.blockedByMe"
        icon="pi pi-ellipsis-h"
        :label="t('block.moreActions')"
        class="more-btn"
        aria-haspopup="true"
        aria-controls="profile-more-menu"
        @click="event => moreMenu.toggle(event)"
      />
      <PopupMenu
        id="profile-more-menu"
        ref="moreMenu"
        :items="moreItems"
      />
      <ReportDialog
        v-if="profile.avatarVersion"
        v-model:visible="reportAvatarOpen"
        kind="avatar"
        :username="displayName"
      />
      <ReportDialog
        v-if="profile.bio"
        v-model:visible="reportBioOpen"
        kind="bio"
        :username="displayName"
      />
    </template>

    <!-- Sem sessão: o mesmo botão Seguir, que leva ao login e volta para cá -->
    <router-link
      v-else-if="profile.acceptsFollowers"
      :to="{ name: 'login', query: { redirect: route.fullPath } }"
      class="btn btn-primary"
      :title="t('profile.login_to_follow')"
    >
      <i
        class="pi pi-user-plus"
        aria-hidden="true"
      ></i>
      <span>{{ t('profile.follow') }}</span>
    </router-link>
    <IconButton
      v-if="!viewer"
      icon="pi pi-share-alt"
      :label="t('publicPage.share')"
      class="share-btn"
      @click="share"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import PopupMenu from '../ui/PopupMenu.vue'
import IconButton from '../form/IconButton.vue'
import ReportDialog from '../review/ReportDialog.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { shareLink } from '../../utils/share.js'

/**
 * Ações do topo da página pública: seguir (ou pedir), compartilhar e o menu
 * ⋯ com denunciar e bloquear. O dono vê o próprio aviso e o compartilhar;
 * sem sessão, o Seguir leva ao login e volta.
 *
 * O perfil é do pai: as mudanças voltam pelos eventos `viewer` (campos novos
 * de profile.viewer) e `blocked`; depois de desbloquear, `reload` (do pai)
 * busca o perfil de novo antes do aviso.
 */
const props = defineProps({
  profile: { type: Object, required: true },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  reload: { type: Function, required: true }
})
const emit = defineEmits(['viewer', 'blocked'])

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const confirm = useConfirm()

const viewer = computed(() => props.profile.viewer ?? null)
const followStatus = computed(() => viewer.value?.followStatus ?? null)
const followBusy = ref(false)
const blockBusy = ref(false)
const moreMenu = ref(null)

function fail(error) {
  toast.add({ severity: 'error', detail: error.message, life: 4000 })
}

async function share() {
  api.trackPublicPage(props.username, 'share')
  const url = `${window.location.origin}/u/${encodeURIComponent(props.username)}`
  const result = await shareLink({ title: t('publicPage.shareText', { name: props.displayName }), text: props.profile.bio || undefined, url })
  if (result === 'copied') toast.add({ severity: 'success', detail: t('publicPage.copied'), life: 3000 })
  else if (result === 'failed') toast.add({ severity: 'error', detail: t('publicPage.shareFailed'), life: 4000 })
}

async function follow() {
  followBusy.value = true
  try {
    const result = await api.follow(props.username)
    emit('viewer', { followStatus: result.status })
    toast.add({ severity: 'success', detail: t('profile.request_sent'), life: 3000 })
  } catch (error) {
    fail(error)
  } finally {
    followBusy.value = false
  }
}

async function unfollow() {
  followBusy.value = true
  try {
    await api.unfollow(props.username)
    emit('viewer', { followStatus: null })
  } catch (error) {
    fail(error)
  } finally {
    followBusy.value = false
  }
}

// Denunciar a foto ou a apresentação: só quando aparecem (e não é a minha página)
const reportAvatarOpen = ref(false)
const reportBioOpen = ref(false)
const moreItems = computed(() => [
  ...(props.profile.avatarVersion ? [{ label: t('avatar.report'), icon: 'pi pi-flag', command: () => { reportAvatarOpen.value = true } }] : []),
  ...(props.profile.bio ? [{ label: t('publicPage.reportBio'), icon: 'pi pi-flag', command: () => { reportBioOpen.value = true } }] : []),
  { label: t('block.block', { name: props.username }), icon: 'pi pi-ban', command: askBlock }
])

function askBlock() {
  confirm.require({
    header: t('block.confirmTitle', { name: props.username }),
    message: t('block.confirmText'),
    icon: 'pi pi-ban',
    acceptLabel: t('block.confirmButton'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    accept: block
  })
}

async function block() {
  blockBusy.value = true
  try {
    await api.block(props.username)
    emit('blocked')
    toast.add({ severity: 'success', detail: t('block.blocked', { name: props.username }), life: 4000 })
  } catch (error) {
    fail(error)
  } finally {
    blockBusy.value = false
  }
}

async function unblock() {
  blockBusy.value = true
  try {
    await api.unblock(props.username)
    await props.reload()
    toast.add({ severity: 'success', detail: t('block.unblocked', { name: props.username }), life: 3000 })
  } catch (error) {
    fail(error)
  } finally {
    blockBusy.value = false
  }
}
</script>

<style scoped>
.follow-area {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.owner-note {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.owner-link {
  color: var(--main-color);
  font-size: var(--fs-md);
}

@media (max-width: 639.98px) {
  /* Seguir na largura toda; compartilhar e ⋯ ao lado */
  .follow-area {
    width: 100%;
    flex-wrap: nowrap;
  }

  .follow-area .btn {
    flex: 1;
  }
}
</style>

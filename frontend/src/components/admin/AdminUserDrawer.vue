<template>
  <AppDialog
    :visible="Boolean(userId)"
    drawer
    :header="user ? `@${user.username}` : t('admin.user.title')"
    :panel-style="{ width: 'min(560px, 100vw)' }"
    @update:visible="value => !value && emit('close')"
  >
    <div class="drawer-body">
      <p
        v-if="loading && !user"
        class="muted"
        role="status"
      >{{ t('common.loading') }}</p>
      <p
        v-else-if="failed"
        class="muted"
      >{{ t('common.loadError') }}</p>

      <template v-else-if="user">
        <div class="tags">
          <span
            v-if="user.isAdmin"
            class="tag admin"
          >{{ t('admin.accounts.adminTag') }}</span>
          <span
            class="tag"
            :class="user.active ? 'active' : 'suspended'"
          >{{ user.active ? t('admin.user.active') : t('admin.accounts.suspendedTag') }}</span>
          <span
            v-if="!user.emailVerifiedAt"
            class="tag pending"
          >{{ t('admin.accounts.unverifiedTag') }}</span>
          <a
            v-if="user.privacy.isPublic && user.active"
            class="public-link"
            :href="`/u/${encodeURIComponent(user.username)}`"
            target="_blank"
            rel="noopener"
          >{{ t('admin.user.openPublic') }} <i
              class="pi pi-external-link"
              aria-hidden="true"
            ></i></a>
        </div>

        <p
          v-if="!user.active"
          class="suspension"
        >{{ t('admin.accounts.suspendedOn', { date: formatDate(user.suspendedAt, locale) }) }}<template v-if="user.suspendedReason"> — {{ user.suspendedReason }}</template></p>

        <section aria-labelledby="user-account">
          <h3 id="user-account">{{ t('admin.user.account') }}</h3>
          <dl>
            <div><dt>{{ t('admin.accounts.cols.email') }}</dt><dd>{{ user.email }} <span class="muted">({{ user.emailLocale }})</span></dd></div>
            <div><dt>{{ t('admin.user.created') }}</dt><dd>{{ formatDateTime(user.createdAt, locale) }}</dd></div>
            <div><dt>{{ t('admin.user.verified') }}</dt><dd>{{ user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt, locale) : t('admin.user.notVerified') }}</dd></div>
            <div><dt>{{ t('admin.user.lastLogin') }}</dt><dd>{{ user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('admin.accounts.never') }}</dd></div>
            <div><dt>{{ t('admin.user.lastSeen') }}</dt><dd>{{ user.lastSeenAt ? formatDateTime(user.lastSeenAt, locale) : t('admin.accounts.never') }}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="user-privacy">
          <h3 id="user-privacy">{{ t('admin.user.privacy') }}</h3>
          <ul class="flags">
            <li
              v-for="(on, key) in user.privacy"
              :key="key"
              :class="{ on }"
            >
              <i
                :class="on ? 'pi pi-check' : 'pi pi-minus'"
                aria-hidden="true"
              ></i>
              {{ t(`admin.user.flags.${key}`) }}<span class="sr-only">: {{ on ? t('admin.system.yes') : t('admin.system.no') }}</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="user-totals">
          <h3 id="user-totals">{{ t('admin.user.totals') }}</h3>
          <dl class="totals">
            <div><dt>{{ t('admin.user.t.books') }}</dt><dd>{{ user.totals.books }} <small>{{ t('admin.user.t.read', { n: user.totals.readBooks }) }}</small></dd></div>
            <div><dt>{{ t('admin.user.t.reviews') }}</dt><dd>{{ user.totals.reviews }} <small v-if="user.totals.hiddenReviews">{{ t('admin.user.t.hidden', { n: user.totals.hiddenReviews }) }}</small></dd></div>
            <div><dt>{{ t('admin.user.t.lists') }}</dt><dd>{{ user.totals.lists }} <small>{{ t('admin.user.t.public', { n: user.totals.publicLists }) }}</small></dd></div>
            <div><dt>{{ t('admin.user.t.follow') }}</dt><dd>{{ user.totals.followers }} / {{ user.totals.following }}</dd></div>
            <div><dt>{{ t('admin.user.t.blocks') }}</dt><dd>{{ user.totals.blocksMade }} / {{ user.totals.blockedBy }}</dd></div>
            <div><dt>{{ t('admin.user.t.reports') }}</dt><dd :class="{ warn: user.totals.reportsReceived }">{{ user.totals.reportsReceived }} / {{ user.totals.reportsMade }}</dd></div>
          </dl>
          <p
            v-if="user.totals.lastBookAt"
            class="muted after"
          >{{ t('admin.user.lastBook', { date: formatDate(user.totals.lastBookAt, locale) }) }}</p>
        </section>

        <section
          v-if="user.reportedReviews.length"
          aria-labelledby="user-reported"
        >
          <h3 id="user-reported">{{ t('admin.user.reportedReviews') }}</h3>
          <ul class="list">
            <li
              v-for="review in user.reportedReviews"
              :key="review.id"
            >
              <span class="strong">{{ review.book }}</span>
              <span class="muted">{{ t('admin.user.reviewReports', { n: review.reports, open: review.open }) }}<template v-if="review.hidden"> · {{ t('admin.moderation.hidden') }}</template></span>
            </li>
          </ul>
        </section>

        <section
          v-if="user.history.length"
          aria-labelledby="user-history"
        >
          <h3 id="user-history">{{ t('admin.user.history') }}</h3>
          <ul class="list">
            <li
              v-for="item in user.history"
              :key="item.id"
            >
              <span class="strong">{{ t(`admin.log.actions.${item.action.replace('.', '_')}`) }}</span>
              <span class="muted">{{ formatDateTime(item.createdAt, locale) }}<template v-if="item.admin"> · @{{ item.admin }}</template><template v-if="item.details?.reason"> — {{ item.details.reason }}</template></span>
            </li>
          </ul>
        </section>

        <div
          v-if="!user.isAdmin"
          class="actions"
        >
          <AppButton
            v-if="user.active && !user.emailVerifiedAt"
            :label="t('admin.user.resend')"
            icon="pi pi-envelope"
            class="btn-outlined btn-sm"
            :loading="resending"
            @click="resend"
          />
          <AppButton
            v-if="user.active"
            :label="t('admin.accounts.suspend')"
            icon="pi pi-ban"
            class="btn-danger btn-outlined btn-sm"
            @click="openDialog('suspend')"
          />
          <AppButton
            v-else
            :label="t('admin.accounts.reactivate')"
            icon="pi pi-replay"
            class="btn-sm"
            @click="openDialog('reactivate')"
          />
        </div>
      </template>
    </div>
  </AppDialog>

  <AppDialog
    v-model:visible="dialog.visible"
    size="sm"
    :header="dialog.mode === 'suspend' ? t('admin.accounts.suspendTitle', { name: user?.username }) : t('admin.accounts.reactivateTitle', { name: user?.username })"
    :closable="!dialog.busy"
  >
    <form
      class="stack"
      novalidate
      @submit.prevent="confirmDialog"
    >
      <p class="desc">{{ dialog.mode === 'suspend' ? t('admin.accounts.suspendDesc') : t('admin.accounts.reactivateDesc') }}</p>
      <TextField
        v-if="dialog.mode === 'suspend'"
        id="admin-suspend-reason"
        ref="reasonField"
        v-model="dialog.reason"
        :label="t('admin.accounts.reason')"
        :hint="t('admin.accounts.reasonHint')"
        :error="dialog.reasonError"
        maxlength="500"
        multiline
        rows="3"
        required
      />
      <PasswordField
        id="admin-confirm-password"
        ref="passwordField"
        v-model="dialog.password"
        :label="t('admin.accounts.password')"
        autocomplete="current-password"
        :error="dialog.passwordError"
        required
      />
      <div class="dialog-actions">
        <AppButton
          :label="t('common.cancel')"
          class="btn-text btn-secondary"
          :disabled="dialog.busy"
          @click="dialog.visible = false"
        />
        <AppButton
          type="submit"
          :label="dialog.mode === 'suspend' ? t('admin.accounts.suspend') : t('admin.accounts.reactivate')"
          :icon="dialog.mode === 'suspend' ? 'pi pi-ban' : 'pi pi-replay'"
          :class="dialog.mode === 'suspend' ? 'btn-danger' : ''"
          :loading="dialog.busy"
        />
      </div>
    </form>
  </AppDialog>
</template>

<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import TextField from '../form/TextField.vue'
import PasswordField from '../form/PasswordField.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDate, formatDateTime } from './adminCall.js'

/**
 * Gaveta com tudo de uma conta (menos senha, livros e anotações) e as ações:
 * reenviar confirmação, suspender, reativar.
 */
const props = defineProps({
  userId: { type: Number, default: null }
})
const emit = defineEmits(['close', 'changed'])

const { t, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()

const user = ref(null)
const loading = ref(false)
const failed = ref(false)
const resending = ref(false)
const reasonField = ref(null)
const passwordField = ref(null)
const dialog = reactive({ visible: false, mode: 'suspend', reason: '', password: '', reasonError: '', passwordError: '', busy: false })

async function load() {
  if (!props.userId) return
  loading.value = true
  failed.value = false
  try {
    user.value = await call(() => api.adminUser(props.userId))
  } catch (error) {
    if (error instanceof LockedError) emit('close')
    else failed.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.userId, id => {
  user.value = null
  if (id) load()
})

async function resend() {
  resending.value = true
  try {
    await call(() => api.adminResendVerification(user.value.id))
    toast.add({ severity: 'success', summary: t('admin.user.resent', { email: user.value.email }), life: 4000 })
    await load()
    emit('changed')
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
  } finally {
    resending.value = false
  }
}

async function openDialog(mode) {
  Object.assign(dialog, { visible: true, mode, reason: '', password: '', reasonError: '', passwordError: '', busy: false })
  await nextTick()
  ;(mode === 'suspend' ? reasonField : passwordField).value?.focus()
}

async function confirmDialog() {
  dialog.reasonError = ''
  dialog.passwordError = ''
  const reason = dialog.reason.trim()
  if (dialog.mode === 'suspend' && reason.length < 3) {
    dialog.reasonError = t('admin.accounts.reasonRequired')
    reasonField.value?.focus()
    return
  }
  if (!dialog.password) {
    dialog.passwordError = t('errors.CURRENT_PASSWORD_REQUIRED')
    passwordField.value?.focus()
    return
  }
  dialog.busy = true
  const name = user.value.username
  try {
    if (dialog.mode === 'suspend') await call(() => api.adminSuspendUser(user.value.id, dialog.password, reason))
    else await call(() => api.adminReactivateUser(user.value.id, dialog.password))
    toast.add({ severity: 'success', summary: t(dialog.mode === 'suspend' ? 'admin.accounts.suspendedDone' : 'admin.accounts.reactivatedDone', { name }), life: 3000 })
    dialog.visible = false
    await load()
    emit('changed')
  } catch (error) {
    if (error instanceof LockedError) {
      dialog.visible = false
    } else if (error.code === 'CURRENT_PASSWORD_WRONG' || error.code === 'CURRENT_PASSWORD_REQUIRED') {
      dialog.passwordError = error.message
      dialog.password = ''
      passwordField.value?.focus()
    } else {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
    }
  } finally {
    dialog.busy = false
  }
}
</script>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 1rem;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.tag {
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  color: var(--text-primary);
}

.tag.admin { background: rgba(var(--main-color-rgb), 0.18); }
.tag.active { background: rgba(var(--green-rgb), 0.16); }
.tag.suspended { background: rgba(var(--red-rgb), 0.18); }
.tag.pending { background: var(--bg-input); color: var(--text-secondary); }

.public-link {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: var(--main-color);
}

.suspension {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  background: rgba(var(--red-rgb), 0.1);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

h3 {
  margin: 0 0 0.6rem;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

dl div {
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 0.75rem;
  font-size: var(--fs-sm);
}

dt {
  color: var(--text-secondary);
}

dd {
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

dd small {
  color: var(--text-muted);
  margin-left: 0.25rem;
}

dd.warn {
  color: var(--orange);
  font-weight: 600;
}

.flags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem 1rem;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.flags li.on {
  color: var(--text-primary);
}

.flags .pi {
  width: 1rem;
  font-size: var(--fs-xs);
}

.flags li.on .pi {
  color: var(--green);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: var(--fs-sm);
}

.list li {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.strong {
  color: var(--text-primary);
  font-weight: 600;
}

.muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  margin: 0;
}

.muted.after {
  margin-top: 0.6rem;
}

.list .muted {
  font-size: var(--fs-xs);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>

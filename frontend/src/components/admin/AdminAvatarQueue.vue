<template>
  <section
    class="avatar-queue"
    :aria-label="t('admin.moderation.avatars.queue')"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <template v-if="loading">
      <AppSkeleton
        v-for="n in 3"
        :key="n"
        height="120px"
      />
    </template>
    <EmptyState
      v-else-if="failed"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="load"
    />
    <p
      v-else-if="items.length === 0"
      class="empty"
    >
      <i
        class="pi pi-check-circle"
        aria-hidden="true"
      ></i>
      {{ t(`admin.moderation.avatars.empty.${status}`) }}
    </p>
    <ul
      v-else
      class="cards"
    >
      <li
        v-for="item in items"
        :key="item.userId"
        class="card"
      >
        <img
          :src="imageUrl(item)"
          :alt="t('moderation.avatarAlt', { name: item.username })"
          width="96"
          height="96"
          class="photo"
          loading="lazy"
        />
        <div class="info">
          <span class="head">
            <button
              type="button"
              class="person"
              @click="emit('open-user', item.userId)"
            >@{{ item.username }}</button>
            <span
              class="state-tag"
              :class="item.hidden ? 'hidden' : 'visible'"
            >{{ item.hidden ? t('admin.moderation.hidden') : t('admin.moderation.visible') }}</span>
            <span
              v-if="!item.active"
              class="state-tag hidden"
            >{{ t('admin.accounts.suspendedTag') }}</span>
          </span>
          <span class="meta">
            <span
              v-if="item.reports.open"
              class="count open"
            >{{ t('admin.moderation.openCount', { n: item.reports.open }, item.reports.open) }}</span>
            <span
              v-else
              class="count"
            >{{ t('admin.moderation.totalCount', { n: item.reports.total }, item.reports.total) }}</span>
            <span>{{ item.reports.reasons.map(reason => t(`avatar.reasons.${reason}`)).join(', ') }}</span>
          </span>
          <span class="actions">
            <AppButton
              :label="t('moderation.avatarRemove')"
              icon="pi pi-trash"
              class="btn-danger btn-sm"
              :loading="busy === `${item.userId}:remove`"
              :disabled="Boolean(busy)"
              @click="act(item, 'remove')"
            />
            <AppButton
              :label="item.hidden ? t('moderation.avatarRestore') : t('moderation.avatarKeep')"
              icon="pi pi-check"
              class="btn-outlined btn-secondary btn-sm"
              :loading="busy === `${item.userId}:keep`"
              :disabled="Boolean(busy)"
              @click="act(item, 'keep')"
            />
          </span>
        </div>
      </li>
    </ul>
    <p class="hint">{{ t('moderation.avatarHint') }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { API_URL } from '../../config/site.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall } from './adminCall.js'

/** Fotos de perfil denunciadas: manter (zera as denúncias) ou remover. */
const props = defineProps({
  status: { type: String, default: 'open' } // open | hidden | all
})
const emit = defineEmits(['open-user', 'changed'])
const { t } = useI18n()
const toast = useToast()
const call = useAdminCall()

const items = ref([])
const loading = ref(true)
const failed = ref(false)
const busy = ref('')

const imageUrl = item => `${API_URL}/admin/avatars/${item.userId}/image?v=${item.version}`

async function load() {
  loading.value = true
  failed.value = false
  try {
    items.value = await call(() => api.adminAvatarReports(props.status))
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

async function act(item, action) {
  busy.value = `${item.userId}:${action}`
  try {
    await call(() => api.adminModerateAvatar(item.userId, action))
    toast.add({ severity: 'success', summary: action === 'remove' ? t('moderation.avatarRemovedDone') : t('moderation.avatarKeptDone'), life: 3000 })
    emit('changed')
    await load()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = ''
  }
}

watch(() => props.status, load)
onMounted(load)
</script>

<style scoped>
.avatar-queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-secondary);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
}

.photo {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-input);
}

.info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.head,
.meta,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.meta {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.person {
  padding: 0;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.person:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.state-tag {
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.state-tag.visible {
  background: rgba(var(--green-rgb), 0.12);
  color: var(--green);
}

.state-tag.hidden {
  background: rgba(var(--orange-rgb), 0.14);
  color: var(--orange);
}

.count.open {
  color: var(--text-primary);
  font-weight: 600;
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
</style>

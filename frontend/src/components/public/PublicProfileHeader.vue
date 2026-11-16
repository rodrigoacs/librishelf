<template>
  <!-- Topo: quem é, números em linha, seguir e compartilhar -->
  <PageHeader :title="t('publicLibrary.title', { ownerName: displayName })">
    <template #lead>
      <ReaderAvatar
        :username="displayName"
        :avatar="profile?.avatarVersion ?? null"
        size="lg"
      />
    </template>
    <template #subtitle>
      <p class="owner-meta">
        <span class="handle">@{{ username }}</span>
        <VanguardaBadge
          v-if="profile?.badges?.includes('vanguarda')"
          class="owner-badge"
        />
      </p>
      <p
        v-if="profile"
        class="owner-counts"
      >
        <span>{{ t('publicPage.counts.books', { n: stats.totalBooks ?? 0 }, stats.totalBooks ?? 0) }}</span>
        <span>{{ t('publicPage.counts.read', { n: stats.readBooks ?? 0 }, stats.readBooks ?? 0) }}</span>
        <span v-if="stats.averageRating">
          <i
            class="pi pi-star-fill star"
            aria-hidden="true"
          ></i>
          {{ formatAverage(stats.averageRating) }}
          <span class="sr-only">{{ t('profile.avg_rating', { n: stats.ratedBooks }, stats.ratedBooks) }}</span>
        </span>
        <span v-if="viewer && !viewer.isOwner && viewer.commonCount">{{ t('publicPage.counts.common', { n: viewer.commonCount }, viewer.commonCount) }}</span>
      </p>
    </template>
    <template
      v-if="profile"
      #actions
    >
      <PublicFollowActions
        :profile="profile"
        :username="username"
        :display-name="displayName"
        :reload="reload"
        @viewer="change => emit('viewer', change)"
        @blocked="emit('blocked')"
      />
    </template>
  </PageHeader>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '../ui/PageHeader.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import VanguardaBadge from '../VanguardaBadge.vue'
import PublicFollowActions from './PublicFollowActions.vue'

/** Cabeçalho da página pública: avatar, nome, @, números e as ações. */
const props = defineProps({
  // null enquanto o perfil carrega (o título já aparece com o nome da URL)
  profile: { type: Object, default: null },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  reload: { type: Function, required: true }
})
const emit = defineEmits(['viewer', 'blocked'])

const { t, locale } = useI18n()

const stats = computed(() => props.profile?.stats ?? {})
const viewer = computed(() => props.profile?.viewer ?? null)

function formatAverage(value) {
  return Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
</script>

<style scoped>
.handle {
  font-weight: 600;
}

.owner-meta {
  margin: 0;
  color: var(--text-secondary);
}

/* Linha de números no topo: "320 livros · 210 lidos · ★ 4,1" */
.owner-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-2);
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.owner-counts > span + span::before {
  content: '·';
  margin-right: var(--space-2);
  color: var(--text-muted);
}

.star {
  color: var(--rating);
  font-size: var(--fs-xs);
}
</style>

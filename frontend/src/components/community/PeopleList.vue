<template>
  <ul
    v-if="skeleton"
    class="people-list skeleton-list"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <li
      v-for="n in 3"
      :key="n"
    >
      <span class="person">
        <AppSkeleton
          width="40px"
          height="40px"
          border-radius="50%"
        />
        <AppSkeleton
          width="9rem"
          height="1rem"
        />
      </span>
    </li>
  </ul>
  <EmptyState
    v-else-if="error"
    variant="error"
    compact
    :level="3"
    :title="t('communityView.load_error')"
    :loading="retrying"
    @action="emit('retry')"
  />
  <EmptyState
    v-else-if="people.length === 0"
    compact
    :level="3"
    :icon="emptyIcon"
    :title="emptyTitle"
  />
  <ul
    v-else
    class="people-list"
  >
    <li
      v-for="person in people"
      :key="person.username"
    >
      <span class="person">
        <ReaderAvatar
          :username="person.username"
          :avatar="person.avatarVersion ?? null"
        />
        <slot
          name="info"
          :person="person"
        >
          <ReaderName
            :username="person.username"
            :is-public="person.isPublic"
          />
        </slot>
      </span>
      <!-- Ações das linhas (D9): botão pequeno contornado para agir (seguir,
           recusar, deixar de seguir, remover); link só para navegar
           ("Ver estante") -->
      <div class="actions">
        <slot
          name="actions"
          :person="person"
        />
      </div>
    </li>
  </ul>
</template>

<script setup>
// Lista de leitores da Comunidade (pedidos, seguindo, seguidores, encontrar):
// esqueleto, erro com "Tentar de novo", vazio e as linhas com avatar e nome.
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import ReaderName from '../ReaderName.vue'

defineProps({
  people: { type: Array, required: true },
  skeleton: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  retrying: { type: Boolean, default: false },
  emptyIcon: { type: String, required: true },
  emptyTitle: { type: String, required: true }
})

const emit = defineEmits(['retry'])

const { t } = useI18n()
</script>

<style scoped>
.people-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.person {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  max-width: 100%;
}

.people-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-color);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Selo de situação ("Pendente", "Seguindo") que as telas põem nas ações */
.actions :deep(.status-pill) {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  padding: 0.15rem var(--space-2);
}

.actions :deep(.status-pill.ok) {
  color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.12);
}

@media (max-width: 639.98px) {
  .people-list li {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
}
</style>

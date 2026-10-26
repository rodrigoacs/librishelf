<template>
  <div class="lists-page">
    <div class="lists-content">
      <div class="view-header">
        <div class="header-text">
          <h1>{{ t('lists.title') }}</h1>
          <p>{{ t('lists.subtitle') }}</p>
        </div>
        <AppButton
          v-if="lists.length"
          :label="t('lists.new')"
          icon="pi pi-plus"
          class="btn-primary"
          :disabled="isOffline"
          @click="formOpen = true"
        />
      </div>

      <div
        v-if="loading"
        class="grid"
        aria-busy="true"
        :aria-label="t('common.loading')"
      >
        <AppSkeleton
          v-for="n in 3"
          :key="n"
          height="13rem"
          border-radius="12px"
        />
      </div>

      <div
        v-else-if="loadError"
        class="empty"
      >
        <p>{{ t('lists.loadFailed') }}</p>
        <AppButton
          :label="t('common.retry')"
          class="btn-outlined btn-secondary"
          @click="load"
        />
      </div>

      <div
        v-else-if="!lists.length"
        class="empty"
      >
        <span
          class="empty-icon"
          aria-hidden="true"
        ><i class="pi pi-list"></i></span>
        <h2>{{ t('lists.emptyTitle') }}</h2>
        <p>{{ t('lists.emptyText') }}</p>
        <AppButton
          :label="t('lists.createFirst')"
          icon="pi pi-plus"
          class="btn-primary"
          :disabled="isOffline"
          @click="formOpen = true"
        />
      </div>

      <ul
        v-else
        class="grid"
      >
        <li
          v-for="list in lists"
          :key="list.id"
        >
          <ListCard
            :list="list"
            :to="{ name: 'list', params: { id: list.id } }"
            show-visibility
          />
        </li>
      </ul>
    </div>

    <ListFormDialog
      v-model:visible="formOpen"
      @saved="onCreated"
    />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import ListCard from '../components/list/ListCard.vue'
import ListFormDialog from '../components/list/ListFormDialog.vue'
import api from '../services/api.js'
import { isOffline } from '../services/network.js'

/** Minhas listas ("Melhores de 2026", "Para as férias"…). */
const { t } = useI18n()
const router = useRouter()

const lists = ref([])
const loading = ref(true)
const loadError = ref(false)
const formOpen = ref(false)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    lists.value = (await api.getLists()).lists
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function onCreated(list) {
  router.push({ name: 'list', params: { id: list.id }, query: { added: 'new' } })
}

onMounted(load)
</script>

<style scoped>
.lists-page {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.lists-content {
  max-width: 1080px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grid > li {
  display: flex;
  min-width: 0;
}

.grid > li > * {
  flex: 1;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 28rem;
  margin: 3rem auto;
  text-align: center;
  color: var(--text-secondary);
}

.empty h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  color: var(--text-primary);
}

.empty p {
  margin: 0 0 0.5rem;
  line-height: 1.5;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: rgba(var(--main-color-rgb), 0.1);
  color: var(--main-color);
  font-size: 1.5rem;
}

@media (max-width: 640px) {
  .lists-page {
    padding: 1.25rem;
  }

  .view-header h1 {
    font-size: var(--fs-2xl);
  }
}
</style>

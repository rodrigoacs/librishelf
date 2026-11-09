<template>
  <SearchField
    id="discover-search"
    v-model="query"
    :label="t('discover.search_label')"
    :placeholder="t('discover.search_ph')"
    maxlength="50"
    @input="search"
  />
  <p class="hint">
    {{ query.trim() ? t('discover.results_hint') : t('discover.suggest_hint') }}
    <template v-if="!user?.showInCommunity">
      <router-link :to="{ name: 'settings' }">{{ t('discover.join') }}</router-link>
    </template>
  </p>

  <PeopleList
    :people="readers"
    :skeleton="loading && readers.length === 0"
    :error="error"
    :empty-icon="query.trim() ? 'pi pi-search' : 'pi pi-users'"
    :empty-title="query.trim() ? t('discover.none_found') : t('discover.none_yet')"
    @retry="load"
  >
    <template #info="{ person: reader }">
      <span class="reader-info">
        <ReaderName
          :username="reader.username"
          :is-public="true"
        />
        <small class="reader-meta">
          {{ t('discover.books', { n: reader.totalBooks }, reader.totalBooks) }}
          <template v-if="reader.commonBooks"> · <strong>{{ t('discover.common', { n: reader.commonBooks }, reader.commonBooks) }}</strong></template>
        </small>
      </span>
    </template>
    <template #actions="{ person: reader }">
      <span
        v-if="reader.followStatus === 'accepted'"
        class="status-pill ok"
      >{{ t('discover.following') }}</span>
      <span
        v-else-if="reader.followStatus === 'pending'"
        class="status-pill"
      >{{ t('communityView.pending') }}</span>
      <AppButton
        v-else-if="reader.acceptsFollowers"
        :label="t('discover.follow')"
        icon="pi pi-user-plus"
        class="btn-sm btn-outlined"
        :loading="busy === reader.username"
        @click="follow(reader)"
      />
      <!-- Antes não aparecia nada: parecia que o botão Seguir tinha sumido -->
      <span
        v-else
        class="status-pill"
      >{{ t('discover.notAccepting') }}</span>
      <router-link
        :to="{ name: 'public-library', params: { username: reader.username } }"
        class="see-shelf"
      >{{ t('discover.see_shelf') }}</router-link>
    </template>
  </PeopleList>
</template>

<script setup>
// Aba "Encontrar leitores": sugestões e busca por nome. Carrega na primeira
// vez que a aba abre; avisa o pai ao seguir alguém (as abas de conexões mudam).
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../../services/toast.js'
import { currentUser as user } from '../../services/session.js'
import api from '../../services/api.js'
import AppButton from '../ui/AppButton.vue'
import SearchField from '../ui/SearchField.vue'
import ReaderName from '../ReaderName.vue'
import PeopleList from './PeopleList.vue'

const props = defineProps({
  active: { type: Boolean, default: false }
})

const emit = defineEmits(['followed'])

const { t } = useI18n()
const toast = useToast()

const query = ref('')
const readers = ref([])
const loading = ref(false)
const error = ref(false)
const busy = ref('')
let loaded = false
let searchTimer = null
let searchRequest = 0

async function load() {
  const current = ++searchRequest
  loading.value = true
  error.value = false
  try {
    const result = await api.findReaders(query.value.trim())
    if (current === searchRequest) readers.value = result
  } catch {
    // Falha não é "ninguém encontrado": mostra o erro com "Tentar de novo"
    if (current === searchRequest) {
      readers.value = []
      error.value = true
    }
  } finally {
    if (current === searchRequest) loading.value = false
    loaded = true
  }
}

function search() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}

async function follow(reader) {
  busy.value = reader.username
  try {
    const result = await api.follow(reader.username)
    reader.followStatus = result?.status ?? 'pending'
    toast.add({ severity: 'success', detail: t('discover.requested', { name: reader.username }), life: 3000 })
    emit('followed')
  } catch (err) {
    toast.add({ severity: 'error', detail: err.message, life: 4000 })
  } finally {
    busy.value = ''
  }
}

watch(() => props.active, active => {
  if (active && !loaded) load()
}, { immediate: true })
</script>

<style scoped>
.hint {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  margin: 0 0 var(--space-4);
}

.reader-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.reader-meta {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.reader-meta strong {
  color: var(--main-color);
  font-weight: 600;
}

.see-shelf {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.see-shelf:hover {
  color: var(--text-primary);
}
</style>

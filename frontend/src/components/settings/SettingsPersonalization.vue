<template>
  <!-- Personalização (Pro: personalization). Linhas que abrem folhas, como o
       resto da Conta. Sem Pro o que foi escolhido continua valendo; só
       "Padrão" fica disponível. O aviso do Pro fica no grupo do Plano. -->
  <section
    id="settings-personalization"
    class="settings-group"
    aria-labelledby="settings-group-personalization"
    tabindex="-1"
  >
    <h2
      id="settings-group-personalization"
      class="section-title group-title"
    >{{ t('personalization.title') }}</h2>

    <div class="group-list">
      <SettingsRow
        :label="t('personalization.palette.title')"
        :value="labelOf(paletteOptions, chosen.palette)"
        icon="pi pi-palette"
        interactive
        @click="sheet = 'palette'"
      />
      <SettingsRow
        :label="t('personalization.accent.title')"
        :value="labelOf(accentOptions, chosen.accent)"
        icon="pi pi-circle"
        interactive
        @click="sheet = 'accent'"
      />
      <SettingsRow
        :label="t('personalization.icon.title')"
        :value="labelOf(iconOptions, chosen.appIcon)"
        icon="pi pi-mobile"
        interactive
        @click="sheet = 'appIcon'"
      />
      <SettingsRow
        :label="t('personalization.cover.title')"
        :value="coverValue"
        icon="pi pi-image"
        interactive
        @click="sheet = 'profileCover'"
      />
    </div>

    <!-- Paleta, cor e ícone: mesma folha, escolha vale na hora -->
    <AppDialog
      :visible="Boolean(current)"
      size="sm"
      dialog-class="settings-sheet"
      :header="current?.title || ''"
      @update:visible="value => { if (!value) sheet = '' }"
    >
      <div
        v-if="current"
        class="sheet-stack"
      >
        <p
          v-if="!pro"
          class="sheet-note"
        >{{ t('personalization.proOnly') }}</p>
        <div
          class="swatches"
          role="radiogroup"
          :aria-label="current.title"
        >
          <button
            v-for="option in current.options"
            :key="option.value || 'default'"
            type="button"
            role="radio"
            class="swatch"
            :class="[`${current.kind}-swatch`, current.kind === 'palette' ? `palette-${option.value || 'default'}` : '', { active: chosen[sheet] === option.value }]"
            :aria-checked="chosen[sheet] === option.value"
            :disabled="busy || (option.value !== null && !pro)"
            @click="choose(sheet, option.value)"
          >
            <span
              v-if="current.kind === 'palette'"
              class="palette-sample"
              aria-hidden="true"
            ><span class="palette-panel"></span><span class="palette-line"></span></span>
            <span
              v-else-if="current.kind === 'accent'"
              class="accent-dot"
              :style="option.value ? { background: `var(--${option.value})` } : null"
              :class="{ free: !option.value }"
              aria-hidden="true"
            ></span>
            <img
              v-else
              :src="option.value ? `/icons/alt/${option.value}-192.png` : '/icons/icon-192.png'"
              alt=""
              width="48"
              height="48"
            >
            <span class="swatch-name">{{ option.label }}</span>
          </button>
        </div>
        <p
          v-if="current.help"
          class="sheet-help"
        >{{ current.help }}</p>
      </div>
    </AppDialog>

    <!-- Capa de fundo no perfil público -->
    <AppDialog
      :visible="sheet === 'profileCover'"
      size="sm"
      dialog-class="settings-sheet"
      :header="t('personalization.cover.title')"
      @update:visible="value => { if (!value) closeCoverSheet() }"
    >
      <div class="sheet-stack">
        <p class="sheet-help">{{ t('personalization.cover.help') }}</p>
        <p
          v-if="!pro"
          class="sheet-note"
        >{{ t('personalization.proOnly') }}</p>

        <img
          v-if="currentCoverUrl"
          :src="currentCoverUrl"
          :alt="t('personalization.cover.current')"
          class="cover-current"
          :class="{ wide: chosen.profileCover?.kind === 'image' }"
        >
        <p
          v-else
          class="sheet-help"
        >{{ t('personalization.cover.none') }}</p>

        <div class="cover-actions">
          <template v-if="pro">
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              class="sr-only"
              :aria-label="t('personalization.cover.upload')"
              @change="uploadImage"
            >
            <AppButton
              :label="t('personalization.cover.upload')"
              icon="pi pi-upload"
              class="btn-secondary"
              :loading="uploading"
              :disabled="busy"
              @click="imageInput?.click()"
            />
            <AppButton
              :label="t('personalization.cover.choose')"
              icon="pi pi-book"
              class="btn-secondary"
              :loading="coversLoading"
              :disabled="busy"
              :aria-expanded="coversOpen"
              @click="openCovers"
            />
          </template>
          <AppButton
            v-if="chosen.profileCover"
            :label="t('personalization.cover.remove')"
            class="btn-text btn-danger"
            :disabled="busy"
            @click="choose('profileCover', null)"
          />
        </div>

        <template v-if="coversOpen">
          <p
            v-if="!covers.length"
            class="sheet-help"
          >{{ t('personalization.cover.empty') }}</p>
          <ul
            v-else
            class="cover-grid"
          >
            <li
              v-for="cover in covers"
              :key="cover.bookId"
            >
              <button
                type="button"
                class="cover-pick"
                :class="{ active: chosen.profileCover?.kind === 'book' && chosen.profileCover.bookId === cover.bookId }"
                :aria-label="cover.title"
                :disabled="busy"
                @click="pickCover(cover)"
              >
                <img
                  :src="coverUrl(cover.bookId, cover.version)"
                  alt=""
                  loading="lazy"
                >
              </button>
            </li>
          </ul>
        </template>
      </div>
    </AppDialog>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { currentUser } from '../../services/session.js'
import { usePlan } from '../../services/plan.js'
import { useToast } from '../../services/toast.js'
import { coverUrl } from '../../utils/covers.js'
import { profileCoverUrl } from '../../utils/profileCover.js'
import { PRO_PALETTES, PRO_ACCENTS, APP_ICONS } from '../../composables/useTheme.js'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import SettingsRow from './SettingsRow.vue'

const { t } = useI18n()
const { canUse } = usePlan()
const toast = useToast()

const pro = computed(() => canUse('personalization'))
const chosen = computed(() => currentUser.value?.personalization ?? { palette: null, accent: null, appIcon: null, profileCover: null })

const withDefault = (values, prefix) => [
  { value: null, label: t(`personalization.${prefix}.default`) },
  ...values.map(value => ({ value, label: t(`personalization.${prefix}.options.${value}`) }))
]
const paletteOptions = computed(() => withDefault(Object.keys(PRO_PALETTES), 'palette'))
const accentOptions = computed(() => withDefault(PRO_ACCENTS, 'accent'))
const iconOptions = computed(() => withDefault(APP_ICONS, 'icon'))

const labelOf = (options, value) => options.find(option => option.value === value)?.label ?? options[0].label

const coverValue = computed(() => {
  const kind = chosen.value.profileCover?.kind
  return t(`personalization.cover.value.${kind === 'image' || kind === 'book' ? kind : 'none'}`)
})

// Folha aberta: '' | palette | accent | appIcon | profileCover
const sheet = ref('')
const current = computed(() => ({
  palette: { kind: 'palette', title: t('personalization.palette.title'), options: paletteOptions.value },
  accent: { kind: 'accent', title: t('personalization.accent.title'), options: accentOptions.value },
  appIcon: { kind: 'icon', title: t('personalization.icon.title'), options: iconOptions.value, help: t('personalization.icon.help') }
})[sheet.value] ?? null)

const busy = ref(false)

const currentCoverUrl = computed(() => profileCoverUrl(currentUser.value?.name, chosen.value.profileCover))

const FIELD = { palette: 'palette', accent: 'accent', appIcon: 'appIcon', profileCover: 'profileCoverBookId' }

// O /auth/me guarda a personalização; trocar aqui troca o tema na hora (useTheme observa)
function keep(fresh) {
  if (currentUser.value) currentUser.value.personalization = { palette: fresh.palette, accent: fresh.accent, appIcon: fresh.appIcon, profileCover: fresh.profileCover }
}

async function choose(item, value) {
  if (chosen.value[item] === value && item !== 'profileCover') return
  busy.value = true
  try {
    keep(value === null
      ? await api.resetPersonalization(item)
      : await api.savePersonalization({ [FIELD[item]]: value }))
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = false
  }
}

const coversOpen = ref(false)
const coversLoading = ref(false)
const covers = ref([])

async function openCovers() {
  if (coversOpen.value) {
    coversOpen.value = false
    return
  }
  coversLoading.value = true
  try {
    covers.value = await api.getPersonalizationCovers()
    coversOpen.value = true
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    coversLoading.value = false
  }
}

async function pickCover(cover) {
  await choose('profileCover', cover.bookId)
  coversOpen.value = false
}

function closeCoverSheet() {
  sheet.value = ''
  coversOpen.value = false
}

// Imagem qualquer do aparelho: o servidor reduz, gira pela câmera e tira o EXIF
const MAX_IMAGE_MB = 10
const imageInput = ref(null)
const uploading = ref(false)

async function uploadImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    toast.add({ severity: 'error', detail: t('errors.IMAGE_TOO_LARGE', { max: MAX_IMAGE_MB }) })
    return
  }
  uploading.value = true
  busy.value = true
  try {
    keep(await api.uploadProfileCoverImage(file))
    coversOpen.value = false
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    uploading.value = false
    busy.value = false
  }
}
</script>

<style scoped>
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
}

.group-list {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

/* Folhas */
.sheet-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sheet-help {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.sheet-note {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--space-2);
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 5.5rem;
  padding: var(--space-3) var(--space-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

.swatch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.swatch.active {
  border-color: var(--main-color);
  box-shadow: inset 0 0 0 1px var(--main-color);
  opacity: 1;
}

.swatch:focus-visible,
.cover-pick:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.swatch-name {
  font-size: var(--fs-sm);
}

/* Amostra da paleta: fundo, painel e uma linha de texto com as cores dela.
   Os valores repetem os da paleta (palettes.css) de propósito: a amostra
   mostra a paleta que ainda não está aplicada. */
.palette-sample {
  position: relative;
  display: block;
  width: 3rem;
  height: 2rem;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--sample-bg);
}

.palette-panel {
  position: absolute;
  inset: var(--space-2) var(--space-2) var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--sample-panel);
}

.palette-line {
  position: absolute;
  left: var(--space-3);
  right: var(--space-4);
  top: 0.95rem;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--sample-text);
}

.palette-default { --sample-bg: linear-gradient(135deg, #f0f0f3 50%, #121212 50%); --sample-panel: transparent; --sample-text: transparent; }
.palette-paper { --sample-bg: #f3ecdf; --sample-panel: #fbf7ef; --sample-text: #2b2116; }
.palette-amoled { --sample-bg: #000; --sample-panel: #0c0c0e; --sample-text: #fff; }
.palette-slate { --sample-bg: #0f172a; --sample-panel: #1a2438; --sample-text: #f1f5f9; }
.palette-forest { --sample-bg: #0f1a14; --sample-panel: #16241c; --sample-text: #eef5ef; }

.accent-dot {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-pill);
}

.accent-dot.free {
  background: conic-gradient(var(--blue), var(--green), var(--yellow), var(--orange), var(--red), var(--purple), var(--blue));
}

.icon-swatch img {
  display: block;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-md);
}

.cover-current {
  display: block;
  width: 5rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.cover-current.wide {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
  gap: var(--space-2);
  max-height: 20rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.cover-pick {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
}

.cover-pick.active {
  border-color: var(--main-color);
  box-shadow: 0 0 0 1px var(--main-color);
}

.cover-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

@media (max-width: 639.98px) {
  .cover-actions > * {
    flex: 1 1 100%;
  }
}
</style>

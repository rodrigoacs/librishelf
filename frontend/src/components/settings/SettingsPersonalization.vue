<template>
  <!-- Personalização (Pro: personalization, pacote 29). Sem Pro o que foi
       escolhido continua valendo; só "Padrão" fica disponível. -->
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

    <ProNotice
      v-if="plan && !pro"
      feature="personalization"
      :readonly="hasChoices"
      compact
    />

    <div class="group-panel">
      <!-- Paleta -->
      <div class="option-block">
        <span
          id="pz-palette"
          class="option-label"
        >{{ t('personalization.palette.title') }}</span>
        <div
          class="swatches"
          role="radiogroup"
          aria-labelledby="pz-palette"
        >
          <button
            v-for="option in paletteOptions"
            :key="option.value || 'default'"
            type="button"
            role="radio"
            class="swatch palette-swatch"
            :class="[`palette-${option.value || 'default'}`, { active: chosen.palette === option.value }]"
            :aria-checked="chosen.palette === option.value"
            :disabled="busy || (option.value !== null && !pro)"
            @click="choose('palette', option.value)"
          >
            <span
              class="palette-sample"
              aria-hidden="true"
            ><span class="palette-panel"></span><span class="palette-line"></span></span>
            <span class="swatch-name">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <!-- Cor extra -->
      <div class="option-block">
        <span
          id="pz-accent"
          class="option-label"
        >{{ t('personalization.accent.title') }}</span>
        <div
          class="swatches"
          role="radiogroup"
          aria-labelledby="pz-accent"
        >
          <button
            v-for="option in accentOptions"
            :key="option.value || 'default'"
            type="button"
            role="radio"
            class="swatch accent-swatch"
            :class="{ active: chosen.accent === option.value }"
            :aria-checked="chosen.accent === option.value"
            :disabled="busy || (option.value !== null && !pro)"
            @click="choose('accent', option.value)"
          >
            <span
              class="accent-dot"
              :style="option.value ? { background: `var(--${option.value})` } : null"
              :class="{ free: !option.value }"
              aria-hidden="true"
            ></span>
            <span class="swatch-name">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <!-- Ícone do app -->
      <div class="option-block">
        <span
          id="pz-icon"
          class="option-label"
        >{{ t('personalization.icon.title') }}</span>
        <div
          class="swatches"
          role="radiogroup"
          aria-labelledby="pz-icon"
        >
          <button
            v-for="option in iconOptions"
            :key="option.value || 'default'"
            type="button"
            role="radio"
            class="swatch icon-swatch"
            :class="{ active: chosen.appIcon === option.value }"
            :aria-checked="chosen.appIcon === option.value"
            :disabled="busy || (option.value !== null && !pro)"
            @click="choose('appIcon', option.value)"
          >
            <img
              :src="option.value ? `/icons/alt/${option.value}-192.png` : '/icons/icon-192.png'"
              alt=""
              width="48"
              height="48"
            >
            <span class="swatch-name">{{ option.label }}</span>
          </button>
        </div>
        <p class="option-help">{{ t('personalization.icon.help') }}</p>
      </div>

      <!-- Capa de fundo no perfil público -->
      <div class="option-block">
        <span class="option-label">{{ t('personalization.cover.title') }}</span>
        <div class="cover-row">
          <img
            v-if="currentCoverUrl"
            :src="currentCoverUrl"
            :alt="t('personalization.cover.current')"
            class="cover-current"
            :class="{ wide: chosen.profileCover?.kind === 'image' }"
          >
          <p
            v-else
            class="option-help"
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
                icon="pi pi-image"
                class="btn-sm btn-secondary"
                :loading="uploading"
                :disabled="busy"
                @click="imageInput?.click()"
              />
              <AppButton
                :label="t('personalization.cover.choose')"
                class="btn-sm btn-secondary"
                :loading="coversLoading"
                :disabled="busy"
                @click="openCovers"
              />
            </template>
            <button
              v-if="chosen.profileCover"
              type="button"
              class="link-button"
              :disabled="busy"
              @click="choose('profileCover', null)"
            >{{ t('personalization.cover.remove') }}</button>
          </div>
        </div>
        <p class="option-help">{{ t('personalization.cover.help') }}</p>

        <div
          v-if="coversOpen"
          class="cover-picker"
        >
          <p
            v-if="!covers.length"
            class="option-help"
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
        </div>
      </div>
    </div>
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
import ProNotice from '../ProNotice.vue'

const { t } = useI18n()
const { plan, canUse } = usePlan()
const toast = useToast()

const pro = computed(() => canUse('personalization'))
const chosen = computed(() => currentUser.value?.personalization ?? { palette: null, accent: null, appIcon: null, profileCover: null })
const hasChoices = computed(() => Boolean(chosen.value.palette || chosen.value.accent || chosen.value.appIcon || chosen.value.profileCover))

const withDefault = (values, prefix) => [
  { value: null, label: t(`personalization.${prefix}.default`) },
  ...values.map(value => ({ value, label: t(`personalization.${prefix}.options.${value}`) }))
]
const paletteOptions = computed(() => withDefault(Object.keys(PRO_PALETTES), 'palette'))
const accentOptions = computed(() => withDefault(PRO_ACCENTS, 'accent'))
const iconOptions = computed(() => withDefault(APP_ICONS, 'icon'))

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

.group-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.option-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.option-label {
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.option-help {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  line-height: 1.45;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-width: 4.5rem;
  padding: var(--space-2);
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
.cover-pick:focus-visible,
.link-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.swatch-name {
  font-size: var(--fs-xs);
}

/* Amostra da paleta: fundo, painel e uma linha de texto com as cores dela */
.palette-sample {
  position: relative;
  display: block;
  width: 3rem;
  height: 2rem;
  overflow: hidden;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: var(--radius-sm);
  background: var(--sample-bg);
}

.palette-panel {
  position: absolute;
  inset: 0.45rem 0.4rem 0.4rem;
  border-radius: 3px;
  background: var(--sample-panel);
}

.palette-line {
  position: absolute;
  left: 0.65rem;
  right: 1.1rem;
  top: 0.95rem;
  height: 3px;
  border-radius: 2px;
  background: var(--sample-text);
}

.palette-default { --sample-bg: linear-gradient(135deg, #f0f0f3 50%, #121212 50%); --sample-panel: transparent; --sample-text: transparent; }
.palette-paper { --sample-bg: #f3ecdf; --sample-panel: #fbf7ef; --sample-text: #2b2116; }
.palette-amoled { --sample-bg: #000; --sample-panel: #0c0c0e; --sample-text: #fff; }
.palette-slate { --sample-bg: #0f172a; --sample-panel: #1a2438; --sample-text: #f1f5f9; }
.palette-forest { --sample-bg: #0f1a14; --sample-panel: #16241c; --sample-text: #eef5ef; }

.accent-dot {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--radius-pill);
}

.accent-dot.free {
  background: conic-gradient(var(--blue), var(--green), var(--yellow), var(--orange), var(--red), var(--purple), var(--blue));
}

.icon-swatch img {
  display: block;
  width: 3rem;
  height: 3rem;
  border-radius: 22%;
}

.cover-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.cover-current {
  width: 3.5rem;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.cover-current.wide {
  width: 9rem;
  aspect-ratio: 16 / 9;
}

.cover-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.link-button {
  padding: var(--space-1) 0;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.cover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3.75rem, 1fr));
  gap: var(--space-2);
  max-height: 16rem;
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

.cover-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--radius-sm);
}
</style>

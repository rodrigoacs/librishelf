<template>
  <AppDialog
    :visible="visible"
    size="sm"
    dialog-class="avatar-crop-dialog"
    :aria-labelledby="titleId"
    :dismissable="false"
    :before-close="confirmLeave"
    @update:visible="value => !value && emit('update:visible', false)"
  >
    <div class="crop-shell">
      <header class="crop-header">
        <h2 :id="titleId">{{ t('avatar.cropTitle') }}</h2>
        <IconButton
          class="crop-close"
          icon="pi pi-times"
          :label="t('common.close')"
          @click="requestClose"
        />
      </header>

      <div class="crop-body">
        <!-- Moldura: arrastar move, pinça (ou roda do mouse) amplia; setas
             movem e +/− ampliam pelo teclado. O círculo é o que fica. -->
        <div
          ref="stageEl"
          class="crop-stage"
          :class="{ dragging: pointers.size > 0, ready: loaded }"
          tabindex="0"
          role="group"
          :aria-label="t('avatar.stageLabel')"
          :aria-describedby="hintId"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @lostpointercapture="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeydown"
        >
          <img
            v-if="src"
            ref="imgEl"
            :src="src"
            alt=""
            class="crop-image"
            draggable="false"
            :style="imageStyle"
            @load="onLoad"
            @error="onImageError"
          />
          <div
            class="crop-mask"
            aria-hidden="true"
          ></div>
          <p
            v-if="!loaded && !loadError"
            class="crop-loading"
          >{{ t('common.loading') }}</p>
        </div>
        <p
          :id="hintId"
          class="crop-hint"
        >{{ t(phone ? 'avatar.hintTouch' : 'avatar.hintPointer') }}</p>

        <label
          class="zoom-row"
          :for="zoomId"
        >
          <i
            class="pi pi-search-minus"
            aria-hidden="true"
          ></i>
          <span class="sr-only">{{ t('avatar.zoom') }}</span>
          <input
            :id="zoomId"
            type="range"
            min="1"
            :max="MAX_ZOOM"
            step="0.01"
            :value="zoom"
            :disabled="!loaded"
            @input="onZoomInput"
          />
          <i
            class="pi pi-search-plus"
            aria-hidden="true"
          ></i>
        </label>

        <fieldset class="visibility">
          <legend>{{ t('avatar.visibilityLabel') }}</legend>
          <label
            v-for="option in VISIBILITIES"
            :key="option"
            class="vis-option"
            :class="{ selected: visibility === option }"
          >
            <input
              v-model="visibility"
              type="radio"
              :name="`${titleId}-visibility`"
              :value="option"
            />
            <span>{{ t(`avatar.visibility.${option}`) }}</span>
          </label>
        </fieldset>

        <p
          v-if="error"
          class="crop-error"
          role="alert"
        >{{ error }}</p>
      </div>

      <footer class="crop-footer">
        <AppButton
          :label="t('avatar.save')"
          icon="pi pi-check"
          class="btn-primary save-btn"
          :loading="saving"
          :disabled="!loaded"
          @click="save"
        />
      </footer>
    </div>
  </AppDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from './ui/AppDialog.vue'
import AppButton from './ui/AppButton.vue'
import IconButton from './form/IconButton.vue'
import api from '../services/api.js'
import { confirmDiscard } from '../services/confirm.js'
import { useIsPhone } from '../composables/useIsPhone.js'
import { MAX_ZOOM, initialView, clampView, zoomAround, pinchView, rubberView, cropRect, zoomOf, minScale } from '../utils/crop.js'
import { canAnimate } from '../utils/motion.js'

/**
 * Folha "Ajustar foto": recorta a foto escolhida num círculo antes de enviar.
 * Celular: pinça amplia, um dedo arrasta (Pointer Events, sem biblioteca);
 * passou do limite, a foto estica um pouco e volta com mola ao soltar.
 * Desktop: arrastar com o mouse, roda amplia, e o controle deslizante e o
 * teclado (setas, + e −) fazem o mesmo para quem não usa ponteiro.
 * O navegador desenha o recorte num canvas (512 × 512) e manda o JPEG já
 * pronto; o servidor confere e regrava sem metadados.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  file: { type: [File, Blob], default: null },
  initialVisibility: { type: String, default: 'followers' }
})
const emit = defineEmits(['update:visible', 'saved'])
const { t } = useI18n()
const phone = useIsPhone()

const VISIBILITIES = ['everyone', 'followers', 'nobody']
const OUTPUT = 512
const uid = Math.random().toString(36).slice(2, 8)
const titleId = `avatar-crop-title-${uid}`
const hintId = `avatar-crop-hint-${uid}`
const zoomId = `avatar-crop-zoom-${uid}`

const stageEl = ref(null)
const imgEl = ref(null)
const src = ref('')
const loaded = ref(false)
const loadError = ref(false)
const natural = reactive({ w: 0, h: 0 })
const box = ref(300)
const view = ref({ scale: 1, x: 0, y: 0 })
const settling = ref(false)
const visibility = ref(props.initialVisibility)
const saving = ref(false)
const error = ref('')
const touched = ref(false)

const imageStyle = computed(() => ({
  width: `${natural.w}px`,
  height: `${natural.h}px`,
  transform: `translate3d(${view.value.x}px, ${view.value.y}px, 0) scale(${view.value.scale})`,
  transition: settling.value ? 'transform var(--dur-spring) var(--ease-spring)' : 'none'
}))
const zoom = computed(() => (loaded.value ? zoomOf(view.value, natural.w, natural.h, box.value) : 1))

watch(() => [props.visible, props.file], ([open, file]) => {
  if (!open || !file) return
  if (src.value) URL.revokeObjectURL(src.value)
  loaded.value = false
  loadError.value = false
  error.value = ''
  touched.value = false
  visibility.value = props.initialVisibility
  src.value = URL.createObjectURL(file)
}, { immediate: true })

onBeforeUnmount(() => { if (src.value) URL.revokeObjectURL(src.value) })

function measure() {
  box.value = stageEl.value?.clientWidth || 300
}

function onLoad() {
  const img = imgEl.value
  natural.w = img.naturalWidth
  natural.h = img.naturalHeight
  measure()
  view.value = initialView(natural.w, natural.h, box.value)
  loaded.value = true
  // Teclado (desktop): já dá para mover com as setas; no toque, sem anel de foco
  if (!phone.value) requestAnimationFrame(() => stageEl.value?.focus({ preventScroll: true }))
}

function onImageError() {
  loadError.value = true
  error.value = t('avatar.loadError')
}

function settle() {
  const target = clampView(view.value, natural.w, natural.h, box.value)
  const moved = target.scale !== view.value.scale || target.x !== view.value.x || target.y !== view.value.y
  settling.value = moved && canAnimate()
  view.value = target
  if (settling.value) setTimeout(() => { settling.value = false }, 600)
}

// ------------------------------------------------------------- ponteiros
const pointers = reactive(new Map())
let gesture = null

function point(event) {
  const rect = stageEl.value.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function startGesture() {
  const pts = [...pointers.values()]
  gesture = pts.length >= 2
    ? { kind: 'pinch', start: { ...view.value }, a: pts[0], b: pts[1] }
    : { kind: 'pan', start: { ...view.value }, a: pts[0] }
}

function onPointerDown(event) {
  if (!loaded.value || (event.pointerType === 'mouse' && event.button !== 0)) return
  settling.value = false
  stageEl.value.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId, point(event))
  startGesture()
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId) || !gesture) return
  pointers.set(event.pointerId, point(event))
  const pts = [...pointers.values()]
  let next
  if (gesture.kind === 'pinch' && pts.length >= 2) {
    next = pinchView(gesture.start, gesture.a, gesture.b, pts[0], pts[1])
  } else {
    const p = pts[0]
    next = { scale: gesture.start.scale, x: gesture.start.x + (p.x - gesture.a.x), y: gesture.start.y + (p.y - gesture.a.y) }
  }
  touched.value = true
  view.value = rubberView(next, natural.w, natural.h, box.value)
}

function onPointerUp(event) {
  if (!pointers.has(event.pointerId)) return
  pointers.delete(event.pointerId)
  if (pointers.size > 0) {
    // Tirou um dos dois dedos: continua arrastando com o outro, de onde está
    view.value = clampView(view.value, natural.w, natural.h, box.value)
    startGesture()
    return
  }
  gesture = null
  settle()
}

function onWheel(event) {
  if (!loaded.value) return
  const p = point(event)
  const factor = Math.exp(-event.deltaY * 0.0015)
  touched.value = true
  view.value = clampView(zoomAround(view.value, view.value.scale * factor, p.x, p.y), natural.w, natural.h, box.value)
}

function onZoomInput(event) {
  const next = Number(event.target.value) * minScale(natural.w, natural.h, box.value)
  const c = box.value / 2
  touched.value = true
  view.value = clampView(zoomAround(view.value, next, c, c), natural.w, natural.h, box.value)
}

function onKeydown(event) {
  if (!loaded.value) return
  const step = event.shiftKey ? 40 : 12
  const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  let next = null
  if (moves[event.key]) {
    const [dx, dy] = moves[event.key]
    next = { ...view.value, x: view.value.x + dx, y: view.value.y + dy }
  } else if (event.key === '+' || event.key === '=') {
    next = zoomAround(view.value, view.value.scale * 1.1, box.value / 2, box.value / 2)
  } else if (event.key === '-') {
    next = zoomAround(view.value, view.value.scale / 1.1, box.value / 2, box.value / 2)
  }
  if (!next) return
  event.preventDefault()
  touched.value = true
  view.value = clampView(next, natural.w, natural.h, box.value)
}

// ------------------------------------------------------------- salvar

function renderBlob() {
  const { sx, sy, size } = cropRect(view.value, natural.w, natural.h, box.value)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT
  canvas.height = OUTPUT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imgEl.value, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT)
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('canvas'))), 'image/jpeg', 0.9))
}

async function save() {
  if (!loaded.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const blob = await renderBlob()
    const result = await api.uploadAvatar(blob, visibility.value)
    touched.value = false
    emit('saved', result)
    emit('update:visible', false)
  } catch (err) {
    error.value = err.message || t('avatar.saveError')
  } finally {
    saving.value = false
  }
}

// Ajustou e fechou sem salvar: pergunta (o mesmo "Descartar alterações?")
async function confirmLeave() {
  if (saving.value || !touched.value) return true
  return confirmDiscard(t)
}

async function requestClose() {
  if (await confirmLeave()) emit('update:visible', false)
}
</script>

<style scoped>
.crop-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(92vh, 760px);
}

.crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
}

.crop-header h2 {
  margin: 0;
  font-size: var(--fs-xl);
}

.crop-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  padding: 0 var(--space-5) var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.crop-stage {
  position: relative;
  width: 100%;
  max-width: 360px;
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: #0b0b0d;
  touch-action: none;
  user-select: none;
  cursor: grab;
}

.crop-stage.dragging {
  cursor: grabbing;
}

.crop-stage:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  transform-origin: 0 0;
  opacity: 0;
  will-change: transform;
  pointer-events: none;
}

.ready .crop-image {
  opacity: 1;
  transition: opacity var(--dur-medium) var(--ease-standard);
}

/* Fora do círculo escurece; o anel mostra o recorte */
.crop-mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.55), inset 0 0 0 2px rgba(255, 255, 255, 0.85);
  pointer-events: none;
}

.crop-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: #e4e4e7;
  font-size: var(--fs-sm);
}

.crop-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-align: center;
}

.zoom-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 360px;
  width: 100%;
  margin: 0 auto;
  color: var(--text-secondary);
}

.zoom-row input {
  flex: 1;
  min-height: 44px;
  accent-color: var(--main-solid);
}

.visibility {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: none;
}

.visibility legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-weight: 600;
}

.vis-option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.vis-option.selected {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

.vis-option input {
  accent-color: var(--main-solid);
}

.crop-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--fs-sm);
}

.crop-footer {
  padding: var(--space-3) var(--space-5) var(--space-4);
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.save-btn {
  width: 100%;
  min-height: 48px;
}

@media (max-width: 639.98px) {
  .crop-shell {
    max-height: none;
    flex: 1;
  }

  .crop-header {
    padding: 0 var(--space-2) var(--space-2) var(--space-4);
  }

  .crop-body {
    padding: 0 var(--space-4) var(--space-3);
  }

  .crop-footer {
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .crop-image,
  .ready .crop-image {
    transition: none !important;
  }
}
</style>

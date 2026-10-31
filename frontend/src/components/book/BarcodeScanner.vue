<template>
  <!-- No body: fora do diálogo do Novo livro (não herda o tamanho dele) e do <form> -->
  <Teleport to="body">
    <AppDialog
      :visible="visible"
      size="sm"
      dialog-class="scanner-dialog"
      :header="t('scanner.title')"
      @update:visible="value => emit('update:visible', value)"
      @hide="stop"
    >
      <div class="scanner">
        <div
          class="viewport"
          :class="{ ready: state === 'scanning', found: state === 'found' }"
        >
          <video
            ref="videoEl"
            class="video"
            muted
            autoplay
            playsinline
            aria-hidden="true"
          ></video>

          <!-- Moldura onde o código de barras deve ficar -->
          <div
            v-if="state === 'scanning' || state === 'found'"
            class="guide"
            aria-hidden="true"
          >
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
            <span
              v-if="state === 'scanning'"
              class="laser"
            ></span>
          </div>

          <!-- Lido: a moldura fica verde e o ISBN aparece antes de fechar -->
          <p
            v-if="state === 'found'"
            class="found-pill"
            role="status"
          >
            <i
              class="pi pi-check"
              aria-hidden="true"
            ></i>
            {{ t('scanner.detected', { isbn: foundIsbn }) }}
          </p>

          <div
            v-if="state === 'starting'"
            class="overlay-msg"
          >
            <i
              class="pi pi-spinner pi-spin"
              aria-hidden="true"
            ></i>
            <span>{{ t('scanner.starting') }}</span>
          </div>

          <div
            v-else-if="state === 'error'"
            class="overlay-msg error"
          >
            <i
              class="pi pi-camera"
              aria-hidden="true"
            ></i>
            <span>{{ errorText }}</span>
          </div>
        </div>

        <p
          class="status"
          :class="{ warn: Boolean(notice) }"
          aria-live="polite"
        >{{ statusText }}</p>

        <div class="actions">
          <AppButton
            v-if="state === 'error'"
            :label="t('scanner.retry')"
            icon="pi pi-refresh"
            class="btn-outlined btn-secondary"
            @click="start"
          />
          <AppButton
            :label="t('scanner.typeInstead')"
            icon="pi pi-pencil"
            class="btn-text btn-secondary"
            @click="emit('update:visible', false)"
          />
        </div>
      </div>
    </AppDialog>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import { canAnimate } from '../../utils/motion.js'
import {
  getBarcodeDetector,
  openCamera,
  stopStream,
  isbnFromBarcode,
  cameraErrorKey
} from '../../services/barcode.js'

/**
 * Câmera para ler o código de barras do livro (EAN-13 do ISBN).
 * Lido o ISBN, emite "detected" e fecha. A câmera desliga ao fechar, ao
 * desmontar e quando a aba sai de vista.
 *
 *   <BarcodeScanner v-model:visible="open" @detected="isbn => …" />
 */
const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'detected'])
const { t } = useI18n()

const SCAN_INTERVAL_MS = 120
const NOTICE_MS = 2500

const videoEl = ref(null)
const state = ref('idle') // idle | starting | scanning | found | error
const foundIsbn = ref('')
// Tempo para ver a confirmação verde antes de a folha fechar (o formulário
// já recebe o ISBN na hora; desktop ou sem movimento: fecha direto)
const FOUND_HOLD_MS = 650
let closeTimer = null
const errorKey = ref('')
const notice = ref('')

let stream = null
let timer = null
let noticeTimer = null
let session = 0
let lastValue = ''

const errorText = computed(() => (errorKey.value ? t(errorKey.value) : ''))
const statusText = computed(() => {
  if (notice.value) return notice.value
  if (state.value === 'scanning') return t('scanner.hint')
  return ''
})

function showNotice(text) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, NOTICE_MS)
}

async function start() {
  stop()
  const current = ++session
  state.value = 'starting'
  errorKey.value = ''
  lastValue = ''

  // Detector (pode baixar o leitor em WebAssembly) e câmera ao mesmo tempo
  const detectorReady = getBarcodeDetector()
  try {
    const opened = await openCamera()
    if (current !== session) return stopStream(opened)
    stream = opened
  } catch (error) {
    if (current !== session) return
    errorKey.value = cameraErrorKey(error)
    state.value = 'error'
    return
  }

  let detector
  try {
    detector = await detectorReady
  } catch {
    if (current !== session) return
    stop()
    errorKey.value = 'scanner.errors.reader'
    state.value = 'error'
    return
  }
  if (current !== session) return

  const video = videoEl.value
  if (!video) return stop()
  video.srcObject = stream
  try {
    await video.play()
  } catch {
    // autoplay recusado: o atributo autoplay + muted costuma resolver sozinho
  }
  if (current !== session) return
  state.value = 'scanning'
  scan(detector, current)
}

async function scan(detector, current) {
  if (current !== session) return
  const video = videoEl.value
  if (video && video.readyState >= 2) {
    try {
      const codes = await detector.detect(video)
      if (current !== session) return
      handle(codes)
      if (current !== session) return
    } catch {
      // Quadro ruim (vídeo trocando de tamanho etc.): tenta no próximo
    }
  }
  timer = setTimeout(() => scan(detector, current), SCAN_INTERVAL_MS)
}

function handle(codes) {
  for (const code of codes || []) {
    const isbn = isbnFromBarcode(code.rawValue)
    if (!isbn) {
      // EAN de preço/produto (ex.: o código de 5 dígitos ao lado) não é ISBN
      if (code.rawValue && !notice.value) showNotice(t('scanner.notIsbn'))
      continue
    }
    // Duas leituras iguais seguidas: evita pegar um código lido pela metade
    if (isbn === lastValue) {
      found(isbn)
      return
    }
    lastValue = isbn
    return
  }
}

// Sem vibração (decisão do projeto): a confirmação é visual e pelo role="status"
function found(isbn) {
  session++
  clearTimeout(timer)
  timer = null
  videoEl.value?.pause?.()
  foundIsbn.value = isbn
  state.value = 'found'
  emit('detected', isbn)
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => emit('update:visible', false), canAnimate() ? FOUND_HOLD_MS : 0)
}

function stop() {
  clearTimeout(closeTimer)
  session++
  clearTimeout(timer)
  timer = null
  stopStream(stream)
  stream = null
  if (videoEl.value) videoEl.value.srcObject = null
  if (state.value !== 'error') state.value = 'idle'
}

// Aba escondida ou página saindo: a câmera não fica ligada sem ninguém ver
function onHidden() {
  if (document.visibilityState === 'hidden' && props.visible) emit('update:visible', false)
}

watch(() => props.visible, open => {
  if (open) {
    notice.value = ''
    start()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onHidden)
  } else {
    stop()
    state.value = 'idle'
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onHidden)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  stop()
  clearTimeout(noticeTimer)
  document.removeEventListener('visibilitychange', onHidden)
  window.removeEventListener('pagehide', onHidden)
})
</script>

<style scoped>
.scanner {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.viewport {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #0b0b0d;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Faixa larga e baixa: o formato do código de barras do livro */
.guide {
  position: absolute;
  left: 10%;
  right: 10%;
  top: 30%;
  bottom: 30%;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-md);
}

.corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 3px solid #fff;
}

.corner.tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: var(--radius-md); }
.corner.tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: var(--radius-md); }
.corner.bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: var(--radius-md); }
.corner.br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: var(--radius-md); }

.laser {
  position: absolute;
  left: 6%;
  right: 6%;
  top: 50%;
  height: 2px;
  background: rgb(var(--main-color-rgb));
  box-shadow: 0 0 8px rgb(var(--main-color-rgb));
  animation: laser 1.6s ease-in-out infinite alternate;
}

/* Lido: cantos verdes e o ISBN numa pílula verde */
.viewport.found .corner {
  border-color: var(--success);
  transition: border-color var(--dur-short) linear;
}

.found-pill {
  position: absolute;
  left: 50%;
  bottom: 18%;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0.35rem 0.8rem;
  border-radius: var(--radius-pill);
  background: #15803d;
  color: #ffffff;
  font-size: var(--fs-sm);
  font-weight: 700;
  white-space: nowrap;
  transform: translateX(-50%);
  animation: found-pill-in var(--dur-spring) var(--ease-spring);
}

@keyframes found-pill-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.6);
  }
}

/* Celular (folha): vídeo em pé, mais alto, como a câmera do trailer */
@media (max-width: 639.98px) {
  .viewport {
    aspect-ratio: 3 / 4;
    max-height: 62dvh;
    margin-inline: auto;
    width: 100%;
  }

  .guide {
    left: 12%;
    right: 12%;
    top: 38%;
    bottom: 38%;
  }

  .laser {
    left: 4%;
    right: 4%;
    animation-duration: 1.2s;
  }
}

@keyframes laser {
  from { transform: translateY(-1.6rem); }
  to { transform: translateY(1.6rem); }
}

@media (prefers-reduced-motion: reduce) {
  .laser {
    animation: none;
  }
}

.overlay-msg {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.25rem;
  text-align: center;
  color: #e4e4e7;
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.overlay-msg .pi {
  font-size: var(--fs-xl);
}

.overlay-msg.error .pi {
  color: #a1a1aa;
}

.status {
  margin: 0;
  min-height: 1.3em;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: center;
}

.status.warn {
  color: var(--yellow);
}

.actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>

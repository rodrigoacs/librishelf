/**
 * Leitura de código de barras de livro (EAN-13 do ISBN) pela câmera.
 *
 * Detector: o BarcodeDetector nativo quando existe e lê EAN-13 (Chrome no
 * Android e no macOS, Samsung Internet). No Safari do iPhone ele vem
 * desligado e no Firefox não existe; aí entra o barcode-detector (ZXing em
 * WebAssembly), carregado só quando a pessoa toca no botão da câmera. O
 * .wasm sai do nosso próprio servidor (o padrão do pacote seria uma CDN).
 *   https://developer.mozilla.org/docs/Web/API/BarcodeDetector
 *   https://github.com/Sec-ant/barcode-detector
 */

const FORMATS = ['ean_13']

let detectorPromise = null

async function nativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats()
    if (!FORMATS.every(format => supported.includes(format))) return null
    return new window.BarcodeDetector({ formats: FORMATS })
  } catch {
    return null
  }
}

async function zxingDetector() {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url')
  ])
  prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
    },
    fireImmediately: true
  })
  return new BarcodeDetector({ formats: FORMATS })
}

/** Detector pronto (o mesmo para as próximas aberturas da câmera). */
export function getBarcodeDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => (await nativeDetector()) || zxingDetector())()
    detectorPromise.catch(() => { detectorPromise = null })
  }
  return detectorPromise
}

/** Tem como abrir câmera aqui? (HTTPS ou localhost, navegador com getUserMedia) */
export function cameraSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext !== false
}

/** Há alguma câmera? (sem pedir permissão; sem a lista, supõe que sim) */
export async function hasCamera() {
  if (!cameraSupported()) return false
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.length === 0 || devices.some(device => device.kind === 'videoinput')
  } catch {
    return true
  }
}

/** Câmera traseira quando houver, em boa resolução para ler as barras. */
export function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  })
}

export function stopStream(stream) {
  stream?.getTracks().forEach(track => track.stop())
}

/**
 * Código lido → ISBN-13, ou null quando não é ISBN.
 * Livro: EAN-13 começando com 978 ou 979 e dígito verificador certo.
 */
export function isbnFromBarcode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!/^97[89]\d{10}$/.test(digits)) return null
  let total = 0
  for (let i = 0; i < 12; i++) total += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (total % 10)) % 10) === digits[12] ? digits : null
}

/** Mensagem (chave de i18n) para o erro de getUserMedia. */
export function cameraErrorKey(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'scanner.errors.denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'scanner.errors.noCamera'
    case 'NotReadableError':
    case 'AbortError':
      return 'scanner.errors.busy'
    default:
      return 'scanner.errors.generic'
  }
}

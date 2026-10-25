import { createApp } from 'vue'
import i18n from './i18n'
import App from './App.vue'
import router from './router'
import tooltip from './directives/tooltip.js'

import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import 'primeicons/primeicons.css'
import './assets/main.css'

// Registra o tratamento de sessão expirada antes da primeira requisição.
import './services/session.js'
import { initTheme } from './composables/useTheme.js'
import { registerServiceWorker, reloadOnStaleChunks } from './services/pwa.js'
import { addToast } from './services/toast.js'

initTheme()
reloadOnStaleChunks()
// Versão nova do app instalada com esta aba aberta: a próxima tela já vem dela
registerServiceWorker({
  onUpdated: () => addToast({ severity: 'info', summary: i18n.global.t('offline.updatedTitle'), detail: i18n.global.t('offline.updatedText'), life: 8000 })
})

const app = createApp(App)

app.use(router)
app.use(i18n)
app.directive('tooltip', tooltip)

app.mount('#app')

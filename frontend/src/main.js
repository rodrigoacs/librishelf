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

initTheme()

const app = createApp(App)

app.use(router)
app.use(i18n)
app.directive('tooltip', tooltip)

app.mount('#app')

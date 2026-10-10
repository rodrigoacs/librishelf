import { createApp } from 'vue'
import i18n from './i18n'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config'

import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'

import '@fontsource-variable/inter'
import 'primevue/resources/themes/aura-dark-teal/theme.css'
import 'primeicons/primeicons.css'
import './assets/main.css'

// Registra o tratamento de sessão expirada antes da primeira requisição.
import './services/session.js'
import { initTheme } from './composables/useTheme.js'

initTheme()

const app = createApp(App)

app.use(router)
app.use(i18n)
app.use(PrimeVue, { ripple: true })

app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

app.mount('#app')

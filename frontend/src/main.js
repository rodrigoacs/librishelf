import { createApp } from 'vue'
import i18n from './i18n'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config'
import tooltip from './directives/tooltip.js'

import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
// Os dois temas convivem: o plugin vite/primevueTheme.js prefixa cada um com
// [data-theme] e troca o azul do Aura pela cor de destaque do app.
import 'primevue/resources/themes/aura-dark-blue/theme.css'
import 'primevue/resources/themes/aura-light-blue/theme.css'
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
app.directive('tooltip', tooltip)

app.mount('#app')

import { createApp } from 'vue'
import i18n from './i18n'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config'

import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

import 'primevue/resources/themes/aura-dark-teal/theme.css'
import 'primeicons/primeicons.css'
import './assets/main.css'

const app = createApp(App)

app.use(router)
app.use(i18n)
app.use(PrimeVue, { ripple: true })

app.use(ToastService)
app.use(ConfirmationService)

app.mount('#app')

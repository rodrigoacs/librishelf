import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import preloadIconFont from './vite/preloadIconFont.js'
import serviceWorker from './vite/serviceWorker.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend local que o dev server repassa em /api (mesmo esquema do nginx em produção).
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3050'

  return {
    plugins: [vue(), preloadIconFont(), serviceWorker()],
    // Hora do build: a área administrativa mostra qual versão do frontend está no ar
    define: {
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})

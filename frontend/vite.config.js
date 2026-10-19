import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import primevueTheme from './vite/primevueTheme.js'
import preloadIconFont from './vite/preloadIconFont.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Backend local que o dev server repassa em /api (mesmo esquema do nginx em produção).
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3050'

  return {
    plugins: [primevueTheme(), vue(), preloadIconFont()],
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

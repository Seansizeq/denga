import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version ?? 'dev'),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    /**
     * `.claude/worktrees/` — це повні копії репозиторію, які інструменти
     * створюють під окремі гілки. Vitest бачив у них ті самі тести й проганяв
     * усе вдруге: 143 файли замість 63, удвічі довший прогін і, найгірше,
     * падіння з **чужої версії коду** в переліку результатів. Розібратися, чий
     * саме файл упав, за назвою тесту неможливо.
     */
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs separately (npm run dev:api); forward /api calls to it.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})

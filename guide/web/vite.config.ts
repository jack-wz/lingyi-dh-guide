import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Pixelle-Video FastAPI 统一后端（代理导购 API + 静态资源）
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    // Bind IPv4 so http://127.0.0.1:5173 works (not only localhost/::1)
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/renders': apiTarget,
      '/brand-fonts': apiTarget,
    },
  },
})

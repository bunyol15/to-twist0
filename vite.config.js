import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/to-twist0/', // Muy importante: debe ser el nombre EXACTO de tu repo entre slashes
})

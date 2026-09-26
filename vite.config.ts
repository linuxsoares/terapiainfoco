import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Caminho relativo para funcionar perfeitamente no GitHub Pages (subdiretório ou domínio próprio)
  plugins: [
    tailwindcss(),
    react(),
  ],
})

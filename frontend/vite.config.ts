/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(), cesium()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts']
  }
})

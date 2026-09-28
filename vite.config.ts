import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setupTests.ts',
    css: false,
    // Skip editor worktree copies (e.g. .kilo/worktrees) that duplicate tests
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**', '**/.kilo/**'],
  },
  define: {
    'process.env': {}
  },
  server: {
    port: 3000,
    open: true
  }
})
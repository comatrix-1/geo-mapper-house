import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
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
    server: {
      deps: {
        inline: [/@base-ui/],
      },
    },
    // Skip editor worktree copies (e.g. .kilo/worktrees) and vendored
    // tooling (apm_modules) that duplicate or break the suite
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**', '**/.kilo/**', 'apm_modules/**'],
  },
  define: {
    'process.env': {}
  },
  server: {
    port: 3000,
    open: true
  }
})
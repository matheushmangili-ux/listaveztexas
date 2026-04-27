import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    coverage: {
      include: ['js/**/*.js'],
      exclude: ['js/update-checker.js', 'js/dashboard-init.js', 'js/tablet-init.js'],
      reporter: ['text', 'html']
    }
  },
  resolve: {
    alias: {
      '/js': fileURLToPath(new URL('./js', import.meta.url))
    }
  }
});

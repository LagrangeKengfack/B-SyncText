import { defineConfig } from 'vitest/config';

// Tests unitaires de tous les paquets ; couverture mesurée sur le paquet commun.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/commun/src/**/*.ts'],
      exclude: ['src/commun/src/**/*.test.ts'],
    },
  },
});

import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __WW_DEV__: 'true' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

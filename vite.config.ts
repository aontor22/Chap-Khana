import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    sourcemap: false,
    // Split large third-party dependencies into cacheable chunks, without
    // touching application state or forcing downloads on private routes.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/')) return 'supabase-vendor';
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) return 'router-vendor';
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) return 'react-vendor';
        }
      }
    }
  },
  test: {
    // catalog.test.mjs uses the built-in Node.js test runner, not Vitest.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx']
  }
});

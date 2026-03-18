import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Native modules that should not be bundled
        'uiohook-napi',
        '@xitanggg/node-insert-text',
        // Optional native accelerators for ws (pure JS fallback is fine)
        'bufferutil',
        'utf-8-validate',
      ],
    },
  },
});

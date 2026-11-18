import { defineConfig } from 'vite'

// Bundles server/index.ts and its dependencies (hono) into one file, so the runtime image needs no node_modules.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
  },
  ssr: { noExternal: true, target: 'node' },
})

// vite.config.ts

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  // Define global for compatibility with some Node-based libraries
  define: {
    'global': 'window',
    'process.env': {},
  },
  resolve: {
    alias: {
      'stream': fileURLToPath(new URL('./src/stream-shim.ts', import.meta.url)),
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
      // Use polling so edits to workspace packages (reached through pnpm
      // junctions on Windows) are reliably detected and HMR timestamps update.
      usePolling: true,
      interval: 100,
    },
  },
  // إضافة هذا للتعامل مع CSS في Tauri
  css: {
    postcss: './postcss.config.js'
  }
}));
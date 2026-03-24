import { defineConfig } from "vite-plus"
import vue from "@vitejs/plugin-vue"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "telesence",
        short_name: "telesence",
        description: "Installable lightweight app for secure video calls.",
        theme_color: "#c96a2f",
        background_color: "#f6efe6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-pages",
            },
          },
        ],
      },
    }),
  ],
  root: ".",
  publicDir: "public",
  base: "/",
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "**/e2e/**"],
    environment: "node",
  },

  // Vite 8: Improved CSS handling with Lightning CSS
  css: {
    devSourcemap: true,
    transformer: "lightningcss",
    lightningcss: {
      targets: {
        chrome: 80,
        firefox: 80,
        safari: 14,
        edge: 80,
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/admin": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
    // Vite 8: Optimized HMR
    hmr: {
      overlay: true,
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,

    // Vite 8: Enhanced target support
    target: "es2022",

    // Use esbuild for faster minification (default in Vite 8)
    minify: "esbuild",

    // Optimized chunking strategy
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate vendor chunks for better caching
          if (id.includes("node_modules")) {
            if (id.includes("vue") || id.includes("@vueuse")) {
              return "vue-vendor"
            }
            return "vendor"
          }
        },
      },
    },

    // Vite 8: Improved chunk size warnings
    chunkSizeWarningLimit: 500,

    // Generate source maps for production debugging
    sourcemap: true,

    // CSS optimization
    cssMinify: "lightningcss",
  },

  // Vite 8: Dependency optimization
  optimizeDeps: {
    include: ["vue", "@vueuse/core", "hono"],
    force: false,
  },

  // Vite 8: Enhanced preview server
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:8787",
      "/admin": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },

  // Performance optimizations
  experimental: {
    // Enable renderBuiltUrl for CDN support if needed
    renderBuiltUrl(filename) {
      return "/" + filename
    },
  },
})

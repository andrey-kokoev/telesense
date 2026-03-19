import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  publicDir: 'public',
  
  // Vite 8: Improved CSS handling with Lightning CSS
  css: {
    devSourcemap: true,
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 80,
        firefox: 80,
        safari: 14,
        edge: 80
      }
    }
  },
  
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787'
    },
    // Vite 8: Optimized HMR
    hmr: {
      overlay: true
    }
  },
  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    // Vite 8: Enhanced target support
    target: 'es2022',
    
    // Use esbuild for faster minification (default in Vite 8)
    minify: 'esbuild',
    esbuild: {
      drop: ['console', 'debugger']
    },
    
    // Optimized chunking strategy
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate vendor chunks for better caching
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('@vueuse')) {
              return 'vue-vendor'
            }
            return 'vendor'
          }
        }
      }
    },
    
    // Vite 8: Improved chunk size warnings
    chunkSizeWarningLimit: 500,
    
    // Generate source maps for production debugging
    sourcemap: true,
    
    // CSS optimization
    cssMinify: 'lightningcss'
  },
  
  // Vite 8: Dependency optimization
  optimizeDeps: {
    include: ['vue', '@vueuse/core', 'hono'],
    force: false
  },
  
  // Vite 8: Enhanced preview server
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },
  
  // Performance optimizations
  experimental: {
    // Enable renderBuiltUrl for CDN support if needed
    renderBuiltUrl(filename) {
      return '/' + filename
    }
  }
})

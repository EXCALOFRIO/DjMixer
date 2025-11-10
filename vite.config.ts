import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createHtmlPlugin } from 'vite-plugin-html';
import { securityHeaders } from './vite-security-headers';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Optimizaciones de servidor
      hmr: {
        overlay: false,
      },
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**']
      }
    },
    plugins: [
      react(),
      securityHeaders(),
      createHtmlPlugin({
        minify: true,
        inject: {
          data: {
            injectScript: mode === 'production' ? '' : ''
          }
        }
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Optimizaciones de build y desarrollo
    optimizeDeps: {
      include: ['react', 'react-dom', 'd3'],
      exclude: ['essentia.js']
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'd3-vendor': ['d3'],
            'audio-services': [
              './services/AudioPlayer.ts',
              './services/AudioAnalyzer.ts',
              './services/MasterAnalyzer.ts'
            ]
          }
        }
      },
      // Optimizaciones adicionales
      reportCompressedSize: false, // Más rápido en build
      chunkSizeWarningLimit: 1000
    }
  };
});

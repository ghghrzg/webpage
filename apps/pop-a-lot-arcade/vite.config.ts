import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';
    return {
      base: isDev ? '/' : '/contents/pop_a_lot/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        outDir: path.resolve(__dirname, '../../contents/pop_a_lot'),
        emptyOutDir: true,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

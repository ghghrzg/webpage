import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';
    return {
      base: isDev ? '/' : '/contents/traffic_light_crossing/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      build: {
        outDir: path.resolve(__dirname, '../../contents/traffic_light_crossing'),
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

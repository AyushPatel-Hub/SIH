import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/predict_flooding': 'http://localhost:8000',
      '/flood_map': 'http://localhost:8000',
      '/drainage_network': 'http://localhost:8000',
      '/hotspots': 'http://localhost:8000',
      '/radar': 'http://localhost:8000',
      '/safe_route': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

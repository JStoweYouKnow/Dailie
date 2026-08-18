import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { microfrontends } from '@vercel/microfrontends/experimental/vite';

export default defineConfig({
  plugins: [react(), microfrontends()],
  server: {
    port: 3000,
    host: true
  }
});

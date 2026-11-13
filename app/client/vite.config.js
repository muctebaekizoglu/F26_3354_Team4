import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Reads app/.env (one level up) so PORT and VITE_API_BASE_URL are shared with the server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = env.PORT || 4000;
  return {
    plugins: [react()],
    envDir: '..',
    server: { port: 5173, proxy: { '/api': `http://localhost:${apiPort}` } },
  };
});

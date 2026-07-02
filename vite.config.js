import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Peak-District-Downhill/' : '/',
  server: {
    host: true,
  },
});

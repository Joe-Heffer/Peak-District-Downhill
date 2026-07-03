import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // itch.io serves HTML5 uploads from a per-game path that varies per embed,
  // so the itch build uses a relative base instead of a fixed subpath. See
  // docs/itch-io.md.
  base:
    mode === 'itch'
      ? './'
      : process.env.GITHUB_ACTIONS
        ? '/Peak-District-Downhill/'
        : '/',
  server: {
    host: true,
  },
}));

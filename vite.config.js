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
  build: {
    rolldownOptions: {
      output: {
        // Split the big, slow-changing 3D libs into their own chunks so
        // browsers can cache them separately from app code that changes
        // every release.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'cannon-es', test: /node_modules[\\/]cannon-es[\\/]/ },
          ],
        },
      },
    },
    // three.js alone minifies to ~630 kB; raise the warning limit past that
    // known, unavoidable size instead of chasing an unreachable threshold.
    chunkSizeWarningLimit: 700,
  },
}));

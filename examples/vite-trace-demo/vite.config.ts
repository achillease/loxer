import { defineConfig } from 'vite';
import loxerTrace from 'vite-plugin-loxer-trace';

export default defineConfig({
  // This demo depends on the Loxer working copy in this repository, so Vite must not pre-bundle it.
  // The dependency cache is keyed on the lockfile and the resolved config, never on a package's own
  // files, so a pre-bundled Loxer goes on serving the `dist/` that existed when the cache was
  // written and no `pnpm build` reaches the page. `dedupe: false` keeps the plugin from contributing
  // the `optimizeDeps.include` that would put it there, and `exclude` keeps Vite's own dependency
  // discovery from adding it back.
  plugins: [loxerTrace({ dedupe: false })],
  optimizeDeps: { exclude: ['loxer', 'loxer/trace'] },
  resolve: { dedupe: ['loxer'] },
});

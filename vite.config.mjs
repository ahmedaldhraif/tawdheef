import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyAppAssets } from './scripts/app-assets.mjs';
import { resolve } from 'node:path';
let assetRoot, assetOutput;
export default defineConfig({
  publicDir: false,
  plugins: [react(), {
    name: 'tracker-assets',
    apply: 'build',
    configResolved(config) { assetRoot = config.root; assetOutput = resolve(config.root, config.build.outDir); },
    async closeBundle() { await copyAppAssets(assetRoot, assetOutput); },
  }],
  build: { sourcemap: false },
});

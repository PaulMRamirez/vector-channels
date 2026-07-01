// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites under /<repo>/, so the built asset URLs
// need that base prefix. Local dev, preview, and any root-hosted deploy keep
// '/'. The Pages build sets VC_BASE=/vector-channels/ (see the build:pages
// script); everything else falls back to '/'.
const base = process.env.VC_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
});

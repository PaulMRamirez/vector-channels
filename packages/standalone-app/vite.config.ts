// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});

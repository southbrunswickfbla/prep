import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The site is published at https://southbrunswickfbla.github.io/prep/
// Change VITE_BASE if the repository gets a different name.
export default defineConfig({
  base: process.env.VITE_BASE || '/prep/',
  plugins: [react(), tailwindcss()],
});

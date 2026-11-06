import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build"     → dist/ (bruges af GitHub Pages; relative stier så det virker under /VVS-dim/)
// "npm run build:fil" → udgivelse/VVS-dim.html: hele programmet i én fil, som kan deles og åbnes ved dobbeltklik
export default defineConfig(({ mode }) =>
  mode === 'enkeltfil'
    ? { plugins: [react(), viteSingleFile()], build: { outDir: 'udgivelse', emptyOutDir: true } }
    : { base: './', plugins: [react()] },
);

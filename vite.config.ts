import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Kun under udvikling (npm run dev): knappen "Gem som eksempel" sender den aktuelle tegning hertil,
 * og den skrives til src/eksempel/eksempel.json – det eksempel alle brugere får ved "Eksempel".
 */
const gemEksempel: Plugin = {
  name: 'gem-eksempel',
  configureServer(server) {
    server.middlewares.use('/__gem-eksempel', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const p = JSON.parse(body);
          if (p?.version !== 2 || !p.BK || !p.BV) throw new Error('Ikke et VVS-dim projekt');
          fs.writeFileSync(path.resolve('src/eksempel/eksempel.json'), JSON.stringify(p, null, 2) + '\n');
          res.end('ok');
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    });
  },
};

// "npm run build"     → dist/ (GitHub Pages; relative stier så det virker under /VVS-dim/)
// "npm run build:fil" → udgivelse/VVS-dim.html: hele programmet i én fil, som kan deles
export default defineConfig(({ mode }) =>
  mode === 'enkeltfil'
    ? { plugins: [react(), viteSingleFile()], build: { outDir: 'udgivelse', emptyOutDir: true } }
    : { base: './', plugins: [react(), gemEksempel] },
);

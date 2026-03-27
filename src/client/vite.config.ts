import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { cpSync } from 'fs';

const spritesDir = path.resolve(__dirname, '../../sprites');

/**
 * The build outputs directly into server/wwwroot so .NET can serve
 * the SPA and API from the same origin (no CORS needed for SignalR).
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sprites-dev-and-build',
      // Dev: serve /sprites/* directly from the workspace-root sprites/ folder
      configureServer(server) {
        server.middlewares.use('/sprites', (req, res, next) => {
          const rel  = (req.url ?? '/').replace(/^\/*/, '');
          const file = path.join(spritesDir, rel);
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.setHeader('Content-Type', 'image/png');
            res.end(fs.readFileSync(file));
          } else {
            next();
          }
        });
      },
      // Build: copy the sprites folder into the wwwroot output directory
      closeBundle() {
        const outSprites = path.resolve(__dirname, '../server/wwwroot/sprites');
        if (fs.existsSync(spritesDir)) {
          cpSync(spritesDir, outSprites, { recursive: true });
        }
      },
    },
  ],

  // Vite dev-server proxies /tagHub to the .NET backend
  server: {
    port: 5173,
    proxy: {
      '/tagHub': {
        target:    process.env.VITE_API_URL ?? 'http://localhost:5000',
        ws:        true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:      '../server/wwwroot',
    emptyOutDir: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

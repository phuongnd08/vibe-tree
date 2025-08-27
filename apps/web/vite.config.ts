import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Allow overriding dev server allowed hosts via env (comma-separated)
  const allowedHostsEnv = env.VITE_ALLOWED_HOSTS;
  const parsedAllowedHosts = allowedHostsEnv
    ? allowedHostsEnv.split(',').map((h) => h.trim()).filter(Boolean)
    : [];
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'VibeTree',
          short_name: 'VibeTree',
          description: 'Vibe code with AI in parallel git worktrees',
          theme_color: '#000000',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    server: {
      port: parseInt(env.VITE_PORT || '3000', 10),
      host: '0.0.0.0', // Bind to all network interfaces for network access
      allowedHosts: parsedAllowedHosts.length > 0 ? parsedAllowedHosts : ['.claude.do', 'code.claude.do'], // Allow Cloudflare tunnel hosts
      hmr: {
        clientPort: 443 // Required for Cloudflare tunnel HTTPS connections
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true
        },
        '/ws': {
          target: 'ws://localhost:3002',
          ws: true
        }
      }
    }
  };
});
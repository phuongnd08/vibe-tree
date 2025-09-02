import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import qrcode from 'qrcode';
import { setupWebSocketHandlers } from './api/websocket';
import { setupRestRoutes } from './api/rest';
import { ShellManager } from './services/ShellManager';
import { AuthService } from './auth/AuthService';
import { getNetworkUrls } from '@vibetree/core';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const PROJECT_PATH = process.env.PROJECT_PATH || process.cwd();

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Initialize services
const shellManager = new ShellManager();
const authService = new AuthService();

// Setup REST routes
setupRestRoutes(app, { shellManager, authService });

// Setup WebSocket handlers
setupWebSocketHandlers(wss, { shellManager, authService });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.0.1' });
});

// Root endpoint - provide server info
app.get('/', (req, res) => {
  res.json({
    name: 'VibeTree Socket Server',
    version: '0.0.1',
    endpoints: {
      websocket: `ws://${req.headers.host}`,
      health: '/health',
      config: '/api/config',
      api: '/api/*'
    },
    webApp: {
      url: 'http://localhost:3000',
      note: 'Run "pnpm dev:web" to start the web interface'
    }
  });
});

// Start server
server.listen(parseInt(PORT.toString()), HOST, async () => {
  const socketUrls = getNetworkUrls(PORT, HOST);
  const webUrls = getNetworkUrls(3000, HOST); // Web app runs on port 3000
  
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(  '║               VibeTree Services Started                ║');
  console.log(  '╚════════════════════════════════════════════════════════╝\n');
  
  console.log('📁 Project Path:', PROJECT_PATH);
  console.log();
  
  console.log('🌐 Web Application (UI):');
  console.log(`   Local:   ${webUrls.local}`);
  console.log(`   Network: ${webUrls.network}`);
  console.log();
  
  console.log('🔌 Socket Server (API/WebSocket):');
  console.log(`   Local:   ${socketUrls.local}`);
  console.log(`   Network: ${socketUrls.network}`);
  console.log(`   WS:      ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log();
  
  // Generate QR code for mobile access to web app
  if (HOST === '0.0.0.0' || !HOST) {
    try {
      const qr = await qrcode.toString(webUrls.network, { type: 'terminal', small: true });
      console.log('📱 Scan QR code to access Web UI from mobile:\n');
      console.log(qr);
      console.log(`   ${webUrls.network}`);
      console.log();
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }
  
  console.log('ℹ️  Make sure the web app is running: pnpm dev:web');
  console.log('Press Ctrl+C to stop the server\n');
});
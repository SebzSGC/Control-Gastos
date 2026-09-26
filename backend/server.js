const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Optional .env loader (zero-dependency)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  } catch (e) {
    console.error('Error reading .env file:', e);
  }
}

// Modular dependencies
const db = require('./config/db');
const healthRoutes = require('./routes/health.routes');
const nfcRoutes = require('./routes/nfc.routes');
const groupsRoutes = require('./routes/groups.routes');
const profilesRoutes = require('./routes/profiles.routes');
const expensesRoutes = require('./routes/expenses.routes');
const billsRoutes = require('./routes/bills.routes');
const visionRoutes = require('./routes/vision.routes');
const setupSocketHandler = require('./sockets/socketHandler');

const app = express();
app.set('trust proxy', 1);

// Dynamic CORS configuration (production domains or open in dev)
const rawCorsOrigin = process.env.CORS_ORIGIN;
const corsOrigin = rawCorsOrigin 
  ? (rawCorsOrigin.includes(',') ? rawCorsOrigin.split(',').map(s => s.trim()) : rawCorsOrigin) 
  : true;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin === true ? '*' : corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Expose io instance to express routes
app.set('io', io);

// Global Middlewares
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json());

// Mount Modular Routes
app.use(healthRoutes);
app.use(nfcRoutes);
app.use(groupsRoutes);
app.use(profilesRoutes);
app.use(expensesRoutes);
app.use(billsRoutes);
app.use(visionRoutes);

// Initialize Socket.io Real-time Handlers
setupSocketHandler(io);

// Serve production static assets from frontend/dist if available
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
  console.log('📦 Frontend production build mounted from frontend/dist');
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling for Docker, Kubernetes, PM2, and Cloud Platforms
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('🔌 HTTP/WebSocket server closed.');
    db.close((err) => {
      if (err) {
        console.error('Error closing SQLite database:', err);
        process.exit(1);
      }
      console.log('🗄️ SQLite database connection closed cleanly.');
      process.exit(0);
    });
  });

  // Force exit after 10s if connections fail to close
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io };

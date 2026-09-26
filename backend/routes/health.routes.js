const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Health check endpoint for container orchestrators (Docker, K8s, Render, Railway, Fly.io)
router.get(['/api/health', '/health'], (req, res) => {
  db.get('SELECT 1 as healthy', (err) => {
    if (err) {
      return res.status(503).json({
        status: 'unhealthy',
        error: 'Database query failed: ' + err.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    }

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'PaySync API',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
  });
});

module.exports = router;

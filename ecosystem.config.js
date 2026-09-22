// ==============================================================================
// PaySync - PM2 Ecosystem Configuration for VPS Servers (Ubuntu/Debian)
// ==============================================================================

module.exports = {
  apps: [
    {
      name: 'paysync-app',
      script: 'backend/server.js',
      cwd: __dirname,
      exec_mode: 'fork', // Fork mode recomendado para SQLite (evita bloqueos de escritura)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_PATH: './backend/app_data.db'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};

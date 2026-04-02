module.exports = {
  apps: [
    {
      name: 'gc-api',
      cwd: './server',
      script: 'dist/app.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      watch: false,
      max_restarts: 50,
      restart_delay: 3000,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
    },
  ],
};

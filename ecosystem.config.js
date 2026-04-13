module.exports = {
  apps: [
    {
      name: 'llm-wiki',
      cwd: 'server',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      instances: 1,
      autorestart: true,
      watch: false,
    }
  ]
};

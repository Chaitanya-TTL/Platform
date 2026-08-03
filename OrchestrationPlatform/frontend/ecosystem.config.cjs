module.exports = {
  apps: [
    {
      name: "enterprise-bom-platform",

      cwd: __dirname,

      script: "./node_modules/next/dist/bin/next",
      args: "start --hostname 0.0.0.0 --port 3000",

      interpreter: "node",

      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,

      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: "1G",

      kill_timeout: 10000,
      listen_timeout: 15000,

      time: true,
      merge_logs: true,

      env_production: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: "3000",

        // Uncomment and adjust only if /api/bom reads a file
        // from this Windows server:
        // TC_EXTRACTION_PATH: "D:\\PlatformData\\tc_extraction.json"
      },
    },
  ],
};

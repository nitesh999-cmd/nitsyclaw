// PM2 ecosystem config for NitsyClaw bot.
// Usage:
//   pm2 start ecosystem.config.cjs     # start
//   pm2 stop nitsyclaw-bot             # stop
//   pm2 restart nitsyclaw-bot          # restart
//   pm2 logs nitsyclaw-bot             # tail logs
//   pm2 save                           # persist across reboots
//   pm2 startup                        # enable PM2 on system boot
//
// Environment: reads from ../../.env.local (monorepo root) via loadBotDotenv() in src/index.ts.
// No env vars need to be listed here — the app loads them at boot.

module.exports = {
  apps: [
    {
      name: "nitsyclaw-bot",
      // tsx runs TypeScript without a compile step.
      script: "tsx",
      args: "src/index.ts",
      cwd: __dirname,
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Restart delay after crash (ms). Exponential back-off handled by PM2 internally.
      restart_delay: 5000,
      // Kill timeout before PM2 sends SIGKILL on stop/restart (ms).
      kill_timeout: 10000,
      // Log location (relative to monorepo root for easy access).
      out_file: "../../logs/bot-out.log",
      error_file: "../../logs/bot-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};

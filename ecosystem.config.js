module.exports = {
    apps: [
        {
            name: 'vietnew-zalo-bot',
            script: 'src/server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'production',
                PORT: 8888,
            },
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/error.log',
            out_file: './logs/output.log',
            merge_logs: true,
            // Restart policy
            exp_backoff_restart_delay: 1000,
            max_restarts: 10,
            min_uptime: '10s',
        },
    ],
};

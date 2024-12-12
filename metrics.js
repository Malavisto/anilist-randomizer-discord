const client = require('prom-client');
const logger = require('./logger');

class MetricsService {
    constructor() {
        // Enable default metrics collection
        client.collectDefaultMetrics();

        // Custom metrics for the AniList Discord Bot
        this.commandCounter = new client.Counter({
            name: 'anilist_bot_commands_total',
            help: 'Total number of commands executed',
            labelNames: ['command_type']
        });

        this.commandDuration = new client.Histogram({
            name: 'anilist_bot_command_duration_seconds',
            help: 'Duration of command execution',
            labelNames: ['command_type']
        });

        this.apiRequestCounter = new client.Counter({
            name: 'anilist_api_requests_total',
            help: 'Total number of requests to AniList API',
            labelNames: ['endpoint', 'status']
        });

        this.userStatsGauge = new client.Gauge({
            name: 'anilist_user_stats',
            help: 'Statistics about users and anime lists',
            labelNames: ['metric_type']
        });
    }

    // Track command execution
    trackCommand(commandType) {
        try {
            this.commandCounter.inc({ command_type: commandType });
            return this.commandDuration.startTimer({ command_type: commandType });
        } catch (error) {
            logger.error('Error tracking command metrics', { error });
        }
    }

    // Track API requests
    trackApiRequest(endpoint, status) {
        try {
            this.apiRequestCounter.inc({ endpoint, status });
        } catch (error) {
            logger.error('Error tracking API request metrics', { error });
        }
    }

    // Track user statistics
    updateUserStats(metricType, value) {
        try {
            this.userStatsGauge.set({ metric_type: metricType }, value);
        } catch (error) {
            logger.error('Error updating user stats metrics', { error });
        }
    }

    // Expose metrics for Prometheus to scrape
    async getMetrics() {
        return client.register.metrics();
    }
}

module.exports = new MetricsService();

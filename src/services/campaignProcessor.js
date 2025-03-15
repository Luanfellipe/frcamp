const moment = require('moment-timezone');
const { pool, redisClient } = require('../index');
const winston = require('winston');
const axios = require('axios');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'campaign-processor.log' })
    ]
});

class CampaignProcessor {
    constructor() {
        this.processing = false;
        this.currentCampaign = null;
        this.DISPATCH_INTERVAL = 35000; // 35 seconds in milliseconds
        this.BUSINESS_HOURS = {
            start: 8, // 8 AM
            end: 18   // 6 PM
        };
    }

    isBusinessHours() {
        const now = moment().tz('America/Sao_Paulo');
        const hour = now.hour();
        return hour >= this.BUSINESS_HOURS.start && hour < this.BUSINESS_HOURS.end;
    }

    async processNextContact() {
        if (!this.currentCampaign || !this.isBusinessHours()) {
            return false;
        }

        try {
            // Get next pending contact
            const contactResult = await pool.query(
                'SELECT * FROM contacts WHERE campaign_id = $1 AND status = $2 LIMIT 1',
                [this.currentCampaign.id, 'pending']
            );

            if (contactResult.rows.length === 0) {
                // No more contacts to process
                await this.completeCampaign();
                return false;
            }

            const contact = contactResult.rows[0];
            const channel = await this.getChannelInfo(this.currentCampaign.channel_id);

            // Send message to Evolution API
            try {
                await axios.post(channel.evolution_webhook_url, {
                    phone: contact.phone_number,
                    message: this.currentCampaign.message
                });

                // Update contact status to sent
                await pool.query(
                    'UPDATE contacts SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
                    ['sent', contact.id]
                );

                // Log successful webhook
                await this.logWebhook(channel.id, 'evolution', {
                    phone: contact.phone_number,
                    message: this.currentCampaign.message
                }, 200);

            } catch (error) {
                // Update contact status to failed
                await pool.query(
                    'UPDATE contacts SET status = $1 WHERE id = $2',
                    ['failed', contact.id]
                );

                // Log failed webhook
                await this.logWebhook(channel.id, 'evolution', {
                    phone: contact.phone_number,
                    message: this.currentCampaign.message
                }, error.response?.status || 500);

                logger.error('Error sending message:', error);
            }

            return true;
        } catch (error) {
            logger.error('Error processing contact:', error);
            return false;
        }
    }

    async getChannelInfo(channelId) {
        const result = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId]);
        return result.rows[0];
    }

    async logWebhook(channelId, type, requestBody, statusCode) {
        await pool.query(
            'INSERT INTO webhook_logs (channel_id, webhook_type, request_body, status_code) VALUES ($1, $2, $3, $4)',
            [channelId, type, requestBody, statusCode]
        );
    }

    async completeCampaign() {
        if (!this.currentCampaign) return;

        await pool.query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['completed', this.currentCampaign.id]
        );

        this.currentCampaign = null;
    }

    async checkForNewCampaigns() {
        if (this.processing || !this.isBusinessHours()) return;

        try {
            // Check for scheduled campaigns that should start now
            const now = moment().tz('America/Sao_Paulo');
            const scheduledResult = await pool.query(
                'SELECT * FROM campaigns WHERE status = $1 AND scheduled_at <= $2 ORDER BY scheduled_at ASC LIMIT 1',
                ['scheduled', now.toISOString()]
            );

            if (scheduledResult.rows.length > 0) {
                this.currentCampaign = scheduledResult.rows[0];
                await pool.query(
                    'UPDATE campaigns SET status = $1 WHERE id = $2',
                    ['running', this.currentCampaign.id]
                );
                return;
            }

            // Check for running campaigns
            const runningResult = await pool.query(
                'SELECT * FROM campaigns WHERE status = $1 ORDER BY created_at ASC LIMIT 1',
                ['running']
            );

            if (runningResult.rows.length > 0) {
                this.currentCampaign = runningResult.rows[0];
            }
        } catch (error) {
            logger.error('Error checking for new campaigns:', error);
        }
    }

    async start() {
        if (this.processing) return;

        this.processing = true;
        logger.info('Campaign processor started');

        while (this.processing) {
            await this.checkForNewCampaigns();

            if (this.currentCampaign && this.isBusinessHours()) {
                await this.processNextContact();
                // Wait for the specified interval before processing next contact
                await new Promise(resolve => setTimeout(resolve, this.DISPATCH_INTERVAL));
            } else {
                // Wait for 1 minute before checking for new campaigns again
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }
    }

    stop() {
        this.processing = false;
        logger.info('Campaign processor stopped');
    }
}

module.exports = new CampaignProcessor();
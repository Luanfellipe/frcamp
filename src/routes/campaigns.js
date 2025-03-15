const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool, redisClient } = require('../index');
const { auth } = require('../middleware/auth');
const moment = require('moment-timezone');

const router = express.Router();

// Webhook endpoint for receiving contacts from CRM
router.post('/webhook/:channelId', async (req, res) => {
    try {
        const { channelId } = req.params;
        const { userId, contacts, message } = req.body;

        // Validate channel and user
        const channelResult = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId]);
        if (channelResult.rows.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        // Find or create campaign for this channel
        let campaignResult = await pool.query(
            'SELECT * FROM campaigns WHERE channel_id = $1 AND status = $2',
            [channelId, 'collecting']
        );

        let campaign;
        if (campaignResult.rows.length === 0) {
            // Create new campaign
            campaignResult = await pool.query(
                'INSERT INTO campaigns (channel_id, message, status) VALUES ($1, $2, $3) RETURNING *',
                [channelId, message, 'collecting']
            );
        }
        campaign = campaignResult.rows[0];

        // Store contacts
        for (const contact of contacts) {
            await pool.query(
                'INSERT INTO contacts (campaign_id, phone_number) VALUES ($1, $2)',
                [campaign.id, contact]
            );
        }

        // Update last contact received timestamp
        await pool.query(
            'UPDATE campaigns SET last_contact_received_at = CURRENT_TIMESTAMP WHERE id = $1',
            [campaign.id]
        );

        // Log webhook
        await pool.query(
            'INSERT INTO webhook_logs (channel_id, webhook_type, request_body, status_code) VALUES ($1, $2, $3, $4)',
            [channelId, 'crm', req.body, 200]
        );

        res.status(200).json({ message: 'Contacts received successfully' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// Get all campaigns
router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT c.*, ch.name as channel_name FROM campaigns c JOIN channels ch ON c.channel_id = ch.id ORDER BY c.created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

// Schedule or start campaign
router.post('/:id/action',
    auth,
    [
        body('action').isIn(['schedule', 'start']).withMessage('Invalid action'),
        body('scheduled_at').optional().isISO8601().withMessage('Invalid date format')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { action, scheduled_at } = req.body;

            // Check if campaign exists and is in collecting state
            const campaignResult = await pool.query(
                'SELECT * FROM campaigns WHERE id = $1 AND status = $2',
                [id, 'collecting']
            );

            if (campaignResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found or not in collecting state' });
            }

            if (action === 'schedule' && scheduled_at) {
                // Schedule campaign
                await pool.query(
                    'UPDATE campaigns SET status = $1, scheduled_at = $2 WHERE id = $3',
                    ['scheduled', scheduled_at, id]
                );
            } else if (action === 'start') {
                // Start campaign immediately
                await pool.query(
                    'UPDATE campaigns SET status = $1 WHERE id = $2',
                    ['running', id]
                );
            }

            res.json({ message: `Campaign ${action === 'schedule' ? 'scheduled' : 'started'} successfully` });
        } catch (error) {
            console.error('Error updating campaign:', error);
            res.status(500).json({ error: 'Failed to update campaign' });
        }
    }
);

// Get campaign details with contacts
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const campaignResult = await pool.query(
            'SELECT c.*, ch.name as channel_name FROM campaigns c JOIN channels ch ON c.channel_id = ch.id WHERE c.id = $1',
            [id]
        );

        if (campaignResult.rows.length === 0) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const contactsResult = await pool.query(
            'SELECT * FROM contacts WHERE campaign_id = $1',
            [id]
        );

        const campaign = campaignResult.rows[0];
        campaign.contacts = contactsResult.rows;

        res.json(campaign);
    } catch (error) {
        console.error('Error fetching campaign details:', error);
        res.status(500).json({ error: 'Failed to fetch campaign details' });
    }
});

module.exports = router;
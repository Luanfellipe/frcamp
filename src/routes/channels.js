const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../index');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Create a new channel (admin only)
router.post('/',
    adminAuth,
    [
        body('name').trim().notEmpty().withMessage('Channel name is required'),
        body('crm_webhook_url').trim().isURL().withMessage('Valid CRM webhook URL is required'),
        body('evolution_webhook_url').trim().isURL().withMessage('Valid Evolution webhook URL is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, crm_webhook_url, evolution_webhook_url } = req.body;
            
            const result = await pool.query(
                'INSERT INTO channels (name, crm_webhook_url, evolution_webhook_url, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
                [name, crm_webhook_url, evolution_webhook_url, req.user.id]
            );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error('Error creating channel:', error);
            res.status(500).json({ error: 'Failed to create channel' });
        }
    }
);

// Get all channels
router.get('/', auth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM channels ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Update channel webhook URLs (admin only)
router.patch('/:id',
    adminAuth,
    [
        body('crm_webhook_url').optional().trim().isURL().withMessage('Valid CRM webhook URL is required'),
        body('evolution_webhook_url').optional().trim().isURL().withMessage('Valid Evolution webhook URL is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { crm_webhook_url, evolution_webhook_url } = req.body;

            let updateQuery = 'UPDATE channels SET ';
            const values = [];
            const updateFields = [];

            if (crm_webhook_url) {
                values.push(crm_webhook_url);
                updateFields.push(`crm_webhook_url = $${values.length}`);
            }

            if (evolution_webhook_url) {
                values.push(evolution_webhook_url);
                updateFields.push(`evolution_webhook_url = $${values.length}`);
            }

            if (updateFields.length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            values.push(id);
            updateQuery += updateFields.join(', ') + ` WHERE id = $${values.length} RETURNING *`;

            const result = await pool.query(updateQuery, values);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Error updating channel:', error);
            res.status(500).json({ error: 'Failed to update channel' });
        }
    }
);

// Delete channel (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM channels WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
        console.error('Error deleting channel:', error);
        res.status(500).json({ error: 'Failed to delete channel' });
    }
});

module.exports = router;
const jwt = require('jsonwebtoken');
const { pool } = require('../index');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        
        if (result.rows.length === 0) {
            throw new Error();
        }

        const user = result.rows[0];
        delete user.password; // Remove password from user object
        
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate.' });
    }
};

const adminAuth = async (req, res, next) => {
    try {
        await auth(req, res, () => {
            if (!req.user.is_admin) {
                return res.status(403).json({ error: 'Admin access required.' });
            }
            next();
        });
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate as admin.' });
    }
};

module.exports = { auth, adminAuth };
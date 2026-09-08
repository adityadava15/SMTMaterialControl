const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyPassword } = require('../utils/password-crypto');

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Get user from database
        const [users] = await db.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const normalizedRole = String(user.role || '').trim().toLowerCase();

        // Verify password (supports AES-256 and auto-migrates legacy bcrypt)
        const validPassword = await verifyPassword(password, user.password, async (newEncrypted) => {
            await db.query('UPDATE users SET password = ? WHERE id = ?', [newEncrypted, user.id]);
        });
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = normalizedRole;

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: normalizedRole
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Check session
router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username,
                role: req.session.role
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;

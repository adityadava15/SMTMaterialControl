const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, isSuperAdmin } = require('../middleware/auth');
const { encryptPassword, decryptPassword, isLegacyHash } = require('../utils/password-crypto');

function normalizeOperatorName(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ');
}

async function ensureOperatorTableSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS operator_names (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL UNIQUE,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const [createdByColumn] = await db.query("SHOW COLUMNS FROM operator_names LIKE 'created_by'");
    if (createdByColumn.length === 0) {
        await db.query('ALTER TABLE operator_names ADD COLUMN created_by INT NULL AFTER name');
    }

    const [createdAtColumn] = await db.query("SHOW COLUMNS FROM operator_names LIKE 'created_at'");
    if (createdAtColumn.length === 0) {
        await db.query('ALTER TABLE operator_names ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    }
}

// Get current user profile
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, username, role, created_at FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, data: users[0] });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update current user profile (Username & Password)
router.put('/profile', isAuthenticated, async (req, res) => {
    try {
        const { username, password } = req.body;
        const userId = req.session.userId;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        // Check if username is taken by another user
        const [existing] = await db.query(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        let query = 'UPDATE users SET username = ?';
        let params = [username];

        // If password is provided, encrypt and update it with AES-256
        if (password && password.trim() !== '') {
            const encryptedPassword = encryptPassword(password.trim());
            query += ', password = ?';
            params.push(encryptedPassword);
        }

        query += ' WHERE id = ?';
        params.push(userId);

        await db.query(query, params);

        // Update session username
        req.session.username = username;

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ADMIN ROUTES BELOW

// Get output operators (all authenticated users)
router.get('/operators', isAuthenticated, async (req, res) => {
    try {
        await ensureOperatorTableSchema();

        const [rows] = await db.query(
            'SELECT id, name, created_at FROM operator_names ORDER BY name ASC'
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get operators error:', error);
        res.status(500).json({ error: 'Failed to fetch operators' });
    }
});

// Create output operator (Superadmin only)
router.post('/operators', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        await ensureOperatorTableSchema();

        const normalizedName = normalizeOperatorName(req.body.name);

        if (!normalizedName) {
            return res.status(400).json({ error: 'Operator name is required' });
        }

        if (normalizedName.length > 100) {
            return res.status(400).json({ error: 'Operator name must be 100 characters or less' });
        }

        try {
            await db.query(
                'INSERT INTO operator_names (name, created_by) VALUES (?, ?)',
                [normalizedName, req.session.userId]
            );
        } catch (insertError) {
            // Backward compatibility: older DB may not have operator_names.created_by
            if (insertError && insertError.code === 'ER_BAD_FIELD_ERROR') {
                await db.query(
                    'INSERT INTO operator_names (name) VALUES (?)',
                    [normalizedName]
                );
            } else {
                throw insertError;
            }
        }

        res.json({ success: true, message: 'Operator created successfully' });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Operator name already exists' });
        }

        console.error('Create operator error:', error);
        res.status(500).json({ error: 'Failed to create operator' });
    }
});

// Get all users (Superadmin only)
router.get('/', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, username, role, password, created_at FROM users ORDER BY created_at DESC'
        );

        const formattedUsers = users.map((user) => {
            const plainPassword = decryptPassword(user.password);
            return {
                id: user.id,
                username: user.username,
                role: user.role,
                password: plainPassword, // Real plaintext password if AES encrypted, null if legacy hash
                is_legacy: isLegacyHash(user.password),
                created_at: user.created_at
            };
        });

        res.json({ success: true, data: formattedUsers });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new user (Superadmin only)
router.post('/', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const normalizedRole = String(role || '').trim().toLowerCase();

        if (!username || !password || !normalizedRole) {
            return res.status(400).json({ error: 'Username, password, and role are required' });
        }

        if (!['superadmin', 'admin', 'user'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Check if username exists
        const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const encryptedPassword = encryptPassword(password.trim());

        await db.query(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username, encryptedPassword, normalizedRole]
        );

        res.json({ success: true, message: 'User created successfully' });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update specific user password (Superadmin only)
router.put('/:id/password', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { password } = req.body;

        if (Number.isNaN(userId) || userId <= 0) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        if (!password || password.trim() === '') {
            return res.status(400).json({ error: 'Password cannot be empty' });
        }

        const [existing] = await db.query('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const encryptedPassword = encryptPassword(password.trim());
        await db.query('UPDATE users SET password = ? WHERE id = ?', [encryptedPassword, userId]);

        res.json({
            success: true,
            message: `Password user "${existing[0].username}" berhasil diperbarui`
        });
    } catch (error) {
        console.error('Update user password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user (Superadmin only)
router.delete('/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const userIdToDelete = req.params.id;

        // Prevent deleting yourself
        if (parseInt(userIdToDelete) === req.session.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.query('DELETE FROM users WHERE id = ?', [userIdToDelete]);

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete output operator (Superadmin only)
router.delete('/operators/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        await ensureOperatorTableSchema();

        const operatorId = parseInt(req.params.id, 10);

        if (Number.isNaN(operatorId) || operatorId <= 0) {
            return res.status(400).json({ error: 'Invalid operator id' });
        }

        const [result] = await db.query('DELETE FROM operator_names WHERE id = ?', [operatorId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Operator not found' });
        }

        res.json({ success: true, message: 'Operator deleted successfully' });
    } catch (error) {
        console.error('Delete operator error:', error);
        res.status(500).json({ error: 'Failed to delete operator' });
    }
});

module.exports = router;

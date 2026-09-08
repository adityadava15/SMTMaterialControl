// Authentication Middleware
const db = require('../config/database');

function getNormalizedRole(req) {
    if (!req || !req.session) {
        return '';
    }

    return String(req.session.role || '').trim().toLowerCase();
}

// Check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
};

// Check if user is superadmin
const isSuperAdmin = async (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    let role = getNormalizedRole(req);

    // Fallback for legacy sessions that don't have role saved yet
    if (!role) {
        try {
            const [users] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.session.userId]);
            if (users.length > 0) {
                role = String(users[0].role || '').trim().toLowerCase();
                req.session.role = role;
            }
        } catch (error) {
            console.error('isSuperAdmin role lookup error:', error);
        }
    }

    if (role === 'superadmin') {
        return next();
    }
    return res.status(403).json({ error: 'Forbidden. Superadmin access required.' });
};

// Check if user has access to material operations (both roles)
const canAccessMaterials = async (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    let role = getNormalizedRole(req);

    // Fallback for legacy sessions that don't have role saved yet
    if (!role) {
        try {
            const [users] = await db.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.session.userId]);
            if (users.length > 0) {
                role = String(users[0].role || '').trim().toLowerCase();
                req.session.role = role;
            }
        } catch (error) {
            console.error('canAccessMaterials role lookup error:', error);
        }
    }

    if (role === 'superadmin' || role === 'admin' || role === 'user') {
        return next();
    }
    return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
};

module.exports = {
    isAuthenticated,
    isSuperAdmin,
    canAccessMaterials
};

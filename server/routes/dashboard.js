const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials } = require('../middleware/auth');

// Get dashboard statistics
router.get('/stats', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        // Get total materials count
        const [materialCount] = await db.query('SELECT COUNT(*) as count FROM materials');

        // Get total quantity
        const [totalQty] = await db.query('SELECT SUM(quantity) as total FROM materials');

        // Get today's input transactions
        const [inputToday] = await db.query(
            'SELECT COUNT(*) as count FROM transactions WHERE transaction_type = "INPUT" AND DATE(created_at) = CURDATE()'
        );

        // Get today's output transactions
        const [outputToday] = await db.query(
            'SELECT COUNT(*) as count FROM transactions WHERE transaction_type = "OUTPUT" AND DATE(created_at) = CURDATE()'
        );

        res.json({
            success: true,
            stats: {
                totalMaterials: materialCount[0].count,
                totalQuantity: totalQty[0].total || 0,
                inputToday: inputToday[0].count,
                outputToday: outputToday[0].count
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;

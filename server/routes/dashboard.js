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

        // Get 14-day daily activity and net stock movement
        const [dailyRows] = await db.query(`
            SELECT
                DATEDIFF(CURDATE(), DATE(created_at)) AS days_ago,
                SUM(CASE WHEN transaction_type = 'INPUT' THEN 1 ELSE 0 END) AS input_count,
                SUM(CASE WHEN transaction_type = 'OUTPUT' THEN 1 ELSE 0 END) AS output_count,
                SUM(CASE
                    WHEN transaction_type = 'INPUT' THEN quantity
                    WHEN transaction_type = 'OUTPUT' THEN -quantity
                    ELSE 0
                END) AS net_qty
            FROM transactions
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
              AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            GROUP BY DATE(created_at)
        `);

        const totalDays = 14;
        const inputDaily14d = Array(totalDays).fill(0);
        const outputDaily14d = Array(totalDays).fill(0);
        const netQtyDaily14d = Array(totalDays).fill(0);
        const labels14d = Array.from({ length: totalDays }, (_, idx) => {
            const daysAgo = totalDays - 1 - idx;
            if (daysAgo === 0) return 'Hari ini';
            if (daysAgo === 1) return 'Kemarin';
            return `H-${daysAgo}`;
        });

        for (const row of dailyRows) {
            const daysAgo = Number(row.days_ago);
            if (daysAgo >= 0 && daysAgo < totalDays) {
                const idx = totalDays - 1 - daysAgo;
                inputDaily14d[idx] = Number(row.input_count) || 0;
                outputDaily14d[idx] = Number(row.output_count) || 0;
                netQtyDaily14d[idx] = Number(row.net_qty) || 0;
            }
        }

        const currentTotalQuantity = Number(totalQty[0].total) || 0;
        const quantityTrend14d = Array(totalDays).fill(0);
        let runningQty = currentTotalQuantity;
        for (let i = totalDays - 1; i >= 0; i--) {
            quantityTrend14d[i] = Math.max(0, runningQty);
            runningQty -= netQtyDaily14d[i];
        }

        res.json({
            success: true,
            stats: {
                totalMaterials: materialCount[0].count,
                totalQuantity: currentTotalQuantity,
                inputToday: inputToday[0].count,
                outputToday: outputToday[0].count,
                labels14d,
                quantityTrend14d,
                inputDaily14d,
                outputDaily14d
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;

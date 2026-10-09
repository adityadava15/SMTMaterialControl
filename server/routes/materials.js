const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials, isSuperAdmin } = require('../middleware/auth');

// Get all materials with pagination and search
router.get('/', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        let query = `
            SELECT 
                m.id, 
                m.name, 
                m.name AS specification,
                m.name AS material_name,
                m.quantity, 
                m.created_at, 
                m.updated_at,
                (SELECT COUNT(*) FROM material_rolls mr WHERE mr.material_id = m.id AND mr.status = 'active') AS active_rolls_count
            FROM materials m
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM materials m';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' WHERE m.id LIKE ? OR m.name LIKE ?';
            countQuery += ' WHERE m.id LIKE ? OR m.name LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offset);

        const [materials] = await db.query(query, params);
        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: materials,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Get materials error:', error);
        res.status(500).json({ error: 'Failed to fetch materials' });
    }
});

// Look up an active roll by its RID (must be before /:id route)
router.get('/roll-by-rid/:rid', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { rid } = req.params;
        const normalizedRid = typeof rid === 'string' ? rid.trim() : '';

        if (!normalizedRid) {
            return res.status(400).json({ success: false, error: 'RID is required' });
        }

        const [rows] = await db.query(`
            SELECT 
                r.id,
                r.material_id,
                r.rid,
                r.quantity AS roll_quantity,
                r.status,
                r.created_at AS input_time,
                m.name AS material_name,
                m.name AS specification,
                m.quantity AS total_stock_quantity
            FROM material_rolls r
            JOIN materials m ON r.material_id = m.id
            WHERE r.rid = ? AND r.status = 'active'
            LIMIT 1
        `, [normalizedRid]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Roll dengan RID "${normalizedRid}" tidak ditemukan dalam stok aktif!`
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Find roll by RID error:', error);
        res.status(500).json({ success: false, error: 'Failed to find roll' });
    }
});

// Get material by ID
router.get('/:id', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { id } = req.params;
        const [materials] = await db.query(
            'SELECT id, name, quantity, created_at, updated_at FROM materials WHERE id = ?',
            [id]
        );

        if (materials.length === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }

        res.json({ success: true, data: materials[0] });
    } catch (error) {
        console.error('Get material error:', error);
        res.status(500).json({ error: 'Failed to fetch material' });
    }
});

// Get all rolls for a specific material (active rolls + all output transactions)
router.get('/:id/rolls', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { id } = req.params;
        const [materialRows] = await db.query('SELECT id, name, quantity FROM materials WHERE id = ?', [id]);
        if (materialRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Material not found' });
        }

        // 1. Fetch active rolls currently in stock
        const [activeRolls] = await db.query(`
            SELECT 
                r.id,
                r.material_id,
                r.rid,
                r.quantity,
                r.status,
                r.created_at AS input_time,
                r.updated_at,
                u_in.username AS input_by
            FROM material_rolls r
            LEFT JOIN transactions t_in ON r.input_transaction_id = t_in.id
            LEFT JOIN users u_in ON t_in.user_id = u_in.id
            WHERE r.material_id = ? AND r.status = 'active'
            ORDER BY r.created_at DESC
        `, [id]);

        // 2. Fetch all OUTPUT records for this material (including past outputs without RID)
        const [outputHistory] = await db.query(`
            SELECT 
                t.id,
                t.material_id,
                t.rid,
                t.quantity,
                'consumed' AS status,
                t.created_at AS output_time,
                t.created_at AS updated_at,
                t.product_type AS output_product_type,
                t.operator_name AS output_operator,
                COALESCE(u.username, t.operator_name, '-') AS output_by
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.material_id = ? AND t.transaction_type = 'OUTPUT'
            ORDER BY t.created_at DESC
        `, [id]);

        const allItems = [...activeRolls, ...outputHistory];

        res.json({
            success: true,
            material: materialRows[0],
            data: allItems,
            activeCount: activeRolls.length,
            consumedCount: outputHistory.length
        });
    } catch (error) {
        console.error('Get material rolls error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch material rolls' });
    }
});

// Add new material (accessible by superadmin, admin, and user)
router.post('/', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { id, quantity, rid } = req.body;
        const normalizedId = typeof id === 'string' ? id.trim() : '';
        const normalizedRid = typeof rid === 'string' && rid.trim() ? rid.trim() : null;
        const parsedQty = parseInt(quantity, 10);

        if (!normalizedId || Number.isNaN(parsedQty) || parsedQty <= 0) {
            return res.status(400).json({ error: 'Material ID and valid quantity are required' });
        }

        // Validate duplicate RID: RID cannot already exist in active stock
        if (normalizedRid) {
            const [existingActiveRoll] = await db.query(
                `SELECT r.id, r.material_id, m.name AS material_name, r.quantity, r.created_at
                 FROM material_rolls r
                 LEFT JOIN materials m ON r.material_id = m.id
                 WHERE r.rid = ? AND r.status = 'active'
                 LIMIT 1`,
                [normalizedRid]
            );

            if (existingActiveRoll.length > 0) {
                const er = existingActiveRoll[0];
                return res.status(400).json({
                    success: false,
                    error: `Roll dengan RID "${normalizedRid}" sudah ada di dalam stok (Material: ${er.material_id} - ${er.material_name || ''}). Tidak dapat di-input ulang!`
                });
            }
        }

        // Check existing material
        const [existingRows] = await db.query('SELECT id, name, quantity FROM materials WHERE id = ?', [normalizedId]);
        const existingMaterial = existingRows[0] || null;

        // Name source: master catalog first, fallback existing material name
        const [catalogRows] = await db.query(
            'SELECT specification FROM material_catalog WHERE material_id = ?',
            [normalizedId]
        );
        const catalogName = catalogRows[0] ? (catalogRows[0].specification || catalogRows[0].material_name) : null;

        if (!catalogName && !existingMaterial) {
            return res.status(400).json({
                error: 'Material ID belum terdaftar di master data. Upload master data terlebih dahulu.'
            });
        }

        const finalName = catalogName || existingMaterial.name;

        if (existingMaterial) {
            const newQuantity = existingMaterial.quantity + parsedQty;

            await db.query(
                'UPDATE materials SET quantity = ?, name = ? WHERE id = ?',
                [newQuantity, finalName, normalizedId]
            );

            const [txResult] = await db.query(
                'INSERT INTO transactions (material_id, material_name, transaction_type, quantity, rid, user_id) VALUES (?, ?, ?, ?, ?, ?)',
                [normalizedId, finalName, 'INPUT', parsedQty, normalizedRid, req.session.userId]
            );

            const inputTxId = txResult.insertId;

            // Track roll in material_rolls
            if (normalizedRid) {
                await db.query(
                    'INSERT INTO material_rolls (material_id, rid, quantity, status, input_transaction_id) VALUES (?, ?, ?, "active", ?)',
                    [normalizedId, normalizedRid, parsedQty, inputTxId]
                );
            }

            return res.json({
                success: true,
                message: 'Material quantity updated',
                data: { id: normalizedId, name: finalName, quantity: newQuantity, rid: normalizedRid }
            });
        }

        await db.query(
            'INSERT INTO materials (id, name, quantity) VALUES (?, ?, ?)',
            [normalizedId, finalName, parsedQty]
        );

        const [txResult] = await db.query(
            'INSERT INTO transactions (material_id, material_name, transaction_type, quantity, rid, user_id) VALUES (?, ?, ?, ?, ?, ?)',
            [normalizedId, finalName, 'INPUT', parsedQty, normalizedRid, req.session.userId]
        );

        const inputTxId = txResult.insertId;

        // Track roll in material_rolls
        if (normalizedRid) {
            await db.query(
                'INSERT INTO material_rolls (material_id, rid, quantity, status, input_transaction_id) VALUES (?, ?, ?, "active", ?)',
                [normalizedId, normalizedRid, parsedQty, inputTxId]
            );
        }

        res.json({
            success: true,
            message: 'Material added successfully',
            data: { id: normalizedId, name: finalName, quantity: parsedQty, rid: normalizedRid }
        });
    } catch (error) {
        console.error('Add material error:', error);
        res.status(500).json({ error: 'Failed to add material' });
    }
});

// Update material quantity
router.put('/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        const parsedQty = parseInt(quantity, 10);

        if (Number.isNaN(parsedQty) || parsedQty < 0) {
            return res.status(400).json({ error: 'Valid quantity is required' });
        }

        const [result] = await db.query(
            'UPDATE materials SET quantity = ? WHERE id = ?',
            [parsedQty, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }

        res.json({ success: true, message: 'Material updated successfully' });
    } catch (error) {
        console.error('Update material error:', error);
        res.status(500).json({ error: 'Failed to update material' });
    }
});

// Delete material
router.delete('/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query('DELETE FROM materials WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }

        res.json({ success: true, message: 'Material deleted successfully' });
    } catch (error) {
        console.error('Delete material error:', error);
        res.status(500).json({ error: 'Failed to delete material' });
    }
});

module.exports = router;

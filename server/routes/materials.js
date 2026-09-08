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

        let query = 'SELECT id, name, quantity, created_at, updated_at FROM materials';
        let countQuery = 'SELECT COUNT(*) as total FROM materials';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' WHERE id LIKE ? OR name LIKE ?';
            countQuery += ' WHERE id LIKE ? OR name LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
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

// Add new material (Superadmin only via input page)
router.post('/', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { id, quantity } = req.body;
        const normalizedId = typeof id === 'string' ? id.trim() : '';
        const parsedQty = parseInt(quantity, 10);

        if (!normalizedId || Number.isNaN(parsedQty) || parsedQty <= 0) {
            return res.status(400).json({ error: 'Material ID and valid quantity are required' });
        }

        // Check existing material
        const [existingRows] = await db.query('SELECT id, name, quantity FROM materials WHERE id = ?', [normalizedId]);
        const existingMaterial = existingRows[0] || null;

        // Name source: master catalog first, fallback existing material name
        const [catalogRows] = await db.query(
            'SELECT material_name FROM material_catalog WHERE material_id = ?',
            [normalizedId]
        );
        const catalogName = catalogRows[0] ? catalogRows[0].material_name : null;

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

            await db.query(
                'INSERT INTO transactions (material_id, material_name, transaction_type, quantity, user_id) VALUES (?, ?, ?, ?, ?)',
                [normalizedId, finalName, 'INPUT', parsedQty, req.session.userId]
            );

            return res.json({
                success: true,
                message: 'Material quantity updated',
                data: { id: normalizedId, name: finalName, quantity: newQuantity }
            });
        }

        await db.query(
            'INSERT INTO materials (id, name, quantity) VALUES (?, ?, ?)',
            [normalizedId, finalName, parsedQty]
        );

        await db.query(
            'INSERT INTO transactions (material_id, material_name, transaction_type, quantity, user_id) VALUES (?, ?, ?, ?, ?)',
            [normalizedId, finalName, 'INPUT', parsedQty, req.session.userId]
        );

        res.json({
            success: true,
            message: 'Material added successfully',
            data: { id: normalizedId, name: finalName, quantity: parsedQty }
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

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMasterData } = require('../middleware/auth');

// Get all meter types (accessible by authenticated users)
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const [meterTypes] = await db.query(`
            SELECT 
                mt.id,
                mt.name,
                mt.created_at,
                u.username AS created_by_name
            FROM meter_types mt
            LEFT JOIN users u ON mt.created_by = u.id
            ORDER BY mt.name ASC
        `);

        res.json({
            success: true,
            data: meterTypes
        });
    } catch (error) {
        console.error('Get meter types error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch meter types' });
    }
});

// Add new meter type (accessible by superadmin and admin)
router.post('/', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const { name } = req.body;
        const normalizedName = typeof name === 'string' ? name.trim().toUpperCase() : '';

        if (!normalizedName) {
            return res.status(400).json({ success: false, error: 'Nama type meter tidak boleh kosong' });
        }

        // Check duplicate
        const [existing] = await db.query('SELECT id, name FROM meter_types WHERE name = ?', [normalizedName]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Type meter "${normalizedName}" sudah terdaftar!`
            });
        }

        const [result] = await db.query(
            'INSERT INTO meter_types (name, created_by) VALUES (?, ?)',
            [normalizedName, req.session.userId || null]
        );

        res.json({
            success: true,
            message: `Type meter "${normalizedName}" berhasil ditambahkan`,
            data: {
                id: result.insertId,
                name: normalizedName
            }
        });
    } catch (error) {
        console.error('Add meter type error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Type meter sudah terdaftar!' });
        }
        res.status(500).json({ success: false, error: 'Failed to add meter type' });
    }
});

// Delete meter type (accessible by superadmin and admin)
router.delete('/:id', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await db.query('SELECT id, name FROM meter_types WHERE id = ?', [id]);

        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: 'Type meter tidak ditemukan' });
        }

        await db.query('DELETE FROM meter_types WHERE id = ?', [id]);

        res.json({
            success: true,
            message: `Type meter "${existing[0].name}" berhasil dihapus`
        });
    } catch (error) {
        console.error('Delete meter type error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete meter type' });
    }
});

module.exports = router;

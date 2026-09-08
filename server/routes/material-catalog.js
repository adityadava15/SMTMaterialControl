const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials, isSuperAdmin } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

function normalizeCatalogRows(rawRows) {
    if (!rawRows || rawRows.length === 0) return [];

    let idCol = 0;
    let nameCol = 1;
    let startRow = 0;

    // Scan first 5 rows to detect header names if present
    for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        let detectedId = -1;
        let detectedName = -1;

        row.forEach((cell, idx) => {
            const val = String(cell || '').trim().toLowerCase();
            if (val === 'material id' || val === 'material_id' || val === 'kode material' || val === 'part number' || val === 'part no' || val === 'item code') {
                detectedId = idx;
            } else if ((val === 'id' || val === 'kode') && detectedId === -1) {
                detectedId = idx;
            }

            if (val === 'material name' || val === 'material_name' || val === 'nama material' || val === 'description' || val === 'deskripsi' || val === 'part name') {
                detectedName = idx;
            } else if ((val === 'name' || val === 'nama') && detectedName === -1) {
                detectedName = idx;
            }
        });

        if (detectedId !== -1 && detectedName !== -1) {
            idCol = detectedId;
            nameCol = detectedName;
            startRow = r + 1;
            break;
        }
    }

    const map = new Map();

    for (let i = startRow; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row)) continue;

        const materialId = String(row[idCol] ?? '').trim();
        const materialName = String(row[nameCol] ?? '').trim();

        if (!materialId || !materialName) continue;

        const idLower = materialId.toLowerCase();
        const nameLower = materialName.toLowerCase();
        const isHeaderLike =
            (idLower.includes('material') && nameLower.includes('name')) ||
            idLower === 'id' ||
            idLower === 'material_id' ||
            idLower === 'kode material';

        if (isHeaderLike) continue;

        // Upsert in map: latest row wins if duplicate within same Excel file
        map.set(materialId, { materialId, materialName });
    }

    return Array.from(map.values());
}

// Get catalog list (Superadmin)
router.get('/', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 50;
        const offset = (pageNum - 1) * limitNum;

        let query = 'SELECT material_id, material_name, created_at, updated_at FROM material_catalog';
        let countQuery = 'SELECT COUNT(*) AS total FROM material_catalog';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' WHERE material_id LIKE ? OR material_name LIKE ?';
            countQuery += ' WHERE material_id LIKE ? OR material_name LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offset);

        const [rows] = await db.query(query, params);
        const [countRows] = await db.query(countQuery, countParams);
        const total = countRows[0].total;

        res.json({
            success: true,
            data: rows,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Get material catalog error:', error);
        res.status(500).json({ error: 'Failed to fetch material catalog' });
    }
});

// Export all master materials to Excel (Superadmin)
router.get('/export', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT material_id, material_name, updated_at, created_at FROM material_catalog ORDER BY material_id ASC'
        );

        const exportData = rows.map((r, idx) => ({
            'No': idx + 1,
            'Material ID': r.material_id,
            'Material Name': r.material_name,
            'Terakhir Diperbarui': r.updated_at ? new Date(r.updated_at).toLocaleString('id-ID') : '-'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        ws['!cols'] = [
            { wch: 6 },
            { wch: 26 },
            { wch: 42 },
            { wch: 24 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Master Material');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `Master_Material_SMT_${dateStr}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
    } catch (error) {
        console.error('Export material catalog error:', error);
        res.status(500).json({ error: 'Gagal mengekspor data master material' });
    }
});

// Get single catalog item (used by input pages)
router.get('/:materialId', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { materialId } = req.params;
        const [rows] = await db.query(
            'SELECT material_id, material_name, created_at, updated_at FROM material_catalog WHERE material_id = ?',
            [materialId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Material master not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Get material catalog item error:', error);
        res.status(500).json({ error: 'Failed to fetch material master data' });
    }
});

// Upload Excel file (Superadmin)
router.post('/upload', isAuthenticated, isSuperAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File Excel wajib dipilih' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            return res.status(400).json({ error: 'File Excel tidak memiliki sheet' });
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const rows = normalizeCatalogRows(rawRows);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Tidak ada data valid pada file Excel' });
        }

        const connection = await db.getConnection();
        let inserted = 0;
        let updated = 0;

        try {
            await connection.beginTransaction();

            for (const row of rows) {
                const [result] = await connection.query(
                    `
                    INSERT INTO material_catalog (material_id, material_name, created_by, updated_by)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        material_name = VALUES(material_name),
                        updated_by = VALUES(updated_by),
                        updated_at = CURRENT_TIMESTAMP
                    `,
                    [row.materialId, row.materialName, req.session.userId, req.session.userId]
                );

                if (result.affectedRows === 1) {
                    inserted += 1;
                } else if (result.affectedRows === 2) {
                    updated += 1;
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        res.json({
            success: true,
            message: 'Upload master material berhasil',
            summary: {
                totalValidRows: rows.length,
                inserted,
                updated
            }
        });
    } catch (error) {
        console.error('Upload material catalog error:', error);
        res.status(500).json({ error: 'Failed to upload material catalog' });
    }
});

// Create single catalog item (Superadmin)
router.post('/', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const materialId = String(req.body.materialId || '').trim();
        const materialName = String(req.body.materialName || '').trim();

        if (!materialId || !materialName) {
            return res.status(400).json({ error: 'Material ID dan material name wajib diisi' });
        }

        await db.query(
            `
            INSERT INTO material_catalog (material_id, material_name, created_by, updated_by)
            VALUES (?, ?, ?, ?)
            `,
            [materialId, materialName, req.session.userId, req.session.userId]
        );

        res.json({ success: true, message: 'Master material berhasil ditambahkan' });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Material ID sudah ada di master data' });
        }
        console.error('Create material catalog error:', error);
        res.status(500).json({ error: 'Failed to create material master data' });
    }
});

// Update catalog item (Superadmin)
router.put('/:materialId', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const oldId = String(req.params.materialId || '').trim();
        const newId = String(req.body.materialId || '').trim();
        const materialName = String(req.body.materialName || '').trim();

        if (!oldId || !newId || !materialName) {
            return res.status(400).json({ error: 'Material ID dan material name wajib diisi' });
        }

        const [result] = await db.query(
            `
            UPDATE material_catalog
            SET material_id = ?, material_name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE material_id = ?
            `,
            [newId, materialName, req.session.userId, oldId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Material master not found' });
        }

        res.json({ success: true, message: 'Master material berhasil diupdate' });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Material ID baru sudah digunakan' });
        }
        console.error('Update material catalog error:', error);
        res.status(500).json({ error: 'Failed to update material master data' });
    }
});

// Delete catalog item (Superadmin)
router.delete('/:materialId', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { materialId } = req.params;
        const [result] = await db.query('DELETE FROM material_catalog WHERE material_id = ?', [materialId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Material master not found' });
        }

        res.json({ success: true, message: 'Master material berhasil dihapus' });
    } catch (error) {
        console.error('Delete material catalog error:', error);
        res.status(500).json({ error: 'Failed to delete material master data' });
    }
});

module.exports = router;

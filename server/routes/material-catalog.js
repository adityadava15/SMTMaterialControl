const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials, canAccessMasterData } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

function extractMaterialID(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('Z01') || upper.startsWith('Z0')) {
        const tokens = trimmed.split(/\s+/);
        if (tokens.length > 5 && tokens[5] !== 'null') {
            return tokens[5].trim();
        }
    }
    const ampIndex = trimmed.indexOf('&');
    if (ampIndex > 0) {
        return trimmed.substring(0, ampIndex).trim();
    }
    return trimmed;
}

function normalizeCatalogRows(rawRows) {
    if (!rawRows || rawRows.length === 0) return [];

    let idCol = 0;
    let specCol = 1;
    let qtyCol = -1;
    let unitCol = -1;
    let startRow = 0;

    // Scan first 5 rows to detect header names if present
    for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        let detectedId = -1;
        let detectedSpec = -1;
        let detectedQty = -1;
        let detectedUnit = -1;

        row.forEach((cell, idx) => {
            const val = String(cell || '').trim().toLowerCase();
            if (val === 'id' || val === 'material id' || val === 'material_id' || val === 'kode material' || val === 'part number' || val === 'part no' || val === 'item code') {
                detectedId = idx;
            } else if (val === 'kode' && detectedId === -1) {
                detectedId = idx;
            }

            if (val === 'specification' || val === 'spesifikasi' || val === 'spec' || val === 'spek' || val === 'material name' || val === 'material_name' || val === 'nama material' || val === 'description' || val === 'deskripsi' || val === 'part name') {
                detectedSpec = idx;
            } else if ((val === 'name' || val === 'nama') && detectedSpec === -1) {
                detectedSpec = idx;
            }

            if (val === 'qty' || val === 'quantity' || val === 'jumlah' || val === 'kuantitas' || val === 'total') {
                detectedQty = idx;
            }

            if (val === 'unit' || val === 'satuan' || val === 'uom') {
                detectedUnit = idx;
            }
        });

        if (detectedId !== -1 && detectedSpec !== -1) {
            idCol = detectedId;
            specCol = detectedSpec;
            if (detectedQty !== -1) qtyCol = detectedQty;
            if (detectedUnit !== -1) unitCol = detectedUnit;
            startRow = r + 1;
            break;
        }
    }

    // Default column index fallback if headers were not detected but at least 4 columns exist
    if (qtyCol === -1 && rawRows[startRow] && rawRows[startRow].length >= 3) {
        qtyCol = 2;
    }
    if (unitCol === -1 && rawRows[startRow] && rawRows[startRow].length >= 4) {
        unitCol = 3;
    }

    const map = new Map();

    for (let i = startRow; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row)) continue;

        const rawId = String(row[idCol] ?? '').trim();
        const materialId = extractMaterialID(rawId);
        const specification = String(row[specCol] ?? '').trim();

        let qty = 1;
        if (qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== null && String(row[qtyCol]).trim() !== '') {
            const parsed = parseInt(String(row[qtyCol]).replace(/[^0-9]/g, ''), 10);
            if (!isNaN(parsed) && parsed > 0) qty = parsed;
        }

        let unit = 'PCS';
        if (unitCol !== -1 && row[unitCol] !== undefined && row[unitCol] !== null && String(row[unitCol]).trim() !== '') {
            const trimmedUnit = String(row[unitCol]).trim().toUpperCase();
            if (trimmedUnit) unit = trimmedUnit;
        }

        if (!materialId || !specification) continue;

        const idLower = materialId.toLowerCase();
        const specLower = specification.toLowerCase();
        const isHeaderLike =
            (idLower.includes('material') && (specLower.includes('name') || specLower.includes('spec') || specLower.includes('spesifikasi'))) ||
            idLower === 'id' ||
            idLower === 'material_id' ||
            idLower === 'kode material';

        if (isHeaderLike) continue;

        // Upsert in map: latest row wins if duplicate within same Excel file
        map.set(materialId, { materialId, specification, qty, unit, materialName: specification });
    }

    return Array.from(map.values());
}

// Get catalog list (Superadmin & Admin)
router.get('/', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 50;
        const offset = (pageNum - 1) * limitNum;

        let query = 'SELECT material_id, specification, qty, unit, specification AS material_name, created_at, updated_at FROM material_catalog';
        let countQuery = 'SELECT COUNT(*) AS total FROM material_catalog';
        const params = [];
        const countParams = [];

        if (search) {
            query += ' WHERE material_id LIKE ? OR specification LIKE ? OR unit LIKE ?';
            countQuery += ' WHERE material_id LIKE ? OR specification LIKE ? OR unit LIKE ?';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
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

// Export all master materials to Excel (Superadmin & Admin)
router.get('/export', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT material_id, specification, qty, unit, updated_at, created_at FROM material_catalog ORDER BY material_id ASC'
        );

        const exportData = rows.map((r, idx) => ({
            'No': idx + 1,
            'ID': r.material_id,
            'Specification': r.specification,
            'Qty': r.qty ?? 1,
            'Unit': r.unit || 'PCS',
            'Terakhir Diperbarui': r.updated_at ? new Date(r.updated_at).toLocaleString('id-ID') : '-'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        ws['!cols'] = [
            { wch: 6 },
            { wch: 24 },
            { wch: 50 },
            { wch: 10 },
            { wch: 10 },
            { wch: 22 }
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
        const rawId = String(req.params.materialId || '').trim();
        const materialId = extractMaterialID(rawId);
        const [rows] = await db.query(
            'SELECT material_id, specification, qty, unit, specification AS material_name, created_at, updated_at FROM material_catalog WHERE LOWER(TRIM(material_id)) = LOWER(TRIM(?))',
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

// Upload Excel file (Superadmin & Admin)
router.post('/upload', isAuthenticated, canAccessMasterData, upload.single('file'), async (req, res) => {
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
        let unchanged = 0;

        try {
            await connection.beginTransaction();

            for (const row of rows) {
                const specValue = row.specification || row.materialName;
                const qtyValue = row.qty || 1;
                const unitValue = row.unit || 'PCS';
                const [result] = await connection.query(
                    `
                    INSERT INTO material_catalog (material_id, specification, qty, unit, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        specification = VALUES(specification),
                        qty = VALUES(qty),
                        unit = VALUES(unit),
                        updated_by = VALUES(updated_by),
                        updated_at = CURRENT_TIMESTAMP
                    `,
                    [row.materialId, specValue, qtyValue, unitValue, req.session.userId, req.session.userId]
                );

                if (result.affectedRows === 1) {
                    inserted += 1;
                } else if (result.affectedRows === 2) {
                    updated += 1;
                } else {
                    unchanged += 1;
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
            message: `Upload master material berhasil (${inserted} baru ditambahkan, ${updated} diperbarui)`,
            summary: {
                totalValidRows: rows.length,
                inserted,
                updated,
                unchanged
            }
        });
    } catch (error) {
        console.error('Upload material catalog error:', error);
        res.status(500).json({ error: 'Failed to upload material catalog' });
    }
});

// Create single catalog item (Superadmin & Admin)
router.post('/', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const rawMaterialId = String(req.body.materialId || '').trim();
        const materialId = extractMaterialID(rawMaterialId);
        const specification = String(req.body.specification || req.body.materialName || '').trim();
        const parsedQty = parseInt(req.body.qty, 10);
        const qty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;
        const unit = String(req.body.unit || 'PCS').trim().toUpperCase() || 'PCS';

        if (!materialId || !specification) {
            return res.status(400).json({ error: 'ID dan Specification wajib diisi' });
        }

        // Cek duplikasi ID: jika ID sudah ada, tolak meskipun spesifikasi berbeda
        const [existing] = await db.query(
            'SELECT material_id, specification FROM material_catalog WHERE LOWER(TRIM(material_id)) = LOWER(TRIM(?))',
            [materialId]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                error: `ID "${materialId}" sudah terdaftar di data master dengan spesifikasi "${existing[0].specification}". Tidak dapat menambahkan ID yang sama!`
            });
        }

        await db.query(
            `
            INSERT INTO material_catalog (material_id, specification, qty, unit, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [materialId, specification, qty, unit, req.session.userId, req.session.userId]
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

// Update catalog item (Superadmin & Admin)
router.put('/:materialId', isAuthenticated, canAccessMasterData, async (req, res) => {
    try {
        const oldId = String(req.params.materialId || '').trim();
        const rawNewId = String(req.body.materialId || '').trim();
        const newId = extractMaterialID(rawNewId);
        const specification = String(req.body.specification || req.body.materialName || '').trim();
        const parsedQty = parseInt(req.body.qty, 10);
        const qty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;
        const unit = String(req.body.unit || 'PCS').trim().toUpperCase() || 'PCS';

        if (!oldId || !newId || !specification) {
            return res.status(400).json({ error: 'ID dan Specification wajib diisi' });
        }

        // Cek jika ID diubah ke ID lain yang sudah ada di database
        if (newId.toLowerCase() !== oldId.toLowerCase()) {
            const [existing] = await db.query(
                'SELECT material_id, specification FROM material_catalog WHERE LOWER(TRIM(material_id)) = LOWER(TRIM(?)) AND LOWER(TRIM(material_id)) != LOWER(TRIM(?))',
                [newId, oldId]
            );

            if (existing.length > 0) {
                return res.status(400).json({
                    error: `ID "${newId}" sudah digunakan oleh material "${existing[0].specification}". Tidak dapat menduplikasi ID!`
                });
            }
        }

        const [result] = await db.query(
            `
            UPDATE material_catalog
            SET material_id = ?, specification = ?, qty = ?, unit = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE material_id = ?
            `,
            [newId, specification, qty, unit, req.session.userId, oldId]
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

// Delete catalog item (Superadmin & Admin)
router.delete('/:materialId', isAuthenticated, canAccessMasterData, async (req, res) => {
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

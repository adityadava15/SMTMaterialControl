const express = require('express');
const router = express.Router();
const os = require('os');
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials, isSuperAdmin } = require('../middleware/auth');
const watcher = require('../services/samsung-hanwha-watcher');

const VALID_METER_TYPES = ['HXE128-KP', 'HXE12FR', 'HXE310', 'HXE310-KP'];

async function ensureMachineSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS machine_meter_usage (
            id INT PRIMARY KEY AUTO_INCREMENT,
            transaction_id INT NULL,
            material_id VARCHAR(50) NOT NULL,
            material_name VARCHAR(255) NOT NULL,
            meter_type VARCHAR(50) NOT NULL,
            used_quantity INT NOT NULL DEFAULT 0,
            source_pc VARCHAR(100) NULL,
            notes VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
        )
    `);
}

// Start auto watcher on boot
watcher.ensureWatcherTables().then(() => {
    const cfg = watcher.loadWatcherConfig();
    if (cfg.enabled) {
        watcher.startWatcher(cfg.pollIntervalSeconds || 15);
    }
}).catch(err => console.error('Failed to init watcher:', err));

function getLocalNetworkIps() {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Pick IPv4 and non-internal
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips.length > 0 ? ips : ['localhost'];
}

// Get LAN Connection Info (for Machine PC communication)
router.get('/lan-info', isAuthenticated, canAccessMaterials, (req, res) => {
    const ips = getLocalNetworkIps();
    const port = process.env.PORT || 3000;
    const urls = ips.map(ip => `http://${ip}:${port}`);

    res.json({
        success: true,
        data: {
            ips,
            port,
            serverUrls: urls,
            detectEndpoint: '/api/machine-output/detect-meter',
            supportedMeterTypes: VALID_METER_TYPES
        }
    });
});

// Live Feed: Material from Output Stok automatically in Machine + Meter Type Usage Breakdown
router.get('/feed', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        await ensureMachineSchema();

        const { search = '', meterType = '', status = '', limit = 50 } = req.query;
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

        // 1. Get all OUTPUT transactions (materials released from stock to machine)
        let query = `
            SELECT 
                t.id AS transaction_id,
                t.material_id,
                t.material_name,
                t.product_type AS default_meter_type,
                t.operator_name AS stok_operator,
                t.quantity AS total_masuk_mesin,
                t.created_at AS stok_output_time
            FROM transactions t
            WHERE t.transaction_type = 'OUTPUT'
        `;
        const params = [];

        if (search) {
            query += ' AND (t.material_id LIKE ? OR t.material_name LIKE ? OR t.operator_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY t.created_at DESC LIMIT ?';
        params.push(parsedLimit);

        const [stokRows] = await db.query(query, params);

        if (stokRows.length === 0) {
            return res.json({
                success: true,
                data: [],
                stats: {
                    totalMaterialCount: 0,
                    totalPcsMasuk: 0,
                    totalPcsTerpakai: 0,
                    totalPcsSisa: 0,
                    activeMeterTypesCount: 0
                }
            });
        }

        const transactionIds = stokRows.map(r => r.transaction_id);

        // 2. Fetch meter usage breakdown for these transactions
        const [usageRows] = await db.query(`
            SELECT 
                transaction_id,
                material_id,
                meter_type,
                SUM(used_quantity) AS total_used,
                MAX(created_at) AS last_detected_at
            FROM machine_meter_usage
            WHERE transaction_id IN (?)
            GROUP BY transaction_id, material_id, meter_type
        `, [transactionIds]);

        // Group usage by transaction_id
        const usageMap = new Map();
        const allMeterTypesSet = new Set();

        for (const u of usageRows) {
            if (!usageMap.has(u.transaction_id)) {
                usageMap.set(u.transaction_id, []);
            }
            usageMap.get(u.transaction_id).push({
                meterType: u.meter_type,
                usedQuantity: Number(u.total_used) || 0,
                lastDetectedAt: u.last_detected_at
            });
            allMeterTypesSet.add(u.meter_type);
        }

        let totalPcsMasuk = 0;
        let totalPcsTerpakai = 0;

        // 3. Assemble enriched response
        let enrichedRows = stokRows.map(row => {
            const usages = usageMap.get(row.transaction_id) || [];
            const totalUsed = usages.reduce((sum, u) => sum + u.usedQuantity, 0);
            const totalMasuk = Number(row.total_masuk_mesin) || 0;
            const remaining = Math.max(0, totalMasuk - totalUsed);
            const usagePercent = totalMasuk > 0 ? Math.min(100, Math.round((totalUsed / totalMasuk) * 100)) : 0;

            totalPcsMasuk += totalMasuk;
            totalPcsTerpakai += totalUsed;

            let machineStatus = 'READY'; // Ready on machine, no usage yet
            let statusLabel = 'Siap di Mesin (100%)';
            let statusColor = '#3b82f6';

            if (remaining === 0) {
                machineStatus = 'EXHAUSTED';
                statusLabel = 'Habis Terpakai';
                statusColor = '#ef4444';
            } else if (remaining <= totalMasuk * 0.2) {
                machineStatus = 'LOW';
                statusLabel = 'Menipis (<20%)';
                statusColor = '#f59e0b';
            } else if (totalUsed > 0) {
                machineStatus = 'RUNNING';
                statusLabel = 'Aktif Digunakan';
                statusColor = '#10b981';
            }

            // Find last detection timestamp
            let lastDetectedAt = null;
            if (usages.length > 0) {
                const dates = usages.map(u => new Date(u.lastDetectedAt).getTime()).filter(t => !isNaN(t));
                if (dates.length > 0) {
                    lastDetectedAt = new Date(Math.max(...dates));
                }
            }

            return {
                transactionId: row.transaction_id,
                materialId: row.material_id,
                materialName: row.material_name,
                defaultMeterType: row.default_meter_type,
                stokOperator: row.stok_operator,
                stokOutputTime: row.stok_output_time,
                totalMasukMesin: totalMasuk,
                totalTerpakaiMesin: totalUsed,
                sisaKomponenMesin: remaining,
                persentaseTerpakai: usagePercent,
                machineStatus,
                statusLabel,
                statusColor,
                meterBreakdown: usages,
                lastDetectedAt
            };
        });

        // Filter by meterType if requested
        if (meterType) {
            enrichedRows = enrichedRows.filter(r => 
                r.meterBreakdown.some(m => m.meterType.toLowerCase() === meterType.toLowerCase()) ||
                (r.defaultMeterType && r.defaultMeterType.toLowerCase() === meterType.toLowerCase())
            );
        }

        // Filter by status if requested
        if (status) {
            enrichedRows = enrichedRows.filter(r => r.machineStatus.toLowerCase() === status.toLowerCase());
        }

        const totalPcsSisa = Math.max(0, totalPcsMasuk - totalPcsTerpakai);

        res.json({
            success: true,
            data: enrichedRows,
            stats: {
                totalMaterialCount: stokRows.length,
                totalPcsMasuk,
                totalPcsTerpakai,
                totalPcsSisa,
                activeMeterTypesCount: allMeterTypesSet.size
            }
        });
    } catch (error) {
        console.error('Get machine feed error:', error);
        res.status(500).json({ error: 'Failed to fetch machine meter usage feed' });
    }
});

// Endpoint for LAN Machine PC to record/detect material consumption per meter type
router.post('/detect-meter', async (req, res) => {
    try {
        await ensureMachineSchema();

        const { materialId, meterType, usedQuantity, sourcePc, notes, transactionId } = req.body;

        const cleanMaterialId = String(materialId || '').trim();
        const cleanMeterType = String(meterType || '').trim();
        const qty = parseInt(usedQuantity, 10);

        if (!cleanMaterialId) {
            return res.status(400).json({ error: 'Material ID is required' });
        }

        if (!cleanMeterType) {
            return res.status(400).json({ error: 'Meter Type is required' });
        }

        if (Number.isNaN(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Valid used quantity (> 0) is required' });
        }

        // 1. Find corresponding active transaction in Output Stok
        let tx = null;
        if (transactionId) {
            const [rows] = await db.query(
                'SELECT * FROM transactions WHERE id = ? AND transaction_type = "OUTPUT"',
                [parseInt(transactionId, 10)]
            );
            if (rows.length > 0) tx = rows[0];
        }

        if (!tx) {
            const [rows] = await db.query(
                'SELECT * FROM transactions WHERE (material_id = ? OR material_id LIKE CONCAT(?, "-%") OR ? LIKE CONCAT(material_id, "-%")) AND transaction_type = "OUTPUT" ORDER BY created_at DESC LIMIT 1',
                [cleanMaterialId, cleanMaterialId, cleanMaterialId]
            );
            if (rows.length > 0) tx = rows[0];
        }

        if (!tx) {
            return res.status(404).json({
                error: `Material "${cleanMaterialId}" belum pernah dikeluarkan dari stok (Output Stok). Material harus di-output dari stok terlebih dahulu.`
            });
        }

        // 2. Check current total used for this transaction
        const [usageSum] = await db.query(
            'SELECT COALESCE(SUM(used_quantity), 0) AS total_used FROM machine_meter_usage WHERE transaction_id = ?',
            [tx.id]
        );
        const currentTotalUsed = Number(usageSum[0].total_used) || 0;
        const currentRemaining = Math.max(0, tx.quantity - currentTotalUsed);

        if (qty > currentRemaining) {
            return res.status(400).json({
                error: `Jumlah pemakaian (${qty} pcs) melebihi sisa material di mesin (${currentRemaining} pcs). Total masuk dari stok: ${tx.quantity} pcs.`
            });
        }

        // 3. Determine source PC / IP
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'LAN-PC';
        const detectedSource = sourcePc ? String(sourcePc).trim() : `PC (${clientIp})`;

        // 4. Insert into machine_meter_usage
        const [insertResult] = await db.query(`
            INSERT INTO machine_meter_usage (
                transaction_id,
                material_id,
                material_name,
                meter_type,
                used_quantity,
                source_pc,
                notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            tx.id,
            tx.material_id,
            tx.material_name,
            cleanMeterType,
            qty,
            detectedSource,
            notes ? String(notes).trim() : null
        ]);

        const newRemaining = Math.max(0, currentRemaining - qty);

        res.json({
            success: true,
            message: `Deteksi berhasil: ${qty} pcs material "${tx.material_name}" dicatat untuk Type Meter "${cleanMeterType}"`,
            data: {
                id: insertResult.insertId,
                transactionId: tx.id,
                materialId: tx.material_id,
                materialName: tx.material_name,
                meterType: cleanMeterType,
                usedQuantity: qty,
                totalMasukMesin: tx.quantity,
                sisaKomponenMesin: newRemaining,
                sourcePc: detectedSource
            }
        });
    } catch (error) {
        console.error('Detect meter usage error:', error);
        res.status(500).json({ error: error.message || 'Failed to record meter usage' });
    }
});

// Get chronological meter detection logs
router.get('/meter-history', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        await ensureMachineSchema();

        const { search = '', meterType = '', sort = 'desc', page = 1, limit = 10 } = req.query;
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const offset = (parsedPage - 1) * parsedLimit;
        const sortOrder = String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let whereClause = ' WHERE 1=1';
        const params = [];

        if (search) {
            whereClause += ' AND (material_id LIKE ? OR material_name LIKE ? OR source_pc LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (meterType) {
            whereClause += ' AND meter_type = ?';
            params.push(meterType);
        }

        // 1. Get total count
        const countQuery = `SELECT COUNT(*) AS total FROM machine_meter_usage${whereClause}`;
        const [countResult] = await db.query(countQuery, params);
        const total = Number(countResult[0].total) || 0;
        const totalPages = Math.ceil(total / parsedLimit);

        // 2. Fetch paginated data
        const dataQuery = `SELECT * FROM machine_meter_usage${whereClause} ORDER BY created_at ${sortOrder} LIMIT ? OFFSET ?`;
        const [rows] = await db.query(dataQuery, [...params, parsedLimit, offset]);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total,
                totalPages
            }
        });
    } catch (error) {
        console.error('Get meter history error:', error);
        res.status(500).json({ error: 'Failed to fetch meter history' });
    }
});

// Delete an accidental usage log
router.delete('/meter-history/:id', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid ID' });
        }

        const [result] = await db.query('DELETE FROM machine_meter_usage WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({ success: true, message: 'Riwayat pemakaian berhasil dihapus' });
    } catch (error) {
        console.error('Delete meter history error:', error);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// ========== DIRECTORY WATCHER (SAMSUNG & HANWHA SMT LOGS) ENDPOINTS ==========

// Get Watcher Status
router.get('/watcher-status', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const status = await watcher.getWatcherStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Watcher Configuration
router.post('/watcher-config', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { directoryPath, enabled, pollIntervalSeconds, usePickedOrMounted } = req.body;
        const current = watcher.loadWatcherConfig();

        if (directoryPath !== undefined) current.directoryPath = String(directoryPath).trim();
        if (enabled !== undefined) current.enabled = Boolean(enabled);
        if (pollIntervalSeconds !== undefined) current.pollIntervalSeconds = Math.max(5, parseInt(pollIntervalSeconds, 10) || 15);
        if (usePickedOrMounted !== undefined) current.usePickedOrMounted = usePickedOrMounted === 'picked' ? 'picked' : 'mounted';

        watcher.saveWatcherConfig(current);

        if (current.enabled) {
            watcher.startWatcher(current.pollIntervalSeconds);
        } else {
            watcher.stopWatcher();
        }

        res.json({
            success: true,
            message: 'Konfigurasi direktori pemantau log mesin berhasil disimpan',
            data: await watcher.getWatcherStatus()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger Immediate Directory Scan
router.post('/watcher-scan', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { overridePath } = req.body;
        const result = await watcher.scanConfiguredDirectory(overridePath);
        res.json(result);
    } catch (error) {
        console.error('Manual scan error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update 5 SMT Machines Configuration (IPs / Folders)
router.post('/watcher-machines', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { machines, pollIntervalSeconds, enabled, usePickedOrMounted } = req.body;
        const current = watcher.loadWatcherConfig();

        if (Array.isArray(machines)) {
            current.machines = machines;
        }
        if (pollIntervalSeconds !== undefined) {
            current.pollIntervalSeconds = Math.max(5, parseInt(pollIntervalSeconds, 10) || 15);
        }
        if (enabled !== undefined) {
            current.enabled = Boolean(enabled);
        }
        if (usePickedOrMounted !== undefined) {
            current.usePickedOrMounted = usePickedOrMounted === 'picked' ? 'picked' : 'mounted';
        }

        watcher.saveWatcherConfig(current);

        if (current.enabled) {
            watcher.startWatcher(current.pollIntervalSeconds);
        } else {
            watcher.stopWatcher();
        }

        res.json({
            success: true,
            message: 'Konfigurasi 5 PC Mesin SMT berhasil disimpan',
            data: await watcher.getWatcherStatus()
        });
    } catch (error) {
        console.error('Save watcher machines error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test Connection to a single machine IP / Folder
router.post('/test-connection', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const { ip, path: customPath, shareFolder } = req.body;
        const testPath = (customPath && customPath.trim())
            ? customPath.trim()
            : (ip ? `\\\\${ip.trim()}\\${(shareFolder || 'Pd Info').trim().replace(/^[\\\/]+/, '')}` : '');

        const reachable = await watcher.checkPathAccessible(testPath);
        res.json({
            success: true,
            path: testPath,
            reachable,
            message: reachable
                ? `🟢 Terhubung! Folder "${testPath}" dapat diakses.`
                : `⚠️ Tidak dapat diakses! Pastikan PC online dan folder "${testPath}" di-share di jaringan LAN.`
        });
    } catch (error) {
        console.error('Test connection error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Processed Log Files
router.get('/processed-logs', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        await watcher.ensureWatcherTables();
        const [rows] = await db.query('SELECT * FROM processed_machine_logs ORDER BY processed_at DESC LIMIT 100');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
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
            rid VARCHAR(50) NULL,
            material_name VARCHAR(255) NOT NULL,
            meter_type VARCHAR(50) NOT NULL,
            used_quantity INT NOT NULL DEFAULT 0,
            source_pc VARCHAR(100) NULL,
            machine_id VARCHAR(20) NULL,
            line_id VARCHAR(20) NULL,
            notes VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
        )
    `);

    try {
        const [ridCol] = await db.query("SHOW COLUMNS FROM machine_meter_usage LIKE 'rid'");
        if (ridCol.length === 0) {
            await db.query("ALTER TABLE machine_meter_usage ADD COLUMN rid VARCHAR(50) NULL AFTER material_name");
        }
        const [machCol] = await db.query("SHOW COLUMNS FROM machine_meter_usage LIKE 'machine_id'");
        if (machCol.length === 0) {
            await db.query("ALTER TABLE machine_meter_usage ADD COLUMN machine_id VARCHAR(20) NULL AFTER source_pc");
            await db.query("ALTER TABLE machine_meter_usage ADD COLUMN line_id VARCHAR(20) NULL AFTER machine_id");
        }
        const [txMachCol] = await db.query("SHOW COLUMNS FROM transactions LIKE 'machine_id'");
        if (txMachCol.length === 0) {
            await db.query("ALTER TABLE transactions ADD COLUMN machine_id VARCHAR(20) NULL AFTER product_type");
        }
    } catch (e) {
        // Table created or column exists
    }
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
            supportedMeterTypes: VALID_METER_TYPES,
            machines: watcher.SMT_MACHINES
        }
    });
});

// Live Feed: Material from Output Stok automatically grouped per Machine + Meter Type Usage Breakdown
router.get('/feed', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        await ensureMachineSchema();

        const { search = '', meterType = '', status = '', machine = '', limit = 50 } = req.query;
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

        // 1. Get all OUTPUT transactions (materials released from stock to machine)
        let query = `
            SELECT 
                t.id AS transaction_id,
                t.material_id,
                t.rid,
                t.machine_id AS tx_machine_id,
                t.material_name,
                t.material_name AS specification,
                t.product_type AS default_meter_type,
                t.operator_name AS stok_operator,
                t.quantity AS total_masuk_mesin,
                t.created_at AS stok_output_time
            FROM transactions t
            WHERE t.transaction_type = 'OUTPUT'
        `;
        const params = [];

        if (search) {
            query += ' AND (t.material_id LIKE ? OR t.material_name LIKE ? OR t.operator_name LIKE ? OR t.rid LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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
                    activeMeterTypesCount: 0,
                    machines: watcher.SMT_MACHINES,
                    machineCounts: { 'A1': 0, 'A2': 0, 'A3': 0, 'B1': 0, 'B2': 0, 'UNASSIGNED': 0 },
                    lineCounts: { 'Line A': 0, 'Line B': 0 }
                }
            });
        }

        const transactionIds = stokRows.map(r => r.transaction_id);

        // 2. Fetch meter usage breakdown for these transactions including machine info
        const [usageRows] = await db.query(`
            SELECT 
                transaction_id,
                material_id,
                rid,
                meter_type,
                source_pc,
                machine_id,
                line_id,
                SUM(used_quantity) AS total_used,
                MAX(created_at) AS last_detected_at
            FROM machine_meter_usage
            WHERE transaction_id IN (?)
            GROUP BY transaction_id, material_id, rid, meter_type, source_pc, machine_id, line_id
        `, [transactionIds]);

        // Group usage by transaction_id
        const usageMap = new Map();
        const txMachineMap = new Map();
        const allMeterTypesSet = new Set();

        for (const u of usageRows) {
            if (!usageMap.has(u.transaction_id)) {
                usageMap.set(u.transaction_id, []);
            }
            usageMap.get(u.transaction_id).push({
                meterType: u.meter_type,
                usedQuantity: Number(u.total_used) || 0,
                rid: u.rid || null,
                sourcePc: u.source_pc,
                machineId: u.machine_id,
                lineId: u.line_id,
                lastDetectedAt: u.last_detected_at
            });
            allMeterTypesSet.add(u.meter_type);

            if (u.machine_id && !txMachineMap.has(u.transaction_id)) {
                txMachineMap.set(u.transaction_id, u.machine_id);
            }
        }

        // Get feeder material-to-machine mapping from machine logs on disk
        const feederMachineMap = watcher.getFeederMachineMapping ? watcher.getFeederMachineMapping() : new Map();

        let totalPcsMasuk = 0;
        let totalPcsTerpakai = 0;

        const machineCounts = { 'A1': 0, 'A2': 0, 'A3': 0, 'B1': 0, 'B2': 0, 'UNASSIGNED': 0 };
        const lineCounts = { 'Line A': 0, 'Line B': 0 };

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

            // Detect Machine & Line
            let detectedMachineId = row.tx_machine_id || txMachineMap.get(row.transaction_id);
            if (!detectedMachineId && feederMachineMap.has(row.material_id)) {
                detectedMachineId = feederMachineMap.get(row.material_id);
            }
            if (!detectedMachineId && usages.length > 0) {
                for (const u of usages) {
                    const src = String(u.sourcePc || '').toUpperCase();
                    if (src.includes('A1')) { detectedMachineId = 'A1'; break; }
                    if (src.includes('A2')) { detectedMachineId = 'A2'; break; }
                    if (src.includes('A3')) { detectedMachineId = 'A3'; break; }
                    if (src.includes('B1')) { detectedMachineId = 'B1'; break; }
                    if (src.includes('B2')) { detectedMachineId = 'B2'; break; }
                }
            }
            if (!detectedMachineId) {
                detectedMachineId = 'UNASSIGNED';
            }

            const machineMeta = watcher.getMachineMeta(detectedMachineId);

            if (machineCounts[machineMeta.id] !== undefined) {
                machineCounts[machineMeta.id]++;
            } else {
                machineCounts['UNASSIGNED']++;
            }
            if (machineMeta.line === 'Line A') lineCounts['Line A']++;
            if (machineMeta.line === 'Line B') lineCounts['Line B']++;

            return {
                transactionId: row.transaction_id,
                materialId: row.material_id,
                rid: row.rid || null,
                materialName: row.material_name,
                specification: row.specification || row.material_name,
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
                machineId: machineMeta.id,
                lineId: machineMeta.line,
                machineBrand: machineMeta.brand,
                machineName: machineMeta.name,
                machineLabel: machineMeta.label,
                machineFolder: machineMeta.folder,
                machineColor: machineMeta.color,
                meterBreakdown: usages,
                lastDetectedAt
            };
        });

        // Filter by machine if requested
        if (machine && machine !== 'all') {
            const cleanMachine = machine.trim().toUpperCase();
            if (cleanMachine === 'LINE A' || cleanMachine === 'LINE_A' || cleanMachine === 'LINEA') {
                enrichedRows = enrichedRows.filter(r => r.lineId === 'Line A');
            } else if (cleanMachine === 'LINE B' || cleanMachine === 'LINE_B' || cleanMachine === 'LINEB') {
                enrichedRows = enrichedRows.filter(r => r.lineId === 'Line B');
            } else {
                enrichedRows = enrichedRows.filter(r => r.machineId.toUpperCase() === cleanMachine);
            }
        }

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
                activeMeterTypesCount: allMeterTypesSet.size,
                machines: watcher.SMT_MACHINES,
                machineCounts,
                lineCounts
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

        const { materialId, meterType, usedQuantity, sourcePc, notes, transactionId, rid } = req.body;

        const cleanMaterialId = String(materialId || '').trim();
        const cleanMeterType = String(meterType || '').trim();
        const cleanRid = typeof rid === 'string' && rid.trim() ? rid.trim() : null;
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

        if (!tx && cleanRid) {
            // First search by material_id AND rid
            const [rows] = await db.query(
                'SELECT * FROM transactions WHERE (material_id = ? OR material_id LIKE CONCAT(?, "-%") OR ? LIKE CONCAT(material_id, "-%")) AND rid = ? AND transaction_type = "OUTPUT" ORDER BY created_at DESC LIMIT 1',
                [cleanMaterialId, cleanMaterialId, cleanMaterialId, cleanRid]
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

        // 3. Determine Machine & Line
        const rawMachineId = req.body.machineId || req.body.machine || null;
        let machineMeta = null;
        if (rawMachineId) {
            machineMeta = watcher.getMachineMeta(rawMachineId);
        } else if (sourcePc) {
            const up = String(sourcePc).toUpperCase();
            if (up.includes('A1')) machineMeta = watcher.getMachineMeta('A1');
            else if (up.includes('A2')) machineMeta = watcher.getMachineMeta('A2');
            else if (up.includes('A3')) machineMeta = watcher.getMachineMeta('A3');
            else if (up.includes('B1')) machineMeta = watcher.getMachineMeta('B1');
            else if (up.includes('B2')) machineMeta = watcher.getMachineMeta('B2');
        }
        if (!machineMeta || machineMeta.id === 'UNASSIGNED') {
            machineMeta = tx.machine_id ? watcher.getMachineMeta(tx.machine_id) : watcher.getMachineMeta('A1');
        }

        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'LAN-PC';
        const detectedSource = sourcePc ? String(sourcePc).trim() : `Mesin ${machineMeta.name} (${machineMeta.brand})`;
        const effectiveRid = cleanRid || (tx ? tx.rid : null);

        // 4. Insert into machine_meter_usage with machine_id and line_id
        const [insertResult] = await db.query(`
            INSERT INTO machine_meter_usage (
                transaction_id,
                material_id,
                rid,
                material_name,
                meter_type,
                used_quantity,
                source_pc,
                machine_id,
                line_id,
                notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tx.id,
            tx.material_id,
            effectiveRid,
            tx.material_name,
            cleanMeterType,
            qty,
            detectedSource,
            machineMeta.id,
            machineMeta.line,
            notes ? String(notes).trim() : `Deteksi Manual/LAN: ${machineMeta.label}`
        ]);

        // Update tx machine if not assigned
        if (tx && (!tx.machine_id || tx.machine_id === 'UNASSIGNED')) {
            try {
                await db.query('UPDATE transactions SET machine_id = ? WHERE id = ?', [machineMeta.id, tx.id]);
            } catch (eTx) {}
        }

        const newRemaining = Math.max(0, currentRemaining - qty);

        res.json({
            success: true,
            message: `Deteksi berhasil: ${qty} pcs material "${tx.material_name}" dicatat pada ${machineMeta.label} untuk Type Meter "${cleanMeterType}"`,
            data: {
                id: insertResult.insertId,
                transactionId: tx.id,
                materialId: tx.material_id,
                rid: effectiveRid,
                materialName: tx.material_name,
                meterType: cleanMeterType,
                usedQuantity: qty,
                totalMasukMesin: tx.quantity,
                sisaKomponenMesin: newRemaining,
                sourcePc: detectedSource,
                machineId: machineMeta.id,
                lineId: machineMeta.line,
                machineLabel: machineMeta.label
            }
        });
    } catch (error) {
        console.error('Detect meter usage error:', error);
        res.status(500).json({ error: error.message || 'Failed to record meter usage' });
    }
});

// Assign or Reassign material to specific machine (Superadmin Only)
router.post('/assign-machine', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        await ensureMachineSchema();
        const { transactionId, machineId } = req.body;
        if (!transactionId || !machineId) {
            return res.status(400).json({ error: 'transactionId dan machineId wajib diisi' });
        }

        const meta = watcher.getMachineMeta(machineId);
        await db.query('UPDATE transactions SET machine_id = ? WHERE id = ?', [meta.id, transactionId]);
        await db.query('UPDATE machine_meter_usage SET machine_id = ?, line_id = ? WHERE transaction_id = ?', [meta.id, meta.line, transactionId]);

        res.json({
            success: true,
            message: `Material berhasil ditugaskan ke ${meta.label}`,
            data: meta
        });
    } catch (err) {
        console.error('Assign machine error:', err);
        res.status(500).json({ error: 'Gagal menugaskan material ke mesin' });
    }
});

// Test Connection between Web and Machine Pd Info folder
router.post('/test-machine-folder', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { machineId, customPath } = req.body;
        if (!machineId && !customPath) {
            return res.status(400).json({ error: 'machineId atau customPath wajib disertakan' });
        }

        const meta = watcher.getMachineMeta(machineId || 'A1');
        const watcherConfig = watcher.loadWatcherConfig();
        const configuredMachine = (watcherConfig.machines || []).find(m => m.id === meta.id) || meta;

        let targetPath = (customPath && customPath.trim())
            ? customPath.trim()
            : watcher.resolveMachinePath(configuredMachine);

        if (!targetPath) {
            return res.json({
                success: true,
                reachable: false,
                machineId: meta.id,
                machineName: meta.name,
                brand: meta.brand,
                lineId: meta.line,
                folderPath: '',
                message: `⚠️ Path folder untuk Mesin ${meta.id} belum dikonfigurasi.`
            });
        }

        const reachable = await watcher.checkPathAccessible(targetPath);
        if (!reachable) {
            return res.json({
                success: true,
                reachable: false,
                machineId: meta.id,
                machineName: meta.name,
                brand: meta.brand,
                lineId: meta.line,
                folderPath: targetPath,
                message: `⚠️ Folder "${targetPath}" tidak dapat diakses! Pastikan folder ada atau PC mesin terhubung ke LAN.`
            });
        }

        // Folder is accessible, read log files
        let logFilesCount = 0;
        let latestLogFile = null;
        try {
            const files = fs.readdirSync(targetPath);
            const logFiles = files.filter(f => f.toLowerCase().endsWith('.log'));
            logFilesCount = logFiles.length;

            if (logFiles.length > 0) {
                const fileStats = logFiles.map(f => {
                    try {
                        const s = fs.statSync(path.join(targetPath, f));
                        return { name: f, mtime: s.mtime, size: s.size };
                    } catch (e) {
                        return { name: f, mtime: new Date(0), size: 0 };
                    }
                }).sort((a, b) => b.mtime - a.mtime);

                latestLogFile = fileStats[0];
            }
        } catch (readErr) {
            console.warn('Read log files warning:', readErr.message);
        }

        res.json({
            success: true,
            reachable: true,
            machineId: meta.id,
            machineName: meta.name,
            brand: meta.brand,
            lineId: meta.line,
            folderPath: targetPath,
            logFilesCount,
            latestLogFile,
            message: `🟢 Terhubung! Web berhasil mengakses folder Pd Info ${meta.name} (${targetPath}). Ditemukan ${logFilesCount} file .log.`
        });
    } catch (err) {
        console.error('Test machine folder error:', err);
        res.status(500).json({ error: err.message || 'Gagal menguji koneksi folder' });
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
            whereClause += ' AND (material_id LIKE ? OR material_name LIKE ? OR source_pc LIKE ? OR rid LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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
        const dataQuery = `SELECT *, material_name AS specification FROM machine_meter_usage${whereClause} ORDER BY created_at ${sortOrder} LIMIT ? OFFSET ?`;
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
router.post('/watcher-scan', isAuthenticated, canAccessMaterials, async (req, res) => {
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

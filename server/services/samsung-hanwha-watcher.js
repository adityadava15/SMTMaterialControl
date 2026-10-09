const fs = require('fs');
const path = require('path');
const net = require('net');
const db = require('../config/database');

// Default config
const CONFIG_FILE = path.join(__dirname, '../config/machine-watcher-config.json');

let watcherInterval = null;
let lastScanTime = null;
let lastScanError = null;
let isScanning = false;

// 5 SMT Mounting Machines Definition:
// Line A: A1 (Hanwha), A2 (Samsung), A3 (Samsung)
// Line B: B1 (Samsung), B2 (Samsung)
const SMT_MACHINES = [
    { id: 'A1', line: 'Line A', brand: 'Hanwha', name: 'Line A1', label: 'Line A - Mesin A1 (Hanwha)', folder: 'a1', color: '#ea580c' },
    { id: 'A2', line: 'Line A', brand: 'Samsung', name: 'Line A2', label: 'Line A - Mesin A2 (Samsung)', folder: 'a2', color: '#2563eb' },
    { id: 'A3', line: 'Line A', brand: 'Samsung', name: 'Line A3', label: 'Line A - Mesin A3 (Samsung)', folder: 'a3', color: '#0284c7' },
    { id: 'B1', line: 'Line B', brand: 'Samsung', name: 'Line B1', label: 'Line B - Mesin B1 (Samsung)', folder: 'b1', color: '#4f46e5' },
    { id: 'B2', line: 'Line B', brand: 'Samsung', name: 'Line B2', label: 'Line B - Mesin B2 (Samsung)', folder: 'b2', color: '#7c3aed' }
];

function getMachineMeta(machineId) {
    const id = String(machineId || '').toUpperCase().trim();
    const found = SMT_MACHINES.find(m => m.id === id);
    if (found) return found;
    if (id.startsWith('A')) return { id, line: 'Line A', brand: id === 'A1' ? 'Hanwha' : 'Samsung', name: `Line ${id}`, label: `Line A - Mesin ${id}`, folder: id.toLowerCase(), color: '#2563eb' };
    if (id.startsWith('B')) return { id, line: 'Line B', brand: 'Samsung', name: `Line ${id}`, label: `Line B - Mesin ${id}`, folder: id.toLowerCase(), color: '#4f46e5' };
    return { id: id || 'UNASSIGNED', line: 'Antrian / Belum Masuk Mesin', brand: '-', name: id || 'Antrian Mesin', label: id || 'Belum Ditugaskan', folder: '-', color: '#64748b' };
}

const DEFAULT_MACHINES = [
    {
        id: 'A1',
        name: 'Line A1',
        brand: 'Hanwha',
        ip: '192.168.91.165',
        shareFolder: 'Pd Info',
        path: 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info\\a1',
        enabled: true
    },
    {
        id: 'A2',
        name: 'Line A2',
        brand: 'Samsung',
        ip: '192.168.1.102',
        shareFolder: 'Pd Info',
        path: 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info\\a2',
        enabled: true
    },
    {
        id: 'A3',
        name: 'Line A3',
        brand: 'Samsung',
        ip: '192.168.1.103',
        shareFolder: 'Pd Info',
        path: 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info\\a3',
        enabled: true
    },
    {
        id: 'B1',
        name: 'Line B1',
        brand: 'Samsung',
        ip: '192.168.91.165',
        shareFolder: 'Pd Info',
        path: 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info\\b1',
        enabled: true
    },
    {
        id: 'B2',
        name: 'Line B2',
        brand: 'Samsung',
        ip: '192.168.1.105',
        shareFolder: 'Pd Info',
        path: 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info\\b2',
        enabled: true
    }
];

function resolveMachinePath(m) {
    if (!m) return '';
    const custom = (m.path || '').trim();
    if (custom && fs.existsSync(custom)) return custom;

    const basePdInfo = 'C:\\Users\\Rama-Notebook\\Documents\\Adid\\Pd Info';
    const localPdInfo = path.join(basePdInfo, String(m.id || '').toLowerCase());
    if (fs.existsSync(localPdInfo)) {
        return localPdInfo;
    }

    if (custom) return custom;

    const ip = (m.ip || '').trim();
    const folder = (m.shareFolder || 'Pd Info').trim().replace(/^[\\\/]+/, '');
    if (ip) {
        return `\\\\${ip}\\${folder}`;
    }
    return '';
}

/**
 * Fast TCP check to test if SMB port (445) is responding before doing blocking Windows SMB calls
 */
function checkSmbPort(host, timeoutMs = 1200) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (result) => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve(result);
            }
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));

        try {
            socket.connect(445, host);
        } catch (e) {
            finish(false);
        }
    });
}

/**
 * Asynchronously check if a local or UNC network share path is accessible
 * without freezing the Node.js event loop if the remote host is offline.
 */
async function checkPathAccessible(targetPath, timeoutMs = 1200) {
    if (!targetPath || typeof targetPath !== 'string') return false;
    const clean = targetPath.trim();
    if (!clean) return false;

    // Check if UNC path (e.g. \\192.168.1.101\Pd Info or //192.168.1.101/Pd Info)
    const uncMatch = clean.match(/^[\\\/]{2}([^\\\/]+)/);
    if (uncMatch) {
        const host = uncMatch[1];
        const isPortOpen = await checkSmbPort(host, timeoutMs);
        if (!isPortOpen) {
            return false;
        }
    }

    try {
        await fs.promises.access(clean, fs.constants.R_OK);
        return true;
    } catch (e) {
        return false;
    }
}

// Ensure configuration file exists
function loadWatcherConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.machines || !Array.isArray(parsed.machines) || parsed.machines.length === 0) {
                parsed.machines = DEFAULT_MACHINES;
                saveWatcherConfig(parsed);
            }
            return parsed;
        }
    } catch (e) {
        console.error('Error reading watcher config:', e);
    }

    const defaultConfig = {
        enabled: true,
        pollIntervalSeconds: 15,
        onlyNewFilesSinceStart: true,
        usePickedOrMounted: 'mounted', // 'mounted' or 'picked'
        startedAt: new Date().toISOString(),
        machines: DEFAULT_MACHINES
    };
    saveWatcherConfig(defaultConfig);
    return defaultConfig;
}

function saveWatcherConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving watcher config:', e);
        return false;
    }
}

// Ensure database table for tracking processed log files
async function ensureWatcherTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS processed_machine_logs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            file_path VARCHAR(500) NOT NULL UNIQUE,
            file_name VARCHAR(255) NOT NULL,
            meter_type VARCHAR(50) NOT NULL,
            machine_line VARCHAR(100) NULL,
            total_materials_detected INT DEFAULT 0,
            total_pcs_consumed INT DEFAULT 0,
            file_mtime BIGINT NULL,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

/**
 * Extract Meter Type from Samsung / Hanwha log filename
 * e.g., H_HXE12FR-A1-22.1S_20260625031225_202606250458.log -> HXE12FR
 *       H_HXE128-KP-V3-A1-25.5S_20260615170138_202606151937.log -> HXE128-KP
 *       H_HXE310-KP-V3-B1-112,8S_20260430214633_202605010454.log -> HXE310-KP
 *       H_HXE310-V2-...log -> HXE310
 */
function extractMeterType(fileName) {
    const upper = String(fileName || '').toUpperCase();
    if (upper.includes('HXE128')) return 'HXE128-KP';
    if (upper.includes('HXE12FR')) return 'HXE12FR';
    if (upper.includes('HXE310-KP') || upper.includes('310-KP') || upper.includes('310KP')) return 'HXE310-KP';
    if (upper.includes('HXE310')) return 'HXE310';
    return 'UNKNOWN';
}

/**
 * Extract Machine Line / Side (e.g. A1, A2, A3, B1, B2)
 */
function extractMachineLine(filePath, fileName) {
    // Try from folder name (e.g. ...\Pd Info\a1\...)
    const parentDir = path.basename(path.dirname(filePath)).toUpperCase();
    if (['A1', 'A2', 'A3', 'B1', 'B2', 'LINE1', 'LINE2'].includes(parentDir)) {
        return parentDir;
    }

    // Try from filename pattern: -A1-, -A2-, -A3-, -B1-, -B2-
    const match = fileName.match(/-([AB][1-3])-/i);
    if (match && match[1]) {
        return match[1].toUpperCase();
    }

    const genericMatch = fileName.match(/-([A-Za-z0-9]+)-/);
    if (genericMatch && genericMatch[1]) {
        return genericMatch[1].toUpperCase();
    }

    return parentDir || 'SMT-MACHINE';
}

/**
 * Extract 5-digit RID (Roll ID) from barcode
 * e.g. S0086*********1051802606110002504 -> 02504
 *      S0086*********102621260312000022 -> 00022
 *      S0086********10458425111200318   -> 00318
 */
function extractRID(barcode) {
    if (!barcode || typeof barcode !== 'string') return null;
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    if (trimmed.includes('&')) {
        const parts = trimmed.split('&');
        if (parts.length >= 3 && parts[2].trim()) {
            const p3 = parts[2].trim();
            const matchP3 = p3.match(/(\d{5})$/);
            return matchP3 ? matchP3[1] : (p3.length >= 5 ? p3.slice(-5) : p3);
        }
    }

    const tokens = trimmed.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    const match = lastToken.match(/(\d{5})$/);
    if (match) return match[1];

    const digitMatch = lastToken.match(/\d+/g);
    if (digitMatch && digitMatch.length > 0) {
        const lastGroup = digitMatch[digitMatch.length - 1];
        if (lastGroup.length >= 5) return lastGroup.slice(-5);
    }

    return null;
}

/**
 * Parse Samsung & Hanwha SMT production log (.log)
 */
function parseSamsungHanwhaLog(filePath, content) {
    const fileName = path.basename(filePath);
    const meterType = extractMeterType(fileName);
    const machineLine = extractMachineLine(filePath, fileName);

    const lines = content.split(/\r?\n/);
    let inFeederSection = false;
    const materialsMap = new Map();

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            const sectionName = trimmed.toLowerCase();
            inFeederSection = sectionName.includes('feeder');
            continue;
        }

        if (!inFeederSection) continue;

        // Lines format: Slot,FeederID,MaterialID,Picked,DropErr,Mounted,VisionErr,OtherErr,DumpErr,SubSlot \t BarcodeInfo
        const parts = trimmed.split('\t');
        const dataPart = parts[0];
        const barcodePart = parts.length > 1 ? parts[1].trim() : '';
        const cols = dataPart.split(',');

        if (cols.length >= 6) {
            const slot = cols[0].trim();
            const materialId = cols[2].trim();
            const picked = parseInt(cols[3], 10) || 0;
            const mounted = parseInt(cols[5], 10) || 0;

            // Check if there is an exact reel barcode scanned on this feeder slot
            let reelMaterialId = null;
            let reelRid = null;

            if (barcodePart) {
                reelRid = extractRID(barcodePart);
            }

            if (barcodePart.startsWith('Z01')) {
                const bTokens = barcodePart.split(/\s+/);
                if (bTokens.length > 5 && bTokens[5] !== 'null') {
                    reelMaterialId = bTokens[5].trim();
                }
            } else if (barcodePart.includes('&')) {
                const ampIdx = barcodePart.indexOf('&');
                if (ampIdx > 0) reelMaterialId = barcodePart.substring(0, ampIdx).trim();
            }

            const effectiveMaterialId = reelMaterialId || materialId;
            const mapKey = reelRid ? `${effectiveMaterialId}::${reelRid}` : effectiveMaterialId;

            // Only consider lines with Material ID and positive consumption
            if (effectiveMaterialId && (picked > 0 || mounted > 0)) {
                if (!materialsMap.has(mapKey)) {
                    materialsMap.set(mapKey, {
                        materialId: effectiveMaterialId,
                        rid: reelRid || null,
                        rawSlotPart: materialId,
                        picked: 0,
                        mounted: 0,
                        slots: []
                    });
                }
                const entry = materialsMap.get(mapKey);
                entry.picked += picked;
                entry.mounted += mounted;
                if (!entry.slots.includes(slot)) {
                    entry.slots.push(slot);
                }
            }
        }
    }

    return {
        filePath,
        fileName,
        meterType,
        machineLine,
        materials: Array.from(materialsMap.values())
    };
}

/**
 * Recursively find all .log files in target directory
 */
function findLogFilesRecursively(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            results = results.concat(findLogFilesRecursively(fullPath));
        } else if (item.isFile() && item.name.toLowerCase().endsWith('.log')) {
            try {
                const stat = fs.statSync(fullPath);
                results.push({
                    fullPath,
                    fileName: item.name,
                    mtime: stat.mtimeMs,
                    size: stat.size
                });
            } catch (e) {
                console.error(`Cannot stat file ${fullPath}:`, e.message);
            }
        }
    }
    return results;
}

/**
 * Process a single log file into machine_meter_usage
 */
async function processSingleLogFile(fileInfo, options = {}) {
    const { fullPath, fileName, mtime } = fileInfo;
    const { usePickedOrMounted = 'mounted', machineInfo = null } = options;

    await ensureWatcherTables();

    // Check if already processed
    const [existing] = await db.query(
        'SELECT id, file_mtime FROM processed_machine_logs WHERE file_path = ?',
        [fullPath]
    );

    if (existing.length > 0) {
        // Already processed and not modified
        if (existing[0].file_mtime === Math.round(mtime)) {
            return { skipped: true, reason: 'Already processed' };
        }
    }

    // Read content
    const content = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseSamsungHanwhaLog(fullPath, content);

    let totalPcsConsumed = 0;
    let materialsDetectedCount = 0;

    // Determine machine identification
    const lineId = machineInfo ? machineInfo.id : parsed.machineLine;
    const brand = machineInfo ? machineInfo.brand : (lineId === 'A1' ? 'Hanwha' : 'Samsung');
    const machineSource = machineInfo
        ? `Mesin ${machineInfo.name || lineId} (${brand}${machineInfo.ip ? ' - ' + machineInfo.ip : ''})`
        : `Mesin ${lineId} (${brand})`;

    for (const item of parsed.materials) {
        const consumedQty = usePickedOrMounted === 'picked' ? item.picked : item.mounted;
        if (consumedQty <= 0) continue;

        // 1. Find corresponding active transaction in Output Stok
        let tx = null;
        if (item.rid) {
            const [txRowsWithRid] = await db.query(
                'SELECT * FROM transactions WHERE (material_id = ? OR material_id LIKE CONCAT(?, "-%") OR ? LIKE CONCAT(material_id, "-%")) AND rid = ? AND transaction_type = "OUTPUT" ORDER BY created_at DESC LIMIT 1',
                [item.materialId, item.materialId, item.materialId, item.rid]
            );
            if (txRowsWithRid.length > 0) tx = txRowsWithRid[0];
        }

        if (!tx) {
            const [txRows] = await db.query(
                'SELECT * FROM transactions WHERE (material_id = ? OR material_id LIKE CONCAT(?, "-%") OR ? LIKE CONCAT(material_id, "-%")) AND transaction_type = "OUTPUT" ORDER BY created_at DESC LIMIT 1',
                [item.materialId, item.materialId, item.materialId]
            );
            if (txRows.length > 0) tx = txRows[0];
        }

        // Check remaining
        let allowedQty = consumedQty;
        if (tx) {
            const [sumRow] = await db.query(
                'SELECT COALESCE(SUM(used_quantity), 0) AS total_used FROM machine_meter_usage WHERE transaction_id = ?',
                [tx.id]
            );
            const currentUsed = Number(sumRow[0].total_used) || 0;
            const remainingInMachine = Math.max(0, tx.quantity - currentUsed);

            if (remainingInMachine <= 0) {
                // Feeder exhausted for this transaction
                continue;
            }
            allowedQty = Math.min(consumedQty, remainingInMachine);
        }

        // 2. Insert into machine_meter_usage with explicit machine_id & line_id
        const effectiveRid = item.rid || (tx ? tx.rid : null);
        const notes = `Auto-log: ${parsed.fileName} (Slot ${item.slots.slice(0, 3).join(',')})${effectiveRid ? ` [RID: ${effectiveRid}]` : ''}`;
        const targetLineId = String(lineId || '').toUpperCase().startsWith('A') ? 'Line A' : 'Line B';

        await db.query(`
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
            tx ? tx.id : null,
            item.materialId,
            effectiveRid,
            tx ? tx.material_name : `Part ${item.materialId}`,
            parsed.meterType,
            allowedQty,
            machineSource,
            lineId,
            targetLineId,
            notes
        ]);

        // Auto-assign transaction machine_id if not yet assigned
        if (tx && (!tx.machine_id || tx.machine_id === 'UNASSIGNED')) {
            try {
                await db.query('UPDATE transactions SET machine_id = ? WHERE id = ?', [lineId, tx.id]);
            } catch (errTx) {
                // Silently ignore if column update fails
            }
        }

        totalPcsConsumed += allowedQty;
        materialsDetectedCount++;
    }

    const processedMachineLine = machineInfo ? `${machineInfo.id} (${brand})` : parsed.machineLine;

    // Record or update in processed_machine_logs
    if (existing.length > 0) {
        await db.query(`
            UPDATE processed_machine_logs 
            SET file_name = ?, meter_type = ?, machine_line = ?, total_materials_detected = ?, total_pcs_consumed = ?, file_mtime = ?, processed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            fileName,
            parsed.meterType,
            processedMachineLine,
            materialsDetectedCount,
            totalPcsConsumed,
            Math.round(mtime),
            existing[0].id
        ]);
    } else {
        await db.query(`
            INSERT INTO processed_machine_logs (
                file_path,
                file_name,
                meter_type,
                machine_line,
                total_materials_detected,
                total_pcs_consumed,
                file_mtime
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            fullPath,
            fileName,
            parsed.meterType,
            processedMachineLine,
            materialsDetectedCount,
            totalPcsConsumed,
            Math.round(mtime)
        ]);
    }

    return {
        success: true,
        fileName,
        meterType: parsed.meterType,
        machineLine: processedMachineLine,
        materialsDetected: materialsDetectedCount,
        totalPcsConsumed
    };
}

/**
 * Scan all configured machines (5 PCs) for log files
 */
async function scanConfiguredDirectory(overridePath = null, processAll = false) {
    if (isScanning) {
        return { success: false, message: 'Scan already in progress' };
    }

    isScanning = true;
    lastScanTime = new Date();
    lastScanError = null;

    try {
        const config = loadWatcherConfig();
        const machines = config.machines || DEFAULT_MACHINES;

        let totalFilesFound = 0;
        let processedCount = 0;
        let skippedCount = 0;
        let newMaterialsTotal = 0;
        let newPcsTotal = 0;
        const machineResults = [];

        // If a single overridePath is provided
        if (overridePath) {
            const accessible = await checkPathAccessible(overridePath);
            if (!accessible) {
                isScanning = false;
                lastScanError = `Folder direktori tidak ditemukan atau tidak dapat diakses: ${overridePath}`;
                return { success: false, error: lastScanError };
            }
            const logFiles = findLogFilesRecursively(overridePath);
            logFiles.sort((a, b) => a.mtime - b.mtime);
            for (const fileInfo of logFiles) {
                try {
                    const res = await processSingleLogFile(fileInfo, {
                        usePickedOrMounted: config.usePickedOrMounted || 'mounted'
                    });
                    if (res.skipped) skippedCount++;
                    else if (res.success) {
                        processedCount++;
                        newMaterialsTotal += res.materialsDetected;
                        newPcsTotal += res.totalPcsConsumed;
                    }
                } catch (err) {
                    console.error(`Error processing ${fileInfo.fileName}:`, err);
                }
            }
            isScanning = false;
            return {
                success: true,
                targetDir: overridePath,
                totalFilesFound: logFiles.length,
                processedCount,
                skippedCount,
                newMaterialsTotal,
                newPcsTotal,
                lastScanTime
            };
        }

        // Multi-machine scan (all 5 machine PCs)
        for (const machine of machines) {
            if (machine.enabled === false) continue;

            const targetDir = resolveMachinePath(machine);
            let reachable = false;
            let mFound = 0;
            let mProcessed = 0;
            let mPcs = 0;

            if (targetDir && (await checkPathAccessible(targetDir))) {
                reachable = true;
                const logFiles = findLogFilesRecursively(targetDir);
                mFound = logFiles.length;
                totalFilesFound += mFound;

                logFiles.sort((a, b) => a.mtime - b.mtime);

                for (const fileInfo of logFiles) {
                    try {
                        const res = await processSingleLogFile(fileInfo, {
                            usePickedOrMounted: config.usePickedOrMounted || 'mounted',
                            machineInfo: machine
                        });

                        if (res.skipped) {
                            skippedCount++;
                        } else if (res.success) {
                            processedCount++;
                            mProcessed++;
                            newMaterialsTotal += res.materialsDetected;
                            newPcsTotal += res.totalPcsConsumed;
                            mPcs += res.totalPcsConsumed;
                        }
                    } catch (err) {
                        console.error(`Error processing ${fileInfo.fileName}:`, err);
                    }
                }
            }

            machineResults.push({
                id: machine.id,
                name: machine.name,
                brand: machine.brand,
                ip: machine.ip,
                path: targetDir,
                reachable,
                filesFound: mFound,
                processedCount: mProcessed,
                pcsConsumed: mPcs
            });
        }

        isScanning = false;
        return {
            success: true,
            totalFilesFound,
            processedCount,
            skippedCount,
            newMaterialsTotal,
            newPcsTotal,
            machineResults,
            lastScanTime
        };
    } catch (error) {
        isScanning = false;
        lastScanError = error.message;
        console.error('Scan machines error:', error);
        return { success: false, error: error.message };
    }
}

function startWatcher(intervalSeconds = 15) {
    if (watcherInterval) {
        clearInterval(watcherInterval);
    }

    console.log(`[SMT Watcher] Started monitoring 5 machine directories every ${intervalSeconds}s`);

    watcherInterval = setInterval(async () => {
        const config = loadWatcherConfig();
        if (config.enabled) {
            await scanConfiguredDirectory();
        }
    }, intervalSeconds * 1000);
}

function stopWatcher() {
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
        console.log('[SMT Watcher] Stopped monitoring machine directories');
    }
}

async function getWatcherStatus() {
    const config = loadWatcherConfig();
    const machines = config.machines || DEFAULT_MACHINES;

    const machinesStatus = await Promise.all(machines.map(async (m) => {
        const resolvedPath = resolveMachinePath(m);
        const reachable = await checkPathAccessible(resolvedPath);
        return {
            id: m.id,
            name: m.name,
            brand: m.brand,
            ip: m.ip || '',
            shareFolder: m.shareFolder || 'Pd Info',
            path: resolvedPath,
            customPath: m.path || '',
            enabled: m.enabled !== false,
            reachable
        };
    }));

    const onlineCount = machinesStatus.filter(m => m.enabled && m.reachable).length;

    return {
        enabled: config.enabled !== false,
        pollIntervalSeconds: config.pollIntervalSeconds || 15,
        isRunning: !!watcherInterval,
        isScanning,
        lastScanTime,
        lastScanError,
        machineCount: machines.length,
        onlineCount,
        machines: machinesStatus
    };
}

let cachedFeederMap = null;
let lastFeederMapScan = 0;

/**
 * Scans directories to map which material belongs to which machine feeder list
 */
function getFeederMachineMapping() {
    const now = Date.now();
    if (cachedFeederMap && (now - lastFeederMapScan) < 30000) {
        return cachedFeederMap;
    }

    const map = new Map();
    const config = loadWatcherConfig();
    const machines = (config && config.machines) || DEFAULT_MACHINES;

    for (const m of machines) {
        const dirPath = resolveMachinePath(m);
        if (!dirPath || !fs.existsSync(dirPath)) continue;

        try {
            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.log'));

            for (const f of files) {
                try {
                    const fullP = path.join(dirPath, f);
                    const content = fs.readFileSync(fullP, 'utf8');
                    const lines = content.split(/\r?\n/);
                    let inFeeder = false;
                    for (const l of lines) {
                        const tr = l.trim();
                        if (tr.startsWith('[') && tr.endsWith(']')) {
                            inFeeder = tr.toLowerCase().includes('feeder');
                            continue;
                        }
                        if (!inFeeder) continue;
                        const parts = tr.split('\t')[0].split(',');
                        if (parts.length >= 3) {
                            const matId = parts[2].trim();
                            if (matId && !map.has(matId)) {
                                map.set(matId, m.id);
                            }
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }

    cachedFeederMap = map;
    lastFeederMapScan = now;
    return map;
}

module.exports = {
    loadWatcherConfig,
    saveWatcherConfig,
    ensureWatcherTables,
    parseSamsungHanwhaLog,
    findLogFilesRecursively,
    processSingleLogFile,
    scanConfiguredDirectory,
    startWatcher,
    stopWatcher,
    getWatcherStatus,
    checkPathAccessible,
    resolveMachinePath,
    DEFAULT_MACHINES,
    SMT_MACHINES,
    getMachineMeta,
    getFeederMachineMapping
};

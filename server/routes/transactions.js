const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, canAccessMaterials } = require('../middleware/auth');
const PRODUCT_TYPES = ['HXE128-KP', 'HXE12FR', 'HXE310', 'HXE310-KP'];

function parseDateTimeFilter(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
    const minutePattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;
    const secondPattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/;

    if (dateOnlyPattern.test(trimmed)) {
        const date = new Date(`${trimmed}T00:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        return { date, precision: 'day' };
    }

    if (minutePattern.test(trimmed)) {
        const normalized = trimmed.replace(' ', 'T');
        const date = new Date(`${normalized}:00`);
        if (Number.isNaN(date.getTime())) return null;
        return { date, precision: 'minute' };
    }

    if (secondPattern.test(trimmed)) {
        const normalized = trimmed.replace(' ', 'T');
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return null;
        return { date, precision: 'second' };
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed, precision: 'exact' };
    }

    return null;
}

// Record material output (usage)
router.post('/output', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { items, productType, operatorId } = req.body; // Array of {materialId, quantity}
        const normalizedProductType = typeof productType === 'string' ? productType.trim() : '';
        const parsedOperatorId = parseInt(operatorId, 10);

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        if (!normalizedProductType) {
            return res.status(400).json({ error: 'Product type is required' });
        }

        const [meterTypeRows] = await db.query('SELECT id FROM meter_types WHERE name = ?', [normalizedProductType]);
        if (meterTypeRows.length === 0 && !PRODUCT_TYPES.includes(normalizedProductType)) {
            return res.status(400).json({ error: 'Type meter tidak valid atau belum terdaftar' });
        }

        if (Number.isNaN(parsedOperatorId) || parsedOperatorId <= 0) {
            return res.status(400).json({ error: 'Operator is required' });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [operatorRows] = await connection.query(
                'SELECT id, name FROM operator_names WHERE id = ?',
                [parsedOperatorId]
            );

            if (operatorRows.length === 0) {
                throw new Error('Operator not found');
            }

            const selectedOperator = operatorRows[0];
            const results = [];

            for (const item of items) {
                const { materialId, quantity, rid } = item;
                const normalizedItemRid = typeof rid === 'string' && rid.trim() ? rid.trim() : null;

                if (!materialId || !quantity) {
                    throw new Error('Material ID and quantity are required for each item');
                }

                // Get current material
                const [materials] = await connection.query(
                    'SELECT * FROM materials WHERE id = ?',
                    [materialId]
                );

                if (materials.length === 0) {
                    throw new Error(`Material ${materialId} not found`);
                }

                const material = materials[0];

                // Check roll if RID is provided
                let activeRoll = null;
                if (normalizedItemRid) {
                    const [rolls] = await connection.query(
                        'SELECT id, quantity FROM material_rolls WHERE material_id = ? AND rid = ? AND status = "active" LIMIT 1',
                        [materialId, normalizedItemRid]
                    );
                    if (rolls.length === 0) {
                        throw new Error(`Roll dengan RID "${normalizedItemRid}" tidak ditemukan dalam stok aktif material ${material.name || materialId}`);
                    }
                    activeRoll = rolls[0];
                }

                // Check if enough quantity
                if (material.quantity < quantity) {
                    throw new Error(`Insufficient quantity for material ${material.name}. Available: ${material.quantity}, Requested: ${quantity}`);
                }

                // Update material quantity
                const newQuantity = material.quantity - quantity;
                await connection.query(
                    'UPDATE materials SET quantity = ? WHERE id = ?',
                    [newQuantity, materialId]
                );

                const rawMach = (item && item.machineId) || req.body.machineId || null;
                const cleanMach = ['A1', 'A2', 'A3', 'B1', 'B2'].includes(String(rawMach || '').toUpperCase().trim())
                    ? String(rawMach).toUpperCase().trim()
                    : null;

                // Log transaction
                const [txResult] = await connection.query(
                    'INSERT INTO transactions (material_id, material_name, transaction_type, product_type, machine_id, operator_name, quantity, rid, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [materialId, material.name, 'OUTPUT', normalizedProductType, cleanMach, selectedOperator.name, quantity, normalizedItemRid, req.session.userId]
                );

                const outputTxId = txResult.insertId;

                // Update roll status to consumed so it disappears from dashboard active detail
                if (activeRoll) {
                    await connection.query(
                        'UPDATE material_rolls SET status = "consumed", output_transaction_id = ? WHERE id = ?',
                        [outputTxId, activeRoll.id]
                    );
                }

                results.push({
                    materialId,
                    name: material.name,
                    productType: normalizedProductType,
                    operatorName: selectedOperator.name,
                    usedQuantity: quantity,
                    remainingQuantity: newQuantity,
                    rid: normalizedItemRid
                });
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Materials output recorded successfully',
                data: results
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Record output error:', error);
        res.status(500).json({ error: error.message || 'Failed to record material output' });
    }
});

// Get transaction history
router.get('/history', isAuthenticated, canAccessMaterials, async (req, res) => {
    try {
        const { page = 1, limit = 50, type = '', search = '', startDateTime = '', endDateTime = '' } = req.query;
        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);
        const offset = (parsedPage - 1) * parsedLimit;
        const parsedStartDateTime = parseDateTimeFilter(startDateTime);
        const parsedEndDateTime = parseDateTimeFilter(endDateTime);

        if (startDateTime && !parsedStartDateTime) {
            return res.status(400).json({ error: 'Invalid startDateTime format' });
        }

        if (endDateTime && !parsedEndDateTime) {
            return res.status(400).json({ error: 'Invalid endDateTime format' });
        }

        const startDate = parsedStartDateTime ? new Date(parsedStartDateTime.date) : null;
        const endDate = parsedEndDateTime ? new Date(parsedEndDateTime.date) : null;

        if (endDate && parsedEndDateTime.precision === 'day') {
            endDate.setHours(23, 59, 59, 999);
        } else if (endDate && parsedEndDateTime.precision === 'minute') {
            endDate.setSeconds(59, 999);
        } else if (endDate && parsedEndDateTime.precision === 'second') {
            endDate.setMilliseconds(999);
        }

        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({ error: 'startDateTime cannot be greater than endDateTime' });
        }

        let query = 'SELECT t.*, t.material_name AS specification, u.username, COALESCE(t.operator_name, u.username) AS display_user FROM transactions t LEFT JOIN users u ON t.user_id = u.id';
        let countQuery = 'SELECT COUNT(*) as total FROM transactions t';
        const params = [];
        const conditions = [];


        if (type) {
            conditions.push('t.transaction_type = ?');
            params.push(type);
        }

        if (search) {
            conditions.push('(t.material_id LIKE ? OR t.material_name LIKE ? OR t.product_type LIKE ? OR t.operator_name LIKE ? OR t.rid LIKE ? OR EXISTS (SELECT 1 FROM machine_meter_usage mmu WHERE mmu.transaction_id = t.id AND (mmu.meter_type LIKE ? OR mmu.rid LIKE ?)))');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (startDate) {
            conditions.push('t.created_at >= FROM_UNIXTIME(?)');
            params.push(Math.floor(startDate.getTime() / 1000));
        }

        if (endDate) {
            conditions.push('t.created_at <= FROM_UNIXTIME(?)');
            params.push(Math.floor(endDate.getTime() / 1000));
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parsedLimit, offset);

        const [transactions] = await db.query(query, params);

        // Enrich transactions with machine output usage details
        const outputTxList = transactions.filter(t => t.transaction_type === 'OUTPUT');
        if (outputTxList.length > 0) {
            const txIds = outputTxList.map(t => t.id);
            const [usageRows] = await db.query(`
                SELECT 
                    id,
                    transaction_id,
                    material_id,
                    rid,
                    material_name,
                    meter_type,
                    used_quantity,
                    source_pc,
                    notes,
                    created_at
                FROM machine_meter_usage
                WHERE transaction_id IN (?)
                ORDER BY created_at DESC
            `, [txIds]);

            const usageMap = new Map();
            for (const u of usageRows) {
                if (!usageMap.has(u.transaction_id)) {
                    usageMap.set(u.transaction_id, []);
                }
                usageMap.get(u.transaction_id).push(u);
            }

            for (const t of transactions) {
                if (t.transaction_type === 'OUTPUT') {
                    const usages = usageMap.get(t.id) || [];
                    const totalUsed = usages.reduce((sum, u) => sum + (Number(u.used_quantity) || 0), 0);
                    const remaining = Math.max(0, t.quantity - totalUsed);
                    const percentUsed = t.quantity > 0 ? Math.min(100, Math.round((totalUsed / t.quantity) * 100)) : 0;

                    const meterTypeMap = new Map();
                    for (const u of usages) {
                        const mType = u.meter_type || t.product_type || '-';
                        if (!meterTypeMap.has(mType)) {
                            meterTypeMap.set(mType, { meter_type: mType, total_used: 0, count: 0 });
                        }
                        const entry = meterTypeMap.get(mType);
                        entry.total_used += Number(u.used_quantity) || 0;
                        entry.count += 1;
                    }

                    let records = usages;
                    if (usages.length === 0) {
                        const defaultType = t.product_type || 'Belum Ditentukan';
                        records = [
                            {
                                id: null,
                                meter_type: defaultType,
                                used_quantity: t.quantity,
                                source_pc: 'Feeder Mesin SMT',
                                notes: 'Siap di Mesin (Output dari Stok)',
                                created_at: t.created_at,
                                is_initial: true
                            }
                        ];
                        if (t.product_type) {
                            meterTypeMap.set(t.product_type, {
                                meter_type: t.product_type,
                                total_used: t.quantity,
                                count: 1
                            });
                        }
                    }

                    t.machine_output = {
                        has_usage: usages.length > 0,
                        default_meter_type: t.product_type || (usages.length > 0 ? usages[0].meter_type : '-'),
                        total_masuk: t.quantity,
                        total_used: totalUsed,
                        remaining: remaining,
                        percent_used: percentUsed,
                        records: records,
                        meter_breakdown: Array.from(meterTypeMap.values())
                    };
                } else {
                    t.machine_output = null;
                }
            }
        } else {
            for (const t of transactions) {
                t.machine_output = null;
            }
        }

        const countParams = params.slice(0, -2); // Remove limit and offset
        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
});

module.exports = router;

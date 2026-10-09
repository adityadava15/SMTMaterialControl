const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL Connection Pool Configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smt_material_control',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

async function ensureSchemaExtensions() {
    try {
        // product_type is used for OUTPUT transactions only
        const [transactionColumns] = await pool.query("SHOW COLUMNS FROM transactions LIKE 'product_type'");
        if (transactionColumns.length === 0) {
            await pool.query('ALTER TABLE transactions ADD COLUMN product_type VARCHAR(50) NULL AFTER transaction_type');
            console.log('Added transactions.product_type column');
        }

        const [transactionIndexes] = await pool.query("SHOW INDEX FROM transactions WHERE Key_name = 'idx_transactions_product_type'");
        if (transactionIndexes.length === 0) {
            await pool.query('CREATE INDEX idx_transactions_product_type ON transactions(product_type)');
            console.log('Added idx_transactions_product_type index');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS material_catalog (
                material_id VARCHAR(100) PRIMARY KEY,
                specification VARCHAR(500) NOT NULL,
                qty INT NOT NULL DEFAULT 1,
                unit VARCHAR(50) NOT NULL DEFAULT 'PCS',
                created_by INT NULL,
                updated_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Migrate material_name to specification in material_catalog if needed
        const [catalogSpecCol] = await pool.query("SHOW COLUMNS FROM material_catalog LIKE 'specification'");
        if (catalogSpecCol.length === 0) {
            const [catalogNameCol] = await pool.query("SHOW COLUMNS FROM material_catalog LIKE 'material_name'");
            if (catalogNameCol.length > 0) {
                await pool.query('ALTER TABLE material_catalog CHANGE COLUMN material_name specification VARCHAR(500) NOT NULL');
                console.log('Renamed material_catalog.material_name to specification');
            } else {
                await pool.query('ALTER TABLE material_catalog ADD COLUMN specification VARCHAR(500) NOT NULL');
                console.log('Added material_catalog.specification column');
            }
        } else {
            // Ensure capacity is VARCHAR(500)
            await pool.query('ALTER TABLE material_catalog MODIFY COLUMN specification VARCHAR(500) NOT NULL');
        }

        // Ensure qty column exists
        const [catalogQtyCol] = await pool.query("SHOW COLUMNS FROM material_catalog LIKE 'qty'");
        if (catalogQtyCol.length === 0) {
            await pool.query("ALTER TABLE material_catalog ADD COLUMN qty INT NOT NULL DEFAULT 1 AFTER specification");
            console.log("Added material_catalog.qty column");
        }

        // Ensure unit column exists
        const [catalogUnitCol] = await pool.query("SHOW COLUMNS FROM material_catalog LIKE 'unit'");
        if (catalogUnitCol.length === 0) {
            await pool.query("ALTER TABLE material_catalog ADD COLUMN unit VARCHAR(50) NOT NULL DEFAULT 'PCS' AFTER qty");
            console.log("Added material_catalog.unit column");
        }

        // Ensure table uses utf8mb4 for unicode specifications (Ω, μ, etc.)
        await pool.query("ALTER TABLE material_catalog CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

        const [catalogSpecIndex] = await pool.query("SHOW INDEX FROM material_catalog WHERE Key_name = 'idx_material_catalog_spec'");
        if (catalogSpecIndex.length === 0) {
            await pool.query('CREATE INDEX idx_material_catalog_spec ON material_catalog(specification)');
            console.log('Added idx_material_catalog_spec index');
        }

        const [operatorColumn] = await pool.query("SHOW COLUMNS FROM transactions LIKE 'operator_name'");
        if (operatorColumn.length === 0) {
            await pool.query('ALTER TABLE transactions ADD COLUMN operator_name VARCHAR(100) NULL AFTER product_type');
            console.log('Added transactions.operator_name column');
        }

        const [operatorTxIndex] = await pool.query("SHOW INDEX FROM transactions WHERE Key_name = 'idx_transactions_operator_name'");
        if (operatorTxIndex.length === 0) {
            await pool.query('CREATE INDEX idx_transactions_operator_name ON transactions(operator_name)');
            console.log('Added idx_transactions_operator_name index');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS operator_names (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [operatorCreatedByColumn] = await pool.query("SHOW COLUMNS FROM operator_names LIKE 'created_by'");
        if (operatorCreatedByColumn.length === 0) {
            await pool.query('ALTER TABLE operator_names ADD COLUMN created_by INT NULL AFTER name');
            console.log('Added operator_names.created_by column');
        }

        const [operatorCreatedAtColumn] = await pool.query("SHOW COLUMNS FROM operator_names LIKE 'created_at'");
        if (operatorCreatedAtColumn.length === 0) {
            await pool.query('ALTER TABLE operator_names ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
            console.log('Added operator_names.created_at column');
        }

        const [operatorNameIndex] = await pool.query("SHOW INDEX FROM operator_names WHERE Key_name = 'idx_operator_names_name'");
        if (operatorNameIndex.length === 0) {
            await pool.query('CREATE INDEX idx_operator_names_name ON operator_names(name)');
            console.log('Added idx_operator_names_name index');
        }

        // Master Type Meter Table (managed by Superadmin & Admin)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS meter_types (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        const [meterNameIdx] = await pool.query("SHOW INDEX FROM meter_types WHERE Key_name = 'idx_meter_types_name'");
        if (meterNameIdx.length === 0) {
            await pool.query('CREATE INDEX idx_meter_types_name ON meter_types(name)');
            console.log('Added idx_meter_types_name index');
        }

        // Seed default meter types if empty
        const [existingMeterTypes] = await pool.query('SELECT COUNT(*) as count FROM meter_types');
        if (existingMeterTypes[0].count === 0) {
            const defaultTypes = ['HXE128-KP', 'HXE12FR', 'HXE310', 'HXE310-KP'];
            for (const t of defaultTypes) {
                await pool.query('INSERT IGNORE INTO meter_types (name) VALUES (?)', [t]);
            }
            console.log('Seeded default meter_types');
        }

        // RID (Roll ID - 5 digit identifier from QR code barcode)
        const [ridTxColumn] = await pool.query("SHOW COLUMNS FROM transactions LIKE 'rid'");
        if (ridTxColumn.length === 0) {
            await pool.query('ALTER TABLE transactions ADD COLUMN rid VARCHAR(50) NULL AFTER quantity');
            console.log('Added transactions.rid column');
        }

        const [ridTxIndex] = await pool.query("SHOW INDEX FROM transactions WHERE Key_name = 'idx_transactions_rid'");
        if (ridTxIndex.length === 0) {
            await pool.query('CREATE INDEX idx_transactions_rid ON transactions(rid)');
            console.log('Added idx_transactions_rid index');
        }

        // Check if machine_meter_usage table exists and add rid column
        const [machineUsageTable] = await pool.query("SHOW TABLES LIKE 'machine_meter_usage'");
        if (machineUsageTable.length > 0) {
            const [ridMachineColumn] = await pool.query("SHOW COLUMNS FROM machine_meter_usage LIKE 'rid'");
            if (ridMachineColumn.length === 0) {
                await pool.query('ALTER TABLE machine_meter_usage ADD COLUMN rid VARCHAR(50) NULL AFTER material_name');
                console.log('Added machine_meter_usage.rid column');
            }

            const [ridMachineIndex] = await pool.query("SHOW INDEX FROM machine_meter_usage WHERE Key_name = 'idx_machine_meter_usage_rid'");
            if (ridMachineIndex.length === 0) {
                await pool.query('CREATE INDEX idx_machine_meter_usage_rid ON machine_meter_usage(rid)');
                console.log('Added idx_machine_meter_usage_rid index');
            }
        }

        // Material Rolls Table (tracks individual roll IDs per material)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS material_rolls (
                id INT PRIMARY KEY AUTO_INCREMENT,
                material_id VARCHAR(50) NOT NULL,
                rid VARCHAR(50) NOT NULL,
                quantity INT NOT NULL DEFAULT 0,
                status ENUM('active', 'consumed') NOT NULL DEFAULT 'active',
                input_transaction_id INT NULL,
                output_transaction_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
                FOREIGN KEY (input_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
                FOREIGN KEY (output_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
            )
        `);

        const [rollsMatIdx] = await pool.query("SHOW INDEX FROM material_rolls WHERE Key_name = 'idx_material_rolls_mat'");
        if (rollsMatIdx.length === 0) {
            await pool.query('CREATE INDEX idx_material_rolls_mat ON material_rolls(material_id)');
        }
        const [rollsRidIdx] = await pool.query("SHOW INDEX FROM material_rolls WHERE Key_name = 'idx_material_rolls_rid'");
        if (rollsRidIdx.length === 0) {
            await pool.query('CREATE INDEX idx_material_rolls_rid ON material_rolls(rid)');
        }
        const [rollsStatusIdx] = await pool.query("SHOW INDEX FROM material_rolls WHERE Key_name = 'idx_material_rolls_status'");
        if (rollsStatusIdx.length === 0) {
            await pool.query('CREATE INDEX idx_material_rolls_status ON material_rolls(status)');
        }

        // Backfill material_rolls from existing transactions if empty
        const [existingRollCount] = await pool.query('SELECT COUNT(*) as count FROM material_rolls');
        if (existingRollCount[0].count === 0) {
            const [inputTxs] = await pool.query(`
                SELECT t.id, t.material_id, t.rid, t.quantity, t.created_at
                FROM transactions t
                WHERE t.transaction_type = 'INPUT' 
                  AND t.rid IS NOT NULL 
                  AND TRIM(t.rid) != ''
                ORDER BY t.id ASC
            `);

            const seenActiveRids = new Set();
            for (const tx of inputTxs) {
                const cleanRid = tx.rid.trim();
                if (!seenActiveRids.has(cleanRid)) {
                    const [outTx] = await pool.query(`
                        SELECT id, created_at FROM transactions 
                        WHERE material_id = ? AND rid = ? AND transaction_type = 'OUTPUT' 
                        LIMIT 1
                    `, [tx.material_id, cleanRid]);

                    if (outTx.length > 0) {
                        await pool.query(`
                            INSERT INTO material_rolls (material_id, rid, quantity, status, input_transaction_id, output_transaction_id, created_at, output_at)
                            VALUES (?, ?, ?, 'OUTPUT', ?, ?, ?, ?)
                        `, [tx.material_id, cleanRid, tx.quantity, tx.id, outTx[0].id, tx.created_at, outTx[0].created_at]);
                    } else {
                        await pool.query(`
                            INSERT INTO material_rolls (material_id, rid, quantity, status, input_transaction_id, created_at)
                            VALUES (?, ?, ?, 'IN_STOCK', ?, ?)
                        `, [tx.material_id, cleanRid, tx.quantity, tx.id, tx.created_at]);
                        seenActiveRids.add(cleanRid);
                    }
                }
            }
            console.log('Synchronized initial material_rolls data');
        }
    } catch (err) {
        console.warn('Schema check skipped:', err.message);
    }
}

// Test connection
pool.getConnection()
    .then(async (connection) => {
        console.log('Database connected successfully');
        connection.release();
        await ensureSchemaExtensions();
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
    });

module.exports = pool;

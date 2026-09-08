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
    queueLimit: 0
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
                material_name VARCHAR(255) NOT NULL,
                created_by INT NULL,
                updated_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        const [catalogNameIndex] = await pool.query("SHOW INDEX FROM material_catalog WHERE Key_name = 'idx_material_catalog_name'");
        if (catalogNameIndex.length === 0) {
            await pool.query('CREATE INDEX idx_material_catalog_name ON material_catalog(material_name)');
            console.log('Added idx_material_catalog_name index');
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

USE smt_material_control;

-- Ensure product_type column exists in transactions (for OUTPUT records)
SET @transaction_column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND COLUMN_NAME = 'product_type'
);

SET @add_transaction_column_sql := IF(
    @transaction_column_exists = 0,
    'ALTER TABLE transactions ADD COLUMN product_type VARCHAR(50) NULL AFTER transaction_type',
    'SELECT "Column transactions.product_type already exists"'
);

PREPARE stmt_add_transaction_column FROM @add_transaction_column_sql;
EXECUTE stmt_add_transaction_column;
DEALLOCATE PREPARE stmt_add_transaction_column;

-- Ensure index for transactions.product_type
SET @transaction_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND INDEX_NAME = 'idx_transactions_product_type'
);

SET @add_transaction_index_sql := IF(
    @transaction_index_exists = 0,
    'CREATE INDEX idx_transactions_product_type ON transactions(product_type)',
    'SELECT "Index idx_transactions_product_type already exists"'
);

PREPARE stmt_add_transaction_index FROM @add_transaction_index_sql;
EXECUTE stmt_add_transaction_index;
DEALLOCATE PREPARE stmt_add_transaction_index;

-- Ensure material catalog table for master naming
CREATE TABLE IF NOT EXISTS material_catalog (
    material_id VARCHAR(100) PRIMARY KEY,
    material_name VARCHAR(255) NOT NULL,
    created_by INT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Ensure index for material_catalog name search
SET @catalog_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'material_catalog'
      AND INDEX_NAME = 'idx_material_catalog_name'
);

SET @add_catalog_index_sql := IF(
    @catalog_index_exists = 0,
    'CREATE INDEX idx_material_catalog_name ON material_catalog(material_name)',
    'SELECT "Index idx_material_catalog_name already exists"'
);

PREPARE stmt_add_catalog_index FROM @add_catalog_index_sql;
EXECUTE stmt_add_catalog_index;
DEALLOCATE PREPARE stmt_add_catalog_index;

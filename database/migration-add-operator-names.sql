USE smt_material_control;

-- Ensure operator_name column exists in transactions (for OUTPUT records)
SET @operator_column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND COLUMN_NAME = 'operator_name'
);

SET @add_operator_column_sql := IF(
    @operator_column_exists = 0,
    'ALTER TABLE transactions ADD COLUMN operator_name VARCHAR(100) NULL AFTER product_type',
    'SELECT "Column transactions.operator_name already exists"'
);

PREPARE stmt_add_operator_column FROM @add_operator_column_sql;
EXECUTE stmt_add_operator_column;
DEALLOCATE PREPARE stmt_add_operator_column;

-- Ensure index for transactions.operator_name
SET @operator_tx_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND INDEX_NAME = 'idx_transactions_operator_name'
);

SET @add_operator_tx_index_sql := IF(
    @operator_tx_index_exists = 0,
    'CREATE INDEX idx_transactions_operator_name ON transactions(operator_name)',
    'SELECT "Index idx_transactions_operator_name already exists"'
);

PREPARE stmt_add_operator_tx_index FROM @add_operator_tx_index_sql;
EXECUTE stmt_add_operator_tx_index;
DEALLOCATE PREPARE stmt_add_operator_tx_index;

-- Ensure operator master table exists
CREATE TABLE IF NOT EXISTS operator_names (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Ensure created_by column exists for backward compatibility
SET @operator_created_by_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operator_names'
      AND COLUMN_NAME = 'created_by'
);

SET @add_operator_created_by_sql := IF(
    @operator_created_by_exists = 0,
    'ALTER TABLE operator_names ADD COLUMN created_by INT NULL AFTER name',
    'SELECT "Column operator_names.created_by already exists"'
);

PREPARE stmt_add_operator_created_by FROM @add_operator_created_by_sql;
EXECUTE stmt_add_operator_created_by;
DEALLOCATE PREPARE stmt_add_operator_created_by;

-- Ensure index for operator_names.name
SET @operator_name_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'operator_names'
      AND INDEX_NAME = 'idx_operator_names_name'
);

SET @add_operator_name_index_sql := IF(
    @operator_name_index_exists = 0,
    'CREATE INDEX idx_operator_names_name ON operator_names(name)',
    'SELECT "Index idx_operator_names_name already exists"'
);

PREPARE stmt_add_operator_name_index FROM @add_operator_name_index_sql;
EXECUTE stmt_add_operator_name_index;
DEALLOCATE PREPARE stmt_add_operator_name_index;

-- SMT Material Control Database Schema
-- Compatible with MySQL (XAMPP) and Oracle (future migration)

-- Create Database
CREATE DATABASE IF NOT EXISTS smt_material_control;
USE smt_material_control;

-- Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'superadmin' or 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Materials Table (Inventory)
CREATE TABLE IF NOT EXISTS materials (
    id VARCHAR(50) PRIMARY KEY, -- Material ID (from scanner)
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Material Catalog Table (Master naming / specification, managed by Superadmin & Admin)
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
);

-- Operator Names Table (Master operator for material output)
CREATE TABLE IF NOT EXISTS operator_names (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Meter Types Table (Master type meter managed by Superadmin & Admin)
CREATE TABLE IF NOT EXISTS meter_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Transactions Table (Input/Output Records)
CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    material_id VARCHAR(50) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    transaction_type VARCHAR(10) NOT NULL, -- 'INPUT' or 'OUTPUT'
    product_type VARCHAR(50) NULL,
    operator_name VARCHAR(100) NULL,
    quantity INT NOT NULL,
    rid VARCHAR(50) NULL, -- Roll ID (5 digit unique roll identifier from QR)
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Material History Table (Audit Trail)
CREATE TABLE IF NOT EXISTS material_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    material_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_quantity INT,
    new_quantity INT,
    changed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Machine Meter Usage Table (Machine Output per Meter Type)
CREATE TABLE IF NOT EXISTS machine_meter_usage (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NULL,
    material_id VARCHAR(50) NOT NULL,
    rid VARCHAR(50) NULL,
    material_name VARCHAR(255) NOT NULL,
    meter_type VARCHAR(50) NOT NULL,
    used_quantity INT NOT NULL DEFAULT 0,
    source_pc VARCHAR(100) NULL,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

-- Processed Machine Logs Table
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
);

-- Material Rolls Table (tracks individual roll IDs per material)
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
);

-- Insert Default Users
-- Password: 'admin123' (hashed with bcrypt)
INSERT INTO users (username, password, role) VALUES 
('superadmin', '$2b$10$Rf5lHKujcj4PxQG0jZJ8T.qWz5L5xK8qGqH4zQfZ5L5xK8qGqH4zQO', 'superadmin'),
('admin', '$2b$10$Rf5lHKujcj4PxQG0jZJ8T.qWz5L5xK8qGqH4zQfZ5L5xK8qGqH4zQO', 'admin');

-- Insert Sample Materials
INSERT INTO materials (id, name, quantity) VALUES 
('12345678', 'Component UP702', 10000),
('87654321', 'Resistor 10K', 50000),
('11223344', 'Capacitor 100uF', 30000);

-- Create Indexes for Performance
CREATE INDEX idx_transactions_material ON transactions(material_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_product_type ON transactions(product_type);
CREATE INDEX idx_transactions_operator_name ON transactions(operator_name);
CREATE INDEX idx_transactions_rid ON transactions(rid);
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_material_catalog_spec ON material_catalog(specification);
CREATE INDEX idx_operator_names_name ON operator_names(name);
CREATE INDEX idx_material_history_material ON material_history(material_id);
CREATE INDEX idx_machine_meter_usage_rid ON machine_meter_usage(rid);
CREATE INDEX idx_material_rolls_material ON material_rolls(material_id);
CREATE INDEX idx_material_rolls_rid ON material_rolls(rid);
CREATE INDEX idx_material_rolls_status ON material_rolls(status);

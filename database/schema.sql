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

-- Material Catalog Table (Master naming, managed by Superadmin)
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

-- Operator Names Table (Master operator for material output)
CREATE TABLE IF NOT EXISTS operator_names (
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
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_material_catalog_name ON material_catalog(material_name);
CREATE INDEX idx_operator_names_name ON operator_names(name);
CREATE INDEX idx_material_history_material ON material_history(material_id);

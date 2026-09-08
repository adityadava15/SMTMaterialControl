-- QUICK FIX: Update User Passwords
-- Copy semua SQL di bawah ini dan jalankan di phpMyAdmin

-- Hapus user lama (jika ada)
DELETE FROM users WHERE username IN ('superadmin', 'admin');

-- Insert ulang dengan password hash yang benar
INSERT INTO users (username, password, role) VALUES 
('superadmin', '$2b$10$YourHashWillBeHere', 'superadmin'),
('admin', '$2b$10$YourHashWillBeHere', 'admin');

-- ATAU gunakan UPDATE jika user sudah ada:
-- UPDATE users SET password = '$2b$10$YourHashWillBeHere' WHERE username = 'superadmin';
-- UPDATE users SET password = '$2b$10$YourHashWillBeHere' WHERE username = 'admin';

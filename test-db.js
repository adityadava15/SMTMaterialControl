// Test Database Connection
// Run: node test-db.js

const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('Testing database connection...\n');

    try {
        // Test MySQL connection
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('✅ MySQL connection successful!');

        // Check if database exists
        const [databases] = await connection.query(
            `SHOW DATABASES LIKE '${process.env.DB_NAME || 'smt_material_control'}'`
        );

        if (databases.length === 0) {
            console.log('❌ Database "smt_material_control" tidak ditemukan!');
            console.log('\n📋 Langkah selanjutnya:');
            console.log('1. Buka XAMPP Control Panel');
            console.log('2. Start MySQL');
            console.log('3. Buka phpMyAdmin (http://localhost/phpmyadmin)');
            console.log('4. Buat database baru bernama: smt_material_control');
            console.log('5. Import file: database/schema.sql');
            await connection.end();
            return;
        }

        console.log('✅ Database "smt_material_control" ditemukan!');

        // Connect to database
        await connection.query(`USE ${process.env.DB_NAME || 'smt_material_control'}`);

        // Check if users table exists
        const [tables] = await connection.query("SHOW TABLES LIKE 'users'");

        if (tables.length === 0) {
            console.log('❌ Tabel "users" tidak ditemukan!');
            console.log('\n📋 Import schema SQL:');
            console.log('1. Buka phpMyAdmin');
            console.log('2. Select database: smt_material_control');
            console.log('3. Klik tab "SQL"');
            console.log('4. Copy isi file: database/schema.sql');
            console.log('5. Paste dan Execute');
            await connection.end();
            return;
        }

        console.log('✅ Tabel "users" ditemukan!');

        // Check users
        const [users] = await connection.query('SELECT username, role FROM users');

        if (users.length === 0) {
            console.log('❌ Tidak ada user di database!');
            console.log('\n📋 Import schema.sql untuk membuat default users');
            await connection.end();
            return;
        }

        console.log(`✅ Ditemukan ${users.length} user(s):`);
        users.forEach(user => {
            console.log(`   - ${user.username} (${user.role})`);
        });

        // Check materials table
        const [materialTables] = await connection.query("SHOW TABLES LIKE 'materials'");
        if (materialTables.length > 0) {
            const [materials] = await connection.query('SELECT COUNT(*) as count FROM materials');
            console.log(`✅ Tabel "materials" ditemukan dengan ${materials[0].count} material(s)`);
        }

        console.log('\n🎉 Database setup lengkap! Server siap digunakan.');
        console.log('   Buka: http://localhost:3000');
        console.log('   Login: superadmin / admin123');

        await connection.end();

    } catch (error) {
        console.error('❌ Error:', error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log('\n📋 MySQL tidak berjalan! Langkah:');
            console.log('1. Buka XAMPP Control Panel');
            console.log('2. Klik "Start" pada MySQL');
            console.log('3. Jalankan script ini lagi: node test-db.js');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n📋 Username/password MySQL salah!');
            console.log('Check file .env dan sesuaikan dengan konfigurasi MySQL Anda');
        }
    }
}

testConnection();

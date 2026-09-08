// Fix User Passwords
// This script will generate correct password hashes and provide SQL to update

const bcrypt = require('bcrypt');

async function fixPasswords() {
    console.log('🔧 Generating password hashes...\n');

    const password = 'admin123';
    const saltRounds = 10;

    try {
        const hash = await bcrypt.hash(password, saltRounds);

        console.log('✅ Password hash generated successfully!\n');
        console.log('Password:', password);
        console.log('Hash:', hash);
        console.log('\n📋 Copy dan jalankan SQL berikut di phpMyAdmin:\n');
        console.log('--------------------------------------------------');
        console.log(`UPDATE users SET password = '${hash}' WHERE username = 'superadmin';`);
        console.log(`UPDATE users SET password = '${hash}' WHERE username = 'admin';`);
        console.log('--------------------------------------------------\n');
        console.log('📝 Cara Update:');
        console.log('1. Buka phpMyAdmin (http://localhost/phpmyadmin)');
        console.log('2. Pilih database: smt_material_control');
        console.log('3. Klik tab "SQL"');
        console.log('4. Copy kedua baris UPDATE di atas');
        console.log('5. Paste dan klik "Go"');
        console.log('\n✅ Setelah itu, login dengan:');
        console.log('   Username: superadmin atau admin');
        console.log('   Password: admin123');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fixPasswords();

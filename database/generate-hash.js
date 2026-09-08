// Generate Password Hash for Database
// Run: node database/generate-hash.js

const bcrypt = require('bcrypt');

const password = 'admin123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error generating hash:', err);
        return;
    }

    console.log('\n=== Password Hash Generated ===');
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nUpdate SQL:');
    console.log(`UPDATE users SET password = '${hash}' WHERE username = 'superadmin';`);
    console.log(`UPDATE users SET password = '${hash}' WHERE username = 'admin';`);
    console.log('\n');
});

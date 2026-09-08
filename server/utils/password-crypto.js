const crypto = require('crypto');
const bcrypt = require('bcrypt');

const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'smt-material-control-secret-2026';
// Derive a 32-byte (256-bit) key using SHA-256
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();

/**
 * Encrypt a plain text password using AES-256-CBC.
 * Output format: enc:<iv_hex>:<ciphertext_hex>
 */
function encryptPassword(plainText) {
    if (typeof plainText !== 'string' || plainText === '') {
        return '';
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `enc:${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-CBC encrypted password back to plain text.
 * Returns null if string is not encrypted with our format or if decryption fails.
 */
function decryptPassword(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') {
        return null;
    }

    if (!cipherText.startsWith('enc:')) {
        return null; // Legacy bcrypt or unsupported format
    }

    try {
        const parts = cipherText.split(':');
        if (parts.length !== 3) {
            return null;
        }

        const iv = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        if (iv.length !== 16 || !encrypted) {
            return null;
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Password decryption error:', error.message);
        return null;
    }
}

/**
 * Checks whether a stored password string is a legacy bcrypt hash.
 */
function isLegacyHash(passwordString) {
    if (!passwordString || typeof passwordString !== 'string') {
        return false;
    }
    return (
        passwordString.startsWith('$2a$') ||
        passwordString.startsWith('$2b$') ||
        passwordString.startsWith('$2y$')
    );
}

/**
 * Verifies a candidate password against the stored password value.
 * Supports:
 * 1. AES-256 encrypted password ('enc:...')
 * 2. Legacy bcrypt hash ('$2b$...'), with optional onLegacyMatch callback for auto-migration
 * 3. Plaintext fallback
 */
async function verifyPassword(candidatePassword, storedPassword, onLegacyMatch) {
    if (!storedPassword || typeof storedPassword !== 'string') {
        return false;
    }

    // 1. AES-256 check
    if (storedPassword.startsWith('enc:')) {
        const decrypted = decryptPassword(storedPassword);
        return decrypted !== null && decrypted === candidatePassword;
    }

    // 2. Legacy bcrypt check
    if (isLegacyHash(storedPassword)) {
        try {
            const isValid = await bcrypt.compare(candidatePassword, storedPassword);
            if (isValid && typeof onLegacyMatch === 'function') {
                try {
                    const newEncrypted = encryptPassword(candidatePassword);
                    await onLegacyMatch(newEncrypted);
                } catch (migrateErr) {
                    console.error('Password auto-migration callback error:', migrateErr.message);
                }
            }
            return isValid;
        } catch (bcryptErr) {
            console.error('Bcrypt comparison error:', bcryptErr.message);
            return false;
        }
    }

    // 3. Fallback plaintext comparison
    return candidatePassword === storedPassword;
}

module.exports = {
    encryptPassword,
    decryptPassword,
    isLegacyHash,
    verifyPassword
};

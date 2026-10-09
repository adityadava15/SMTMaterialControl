// Material Input Scan Logic

// Setup form and elements (deklarasi lebih awal agar tersedia saat checkAuth callback)
const form = document.getElementById('materialInputForm');
const qrScanInput = document.getElementById('qrScanInput');
const materialIdInput = document.getElementById('materialId');
const materialRidInput = document.getElementById('materialRid');
const materialQuantityInput = document.getElementById('materialQuantity');
const submitBtn = document.getElementById('submitBtn');
const multiplierInput = document.getElementById('multiplierInput');
const historyTableBody = document.getElementById('historyTableBody');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Session History Array
let inputHistory = [];

// Check authentication and apply role restrictions
checkAuth().then(user => {
    applyRoleRestrictions(user);
});

/**
 * Restrict multiplierInput (Rolls) to superadmin only.
 * Non-superadmin users: field dikunci ke nilai 1 dan tidak bisa diubah.
 */
/**
 * Hide the Rolls box entirely for non-superadmin.
 * Only superadmin can see and change the number of rolls.
 */
function applyRoleRestrictions(user) {
    if (!user) return;

    const normalizedRole = String(user.role || '').trim().toLowerCase();
    const rollsGroup = document.getElementById('rollsGroup');
    const rollsTips = document.getElementById('rollsTips');

    if (normalizedRole !== 'superadmin') {
        // Hide Rolls box — non-superadmin always uses 1 roll
        if (rollsGroup) rollsGroup.style.display = 'none';
        if (rollsTips) rollsTips.style.display = 'none';
        multiplierInput.value = 1;
    }
}



// ========== QR CODE PARSING FUNCTIONS ==========

/**
 * Parse QR code and extract Material ID, Quantity, and RID (Roll ID)
 * Based on Excel formulas:
 * - ID: IF(LEFT(B56,3)="Z01", TRIM(MID(SUBSTITUTE(B56," ",REPT(" ",LEN(B56))), (5)*LEN(B56)+1, LEN(B56))), IFERROR(LEFT(B56,FIND("&",B56)-1), B56))
 * - QTY: IF(LEFT(B56,2)="Z0", TRIM(MID(SUBSTITUTE(B56," ",REPT(" ",LEN(B56))), (13)*LEN(B56)+1, LEN(B56))), TRIM(MID(SUBSTITUTE(B56,"&",REPT(" ",LEN(B56))), (1)*LEN(B56), LEN(B56))))
 * - RID: RIGHT(TRIM(B56), 5) -> 5 digit paling belakang dari barcode roll unik
 */
function parseQRCode(scannedText) {
    if (!scannedText || scannedText.trim() === '') {
        return null;
    }

    const text = scannedText.trim();
    let materialId = null;
    let quantity = null;
    let rid = null;

    try {
        // Extract Material ID
        materialId = extractMaterialID(text);

        // Extract Quantity
        quantity = extractQuantity(text);

        // Extract RID (Roll ID - 5 digit belakang)
        rid = extractRID(text);

        // Validate results
        if (!materialId || materialId === '' || materialId === 'null') {
            return null;
        }

        return {
            id: materialId,
            qty: quantity && quantity !== 'null' && quantity !== '' ? parseInt(quantity) : null,
            rid: rid
        };
    } catch (error) {
        console.error('QR parsing error:', error);
        return null;
    }
}

function extractMaterialID(text) {
    const start3 = text.substring(0, 3);

    if (start3 === 'Z01') {
        // Z01 format: split by space and get token at position 5
        const tokens = text.split(/\s+/);
        if (tokens.length > 5 && tokens[5] !== 'null') {
            return tokens[5].trim();
        }
        return null;
    } else {
        // Non-Z01 format: try to find "&" separator
        const ampIndex = text.indexOf('&');
        if (ampIndex > 0) {
            return text.substring(0, ampIndex).trim();
        }
        return text.trim();
    }
}

function extractQuantity(text) {
    const start2 = text.substring(0, 2);

    if (start2 === 'Z0') {
        const tokens = text.split(/\s+/);
        if (tokens.length > 13 && tokens[13] !== 'null') {
            return tokens[13].trim();
        }
        return null;
    } else {
        const parts = text.split('&');
        if (parts.length >= 2) {
            return parts[1].trim();
        }
        return null;
    }
}

/**
 * Extract 5-digit RID (Roll ID) from barcode
 * e.g. S0086*********1051802606110002504 -> 02504
 *      S0086*********102621260312000022 -> 00022
 */
function extractRID(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (trimmed.includes('&')) {
        const parts = trimmed.split('&');
        if (parts.length >= 3 && parts[2].trim()) {
            const p3 = parts[2].trim();
            const matchP3 = p3.match(/(\d{5})$/);
            return matchP3 ? matchP3[1] : (p3.length >= 5 ? p3.slice(-5) : p3);
        }
    }

    const tokens = trimmed.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    const match = lastToken.match(/(\d{5})$/);
    if (match) return match[1];

    const digitMatch = lastToken.match(/\d+/g);
    if (digitMatch && digitMatch.length > 0) {
        const lastGroup = digitMatch[digitMatch.length - 1];
        if (lastGroup.length >= 5) return lastGroup.slice(-5);
    }

    return null;
}

// ========== IN-MEMORY CACHE ==========
const materialNameCache = new Map(); // materialId -> name string

// ========== EVENT HANDLERS ==========

qrScanInput.addEventListener('input', handleQRScan);
qrScanInput.addEventListener('change', handleQRScan);

let qrScanTimeout = null;

function handleQRScan(e) {
    const scannedText = e.target.value;

    if (qrScanTimeout) {
        clearTimeout(qrScanTimeout);
    }

    // Reduced from 300ms to 80ms — barcode scanners finish sending in <50ms
    qrScanTimeout = setTimeout(() => {
        if (scannedText && scannedText.length > 5) {
            processQRCode(scannedText);
        }
    }, 80);
}

function processQRCode(scannedText) {
    const parsed = parseQRCode(scannedText);

    if (parsed && parsed.id) {
        // Successfully parsed
        materialIdInput.value = parsed.id;
        if (materialRidInput) {
            materialRidInput.value = parsed.rid || '-';
        }

        if (parsed.qty && parsed.qty > 0) {
            const multiplier = parseInt(multiplierInput.value) || 1;
            const totalQty = parsed.qty * multiplier;
            materialQuantityInput.value = totalQty;

            if (multiplier > 1) {
                showToast(`Info: ${parsed.qty} x ${multiplier} roll = ${totalQty} pcs`, 'info');
            }
        }

        // Clear scan input immediately
        qrScanInput.value = '';

        const ridNotice = parsed.rid ? ` (RID: ${parsed.rid})` : '';
        showToast(`QR Code berhasil di-scan${ridNotice}! Memproses...`, 'success');

        // AUTO SUBMIT — reduced from 500ms to 100ms
        setTimeout(() => {
            submitBtn.click();
        }, 100);
    } else {
        showQRErrorModal();
    }
}

function showQRErrorModal() {
    const modal = document.getElementById('qrErrorModal');
    modal.style.display = 'flex';
}

function closeQRErrorModal() {
    const modal = document.getElementById('qrErrorModal');
    modal.style.display = 'none';
    qrScanInput.value = '';
    qrScanInput.focus();
}

function resetForm() {
    // Save multiplier value
    const currentMultiplier = multiplierInput.value;

    form.reset();

    // Restore multiplier
    multiplierInput.value = currentMultiplier;

    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    qrScanInput.focus();
}

// ========== FORM SUBMISSION ==========

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = materialIdInput.value.trim();
    const quantity = parseInt(materialQuantityInput.value);
    const rid = materialRidInput && materialRidInput.value && materialRidInput.value !== '-'
        ? materialRidInput.value.trim()
        : null;

    if (!id || !quantity) {
        showError('ID dan Quantity harus terisi');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '\u23F3 Memproses...';

    try {
        // 1. Find name — check cache first, then fetch both sources in parallel
        let name = '';

        if (materialNameCache.has(id)) {
            name = materialNameCache.get(id);
        } else {
            const [materialRes, catalogRes] = await Promise.all([
                fetch(`/api/materials/${id}`).catch(() => null),
                fetch(`/api/material-catalog/${id}`).catch(() => null)
            ]);

            if (materialRes && materialRes.ok) {
                const d = await materialRes.json().catch(() => null);
                if (d && d.data && d.data.name) name = d.data.name;
            }

            if (!name && catalogRes && catalogRes.ok) {
                const d = await catalogRes.json().catch(() => null);
                if (d && d.data && (d.data.specification || d.data.material_name)) name = d.data.specification || d.data.material_name;
            }

            if (name) materialNameCache.set(id, name);
        }

        if (!name) {
            showError('Material ID belum terdaftar di master data');
            return;
        }

        // 2. Submit data
        const response = await fetch('/api/materials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id,
                quantity,
                rid
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const savedName = data.data && data.data.name ? data.data.name : name;
            const ridText = rid ? ` [RID: ${rid}]` : '';
            showSuccess(`Berhasil! ${savedName}${ridText} (+${quantity})`);
            showToast('Material berhasil di-input!', 'success');

            // Add to history
            addToHistory(id, savedName, quantity, rid);

            // Auto reset form but KEEP multiplier
            setTimeout(() => {
                resetForm();
            }, 1000);
        } else {
            const errorMsg = data.error || 'Gagal menyimpan material';
            showError(errorMsg);
            showToast(errorMsg, 'error');
            if (qrScanInput) {
                qrScanInput.value = '';
                qrScanInput.focus();
            }
        }

    } catch (error) {
        console.error('Error submitting material:', error);
        showError('Terjadi kesalahan koneksi');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '\u2705 Input Material';
    }
});

function showSuccess(message) {
    const successMessage = document.getElementById('successMessage');
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
}

// ========== HISTORY FUNCTIONS ==========

function addToHistory(id, name, qty, rid = null) {
    const entry = {
        id,
        rid: rid || '-',
        name,
        qty,
        timestamp: new Date()
    };

    // Add to beginning of array
    inputHistory.unshift(entry);

    // Update UI
    renderHistory();
}

function renderHistory() {
    if (inputHistory.length === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 15px; color: var(--light-text); font-style: italic;">
                    Belum ada data input di sesi ini
                </td>
            </tr>
        `;
        clearHistoryBtn.style.visibility = 'hidden';
        return;
    }

    clearHistoryBtn.style.visibility = 'visible';

    historyTableBody.innerHTML = inputHistory.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                <div style="font-weight: 600; font-family: 'Courier New', monospace;">${item.id}</div>
                <div style="font-size: 12px; color: var(--light-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">
                    ${item.name}
                </div>
            </td>
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                ${item.rid && item.rid !== '-' ? `<span style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace;">${item.rid}</span>` : '<span style="color: var(--light-text);">-</span>'}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: var(--success-color);">
                +${item.qty}
            </td>
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: var(--light-text);">
                ${formatTime(item.timestamp)}
            </td>
        </tr>
    `).join('');
}

function clearInputHistory() {
    if (confirm('Hapus semua riwayat sesi ini?')) {
        inputHistory = [];
        renderHistory();
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

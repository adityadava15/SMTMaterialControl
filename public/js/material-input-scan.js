// Material Input Scan Logic

// Check authentication
checkAuth();

// Setup form and elements
const form = document.getElementById('materialInputForm');
const qrScanInput = document.getElementById('qrScanInput');
const materialIdInput = document.getElementById('materialId');
const materialQuantityInput = document.getElementById('materialQuantity');
const submitBtn = document.getElementById('submitBtn');
const multiplierInput = document.getElementById('multiplierInput');
const historyTableBody = document.getElementById('historyTableBody');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Session History Array
let inputHistory = [];

// ========== QR CODE PARSING FUNCTIONS ==========

/**
 * Parse QR code and extract Material ID and Quantity
 * Based on Excel formulas:
 * - ID: IF(LEFT(B56,3)="Z01", TRIM(MID(SUBSTITUTE(B56," ",REPT(" ",LEN(B56))), (5)*LEN(B56)+1, LEN(B56))), IFERROR(LEFT(B56,FIND("&",B56)-1), B56))
 * - QTY: IF(LEFT(B56,2)="Z0", TRIM(MID(SUBSTITUTE(B56," ",REPT(" ",LEN(B56))), (13)*LEN(B56)+1, LEN(B56))), TRIM(MID(SUBSTITUTE(B56,"&",REPT(" ",LEN(B56))), (1)*LEN(B56), LEN(B56))))
 */
function parseQRCode(scannedText) {
    if (!scannedText || scannedText.trim() === '') {
        return null;
    }

    const text = scannedText.trim();
    let materialId = null;
    let quantity = null;

    try {
        // Extract Material ID
        materialId = extractMaterialID(text);

        // Extract Quantity
        quantity = extractQuantity(text);

        // Validate results
        if (!materialId || materialId === '' || materialId === 'null') {
            return null;
        }

        return {
            id: materialId,
            qty: quantity && quantity !== 'null' && quantity !== '' ? parseInt(quantity) : null
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

// ========== EVENT HANDLERS ==========

qrScanInput.addEventListener('input', handleQRScan);
qrScanInput.addEventListener('change', handleQRScan);

let qrScanTimeout = null;

function handleQRScan(e) {
    const scannedText = e.target.value;

    if (qrScanTimeout) {
        clearTimeout(qrScanTimeout);
    }

    qrScanTimeout = setTimeout(() => {
        if (scannedText && scannedText.length > 5) {
            processQRCode(scannedText);
        }
    }, 300);
}

function processQRCode(scannedText) {
    const parsed = parseQRCode(scannedText);

    if (parsed && parsed.id) {
        // Successfully parsed
        materialIdInput.value = parsed.id;

        if (parsed.qty && parsed.qty > 0) {
            // Calculate total quantity based on multiplier
            const multiplier = parseInt(multiplierInput.value) || 1;
            const totalQty = parsed.qty * multiplier;

            materialQuantityInput.value = totalQty;

            // Show calculation info in toast if multiplier > 1
            if (multiplier > 1) {
                showToast(`Info: ${parsed.qty} x ${multiplier} roll = ${totalQty} pcs`, 'info');
            }
        }

        // Clear scan input
        qrScanInput.value = '';

        // Show success feedback
        showToast('QR Code berhasil di-scan! Memproses...', 'success');

        // AUTO SUBMIT
        // Use a small timeout to allow UI update
        setTimeout(() => {
            submitBtn.click();
        }, 500);
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

    if (!id || !quantity) {
        showError('ID dan Quantity harus terisi');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '\u23F3 Memproses...';

    try {
        // 1. Find name from existing material or master catalog
        let name = '';
        try {
            const checkRes = await fetch(`/api/materials/${id}`);
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.data && checkData.data.name) {
                    name = checkData.data.name;
                }
            }
        } catch (err) {
            console.warn('Could not check existing material name');
        }

        if (!name) {
            try {
                const catalogRes = await fetch(`/api/material-catalog/${id}`);
                if (catalogRes.ok) {
                    const catalogData = await catalogRes.json();
                    if (catalogData.data && catalogData.data.material_name) {
                        name = catalogData.data.material_name;
                    }
                }
            } catch (err) {
                console.warn('Could not check material master name');
            }
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
                quantity
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const savedName = data.data && data.data.name ? data.data.name : name;
            showSuccess(`Berhasil! ${savedName} (+${quantity})`);
            showToast('Material berhasil di-input!', 'success');

            // Add to history
            addToHistory(id, savedName, quantity);

            // Auto reset form but KEEP multiplier
            setTimeout(() => {
                resetForm();
            }, 1000);
        } else {
            showError(data.error || 'Gagal menyimpan material');
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

function addToHistory(id, name, qty) {
    const entry = {
        id,
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
                <td colspan="3" style="text-align: center; padding: 15px; color: var(--light-text); font-style: italic;">
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
                <div style="font-weight: 600;">${item.id}</div>
                <div style="font-size: 12px; color: var(--light-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">
                    ${item.name}
                </div>
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

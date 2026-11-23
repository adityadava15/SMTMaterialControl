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
    if (!scannedText) return null;

    const text = scannedText.trim();
    if (!text) return null;

    try {
        const tokens = text.split(/\s+/);
        const materialId = extractMaterialID(text, tokens);
        const quantity = extractQuantity(text, tokens);
        const rid = extractRID(text, tokens);

        if (!materialId || materialId === 'null') {
            return null;
        }

        return {
            id: materialId,
            qty: quantity && quantity !== 'null' ? parseInt(quantity, 10) : null,
            rid: rid
        };
    } catch (error) {
        console.error('QR parsing error:', error);
        return null;
    }
}

function extractMaterialID(text, tokens) {
    if (text.startsWith('Z01')) {
        if (tokens.length > 5 && tokens[5] !== 'null') {
            return tokens[5].trim();
        }
        return null;
    }

    const ampIndex = text.indexOf('&');
    if (ampIndex > 0) {
        return text.substring(0, ampIndex).trim();
    }
    return text;
}

function extractQuantity(text, tokens) {
    if (text.startsWith('Z0')) {
        if (tokens.length > 13 && tokens[13] !== 'null') {
            return tokens[13].trim();
        }
        return null;
    }

    const parts = text.split('&');
    if (parts.length >= 2) {
        return parts[1].trim();
    }
    return null;
}

/**
 * Extract 5-digit RID (Roll ID) from barcode
 * e.g. S0086*********1051802606110002504 -> 02504
 *      S0086*********102621260312000022 -> 00022
 */
function extractRID(text, tokens) {
    if (!text || typeof text !== 'string') return null;

    if (text.includes('&')) {
        const parts = text.split('&');
        if (parts.length >= 3 && parts[2].trim()) {
            const p3 = parts[2].trim();
            const matchP3 = p3.match(/(\d{5})$/);
            return matchP3 ? matchP3[1] : (p3.length >= 5 ? p3.slice(-5) : p3);
        }
    }

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

// ========== SCAN QUEUE & STATE ==========
let qrScanTimeout = null;
let resetPreviewTimeout = null;
let scanSequence = 0;
const submitQueue = [];
let isSubmitting = false;

// ========== EVENT HANDLERS ==========

// Instant 0ms trigger when scanner sends Enter (or Tab) termination key
qrScanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && qrScanInput.value.trim().length > 5)) {
        e.preventDefault();
        e.stopPropagation();

        if (qrScanTimeout) {
            clearTimeout(qrScanTimeout);
            qrScanTimeout = null;
        }

        const scannedText = qrScanInput.value;
        if (scannedText && scannedText.trim().length > 5) {
            qrScanInput.value = '';
            processQRCode(scannedText);
        }
    }
});

// Immediate 0ms trigger on paste
qrScanInput.addEventListener('paste', () => {
    if (qrScanTimeout) {
        clearTimeout(qrScanTimeout);
        qrScanTimeout = null;
    }
    setTimeout(() => {
        const scannedText = qrScanInput.value;
        if (scannedText && scannedText.trim().length > 5) {
            qrScanInput.value = '';
            processQRCode(scannedText);
        }
    }, 0);
});

// Fallback debounce (50ms) for scanners configured without Enter/Tab suffix
qrScanInput.addEventListener('input', handleQRScan);

function handleQRScan() {
    if (qrScanTimeout) {
        clearTimeout(qrScanTimeout);
    }

    if (qrScanInput.value.length <= 5) {
        return;
    }

    qrScanTimeout = setTimeout(() => {
        qrScanTimeout = null;
        const scannedText = qrScanInput.value;
        if (scannedText && scannedText.trim().length > 5) {
            qrScanInput.value = '';
            processQRCode(scannedText);
        }
    }, 50);
}

function processQRCode(scannedText) {
    const parsed = parseQRCode(scannedText);

    if (parsed && parsed.id) {
        scanSequence += 1;
        if (resetPreviewTimeout) {
            clearTimeout(resetPreviewTimeout);
            resetPreviewTimeout = null;
        }

        const multiplier = Math.max(1, parseInt(multiplierInput.value, 10) || 1);
        const totalQty = parsed.qty && parsed.qty > 0 ? parsed.qty * multiplier : null;

        materialIdInput.value = parsed.id;
        if (materialRidInput) {
            materialRidInput.value = parsed.rid || '-';
        }
        materialQuantityInput.value = totalQty || '';

        // Keep scanner box ready immediately for the next roll
        qrScanInput.value = '';
        qrScanInput.focus();

        if (totalQty && totalQty > 0) {
            enqueueSubmission({
                id: parsed.id,
                quantity: totalQty,
                rid: parsed.rid || null,
                seq: scanSequence
            });
        } else {
            showError('Quantity tidak terbaca dari QR code');
        }
    } else {
        qrScanInput.value = '';
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

function clearPreviewFields() {
    materialIdInput.value = '';
    if (materialRidInput) materialRidInput.value = '';
    materialQuantityInput.value = '';
}

function resetForm() {
    const currentMultiplier = multiplierInput.value;
    if (resetPreviewTimeout) {
        clearTimeout(resetPreviewTimeout);
        resetPreviewTimeout = null;
    }

    form.reset();
    multiplierInput.value = currentMultiplier;

    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    qrScanInput.focus();
}

// ========== FORM SUBMISSION (NON-BLOCKING FIFO QUEUE) ==========

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = materialIdInput.value.trim();
    const quantity = parseInt(materialQuantityInput.value, 10);
    const rid = materialRidInput && materialRidInput.value && materialRidInput.value !== '-'
        ? materialRidInput.value.trim()
        : null;

    if (!id || !quantity) {
        showError('ID dan Quantity harus terisi');
        return;
    }

    scanSequence += 1;
    enqueueSubmission({ id, quantity, rid, seq: scanSequence });
});

function updateSubmitButtonState() {
    if (isSubmitting) {
        submitBtn.disabled = true;
        const pending = submitQueue.length;
        submitBtn.textContent = pending > 0
            ? `\u23F3 Memproses (${pending + 1})...`
            : '\u23F3 Memproses...';
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = '\u2705 Input Material';
    }
}

function enqueueSubmission(item) {
    submitQueue.push(item);
    updateSubmitButtonState();
    if (!isSubmitting) {
        processSubmitQueue();
    }
}

async function processSubmitQueue() {
    if (isSubmitting) return;
    isSubmitting = true;
    updateSubmitButtonState();

    try {
        while (submitQueue.length > 0) {
            const { id, quantity, rid, seq } = submitQueue.shift();
            updateSubmitButtonState();

            try {
                // Single round-trip: backend validates master catalog, RID uniqueness, and saves atomically
                const response = await fetch('/api/materials', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id, quantity, rid })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    const savedName = (data.data && data.data.name) || id;
                    const ridText = rid ? ` [RID: ${rid}]` : '';
                    showSuccess(`Berhasil! ${savedName}${ridText} (+${quantity})`);
                    showToast(`Berhasil input ${id}${ridText} (+${quantity})`, 'success', 2000);

                    addToHistory(id, savedName, quantity, rid);

                    // Clear preview fields quickly only if no newer scan arrived
                    if (submitQueue.length === 0 && seq === scanSequence) {
                        resetPreviewTimeout = setTimeout(() => {
                            if (submitQueue.length === 0 && seq === scanSequence) {
                                clearPreviewFields();
                            }
                        }, 350);
                    }
                } else {
                    const errorMsg = data.error || 'Gagal menyimpan material';
                    showError(errorMsg);
                    showToast(errorMsg, 'error');
                }
            } catch (error) {
                console.error('Error submitting material:', error);
                showError('Terjadi kesalahan koneksi');
                showToast('Terjadi kesalahan koneksi', 'error');
            }
        }
    } finally {
        isSubmitting = false;
        updateSubmitButtonState();
        if (document.activeElement !== multiplierInput) {
            qrScanInput.focus();
        }
    }
}

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

function buildHistoryRow(item) {
    const safeId = escapeHtml(item.id);
    const safeName = escapeHtml(item.name);
    const safeRid = item.rid && item.rid !== '-' ? escapeHtml(item.rid) : null;

    return `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                <div style="font-weight: 600; font-family: 'Courier New', monospace;">${safeId}</div>
                <div style="font-size: 12px; color: var(--light-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 480px;">
                    ${safeName}
                </div>
            </td>
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                ${safeRid ? `<span style="background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace;">${safeRid}</span>` : '<span style="color: var(--light-text);">-</span>'}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: var(--success-color);">
                +${item.qty}
            </td>
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: var(--light-text);">
                ${formatTime(item.timestamp)}
            </td>
        </tr>
    `;
}

function addToHistory(id, name, qty, rid = null) {
    const entry = {
        id,
        rid: rid || '-',
        name,
        qty,
        timestamp: new Date()
    };

    inputHistory.unshift(entry);

    if (inputHistory.length === 1) {
        renderHistory();
    } else {
        clearHistoryBtn.style.visibility = 'visible';
        historyTableBody.insertAdjacentHTML('afterbegin', buildHistoryRow(entry));
    }
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
    historyTableBody.innerHTML = inputHistory.map(buildHistoryRow).join('');
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

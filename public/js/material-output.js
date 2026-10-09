// Material Output Logic

// Usage list array
let usageList = [];
const OUTPUT_HISTORY_LIMIT = 20;

initMaterialOutputPage();

// Setup scanner input
const scanInput = document.getElementById('scanInput');
const outputProductTypeInput = document.getElementById('outputProductType');
const outputOperatorInput = document.getElementById('outputOperator');
const outputHistoryStartInput = document.getElementById('outputHistoryStartDateTime');
const outputHistoryEndInput = document.getElementById('outputHistoryEndDateTime');

// Auto-focus scanner input
if (scanInput) scanInput.focus();

async function initMaterialOutputPage() {
    const user = await checkAuth();
    if (!user) return;

    await loadOutputMeterTypes();
    await loadOutputOperators();
    updateConfirmButtonState();
    loadOutputHistory();
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
        materialId = extractMaterialID(text);
        quantity = extractQuantity(text);
        rid = extractRID(text);

        if (!materialId || materialId === '' || materialId === 'null') {
            return null;
        }

        return {
            id: materialId,
            qty: quantity && quantity !== 'null' && quantity !== '' ? parseInt(quantity, 10) : null,
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
        const tokens = text.split(/\s+/);
        if (tokens.length > 5 && tokens[5] !== 'null') return tokens[5].trim();
        return null;
    } else {
        const ampIndex = text.indexOf('&');
        if (ampIndex > 0) return text.substring(0, ampIndex).trim();
        return text.trim();
    }
}

function extractQuantity(text) {
    const start2 = text.substring(0, 2);
    if (start2 === 'Z0') {
        const tokens = text.split(/\s+/);
        if (tokens.length > 13 && tokens[13] !== 'null') return tokens[13].trim();
        return null;
    } else {
        const parts = text.split('&');
        if (parts.length >= 2) return parts[1].trim();
        return null;
    }
}

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
const materialCache = new Map(); // materialId -> { id, name, quantity }

// ========== QR SCAN EVENT HANDLER ==========

if (scanInput) {
    scanInput.addEventListener('input', handleQRScan);
    scanInput.addEventListener('change', handleQRScan);
}

if (outputProductTypeInput) {
    outputProductTypeInput.addEventListener('change', () => {
        updateConfirmButtonState();
    });
}

if (outputOperatorInput) {
    outputOperatorInput.addEventListener('change', () => {
        updateConfirmButtonState();
    });
}

if (outputHistoryStartInput) {
    outputHistoryStartInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyOutputHistoryFilters();
        }
    });
}

if (outputHistoryEndInput) {
    outputHistoryEndInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyOutputHistoryFilters();
        }
    });
}

let qrScanTimeout = null;

function handleQRScan(e) {
    const scannedText = e.target.value;

    if (qrScanTimeout) clearTimeout(qrScanTimeout);

    // Reduced from 300ms to 80ms — barcode scanners finish sending in <50ms
    qrScanTimeout = setTimeout(() => {
        if (scannedText && scannedText.length > 5) {
            processQRCode(scannedText);
        }
    }, 80);
}

async function processQRCode(scannedText) {
    if (!scannedText) return;
    const trimmed = scannedText.trim();
    let parsed = parseQRCode(trimmed);

    // If not standard QR code format, try direct RID lookup
    if (!parsed || !parsed.id) {
        const potentialRid = extractRID(trimmed) || (trimmed.length <= 15 ? trimmed : null);
        if (potentialRid) {
            try {
                const res = await fetch('/api/materials/roll-by-rid/' + encodeURIComponent(potentialRid));
                const d = await res.json();
                if (res.ok && d.success && d.data) {
                    parsed = {
                        id: d.data.material_id,
                        qty: d.data.roll_quantity,
                        rid: d.data.rid
                    };
                }
            } catch (e) {
                console.warn('Roll by RID direct lookup error:', e);
            }
        }
    }

    if (parsed && parsed.id) {
        await handleScan(parsed.id, parsed.qty, parsed.rid);
        if (scanInput) scanInput.value = '';
    } else {
        showQRErrorModal();
    }
}

function showQRErrorModal() {
    const modal = document.getElementById('qrErrorModal');
    if (modal) modal.style.display = 'flex';
}

function closeQRErrorModal() {
    const modal = document.getElementById('qrErrorModal');
    if (modal) modal.style.display = 'none';
    if (scanInput) {
        scanInput.value = '';
        scanInput.focus();
    }
}

async function handleScan(materialId, scannedQty = null, rid = null) {
    if (!materialId) {
        return;
    }

    const scanError = document.getElementById('scanError');
    if (scanError) scanError.style.display = 'none';

    try {
        let materialData = null;

        // Verify roll if RID is present
        if (rid) {
            try {
                const rollRes = await fetch('/api/materials/roll-by-rid/' + encodeURIComponent(rid));
                const rollData = await rollRes.json();
                if (rollRes.ok && rollData.success && rollData.data) {
                    if (!scannedQty || scannedQty <= 0) {
                        scannedQty = rollData.data.roll_quantity;
                    }
                } else {
                    const errorMsg = rollData.error || `Roll dengan RID "${rid}" tidak ditemukan dalam stok aktif!`;
                    showScanError(errorMsg);
                    showToast(errorMsg, 'error');
                    if (scanInput) scanInput.focus();
                    return;
                }
            } catch (err) {
                console.error('Error verifying roll RID:', err);
            }
        }

        // Use cache if available — skip network round-trip
        if (materialCache.has(materialId)) {
            materialData = materialCache.get(materialId);
        } else {
            const response = await fetch('/api/materials/' + encodeURIComponent(materialId));
            const data = await response.json();

            if (response.ok && data.success) {
                materialData = data.data;
                materialCache.set(materialId, materialData);
            } else {
                showScanError(data.error || 'Material tidak ditemukan');
                if (scanInput) scanInput.focus();
                return;
            }
        }

        // Check if already in list with same materialId AND same rid
        const existing = usageList.find(item => item.materialId === materialId && (item.rid || null) === (rid || null));

        if (existing) {
            showToast('Material ' + materialId + (rid ? ' (RID: ' + rid + ')' : '') + ' sudah ada dalam daftar', 'warning');
        } else {
            const initialQty = scannedQty ? parseInt(scannedQty, 10) : 0;

            addToUsageList({
                materialId: materialData.id,
                name: materialData.name,
                availableQuantity: materialData.quantity,
                quantity: initialQty,
                rid: rid || null
            });
            showToast('Material ' + materialData.name + (rid ? ' (RID: ' + rid + ')' : '') + ' ditambahkan' + (initialQty > 0 ? ' (Qty: ' + initialQty + ')' : ''), 'success');
        }
    } catch (error) {
        console.error('Scan error:', error);
        showScanError('Error saat mencari material');
    }

    if (scanInput) scanInput.focus();
}

function addToUsageList(item) {
    usageList.push(item);
    renderUsageList();
}

function renderUsageList() {
    const container = document.getElementById('usageList');
    const itemCount = document.getElementById('itemCount');

    if (itemCount) {
        itemCount.textContent = usageList.length + ' item';
    }

    if (!container) return;

    if (usageList.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--light-text); padding: 40px;">Scan material untuk menambahkan ke daftar penggunaan</p>';
        updateConfirmButtonState();
        return;
    }

    updateConfirmButtonState();

    container.innerHTML = usageList.map((item, index) => {
        const qty = item.quantity || 0;
        let presetValue = '';

        if ([1000, 2000, 3000, 5000].includes(qty)) {
            presetValue = qty.toString();
        } else if (qty > 0) {
            presetValue = 'custom';
        }

        const ridBadge = item.rid ? '<span class="badge" style="background-color: #dbeafe; color: #1e40af; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-family: monospace; font-weight: 600;">RID: ' + escapeHtml(item.rid) + '</span>' : '';

        return '<div class="usage-item">' +
            '<div class="usage-info">' +
                '<div class="usage-id" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                    '<span>' + escapeHtml(item.materialId) + '</span>' +
                    ridBadge +
                '</div>' +
                '<div class="usage-name">' + escapeHtml(item.name) + '</div>' +
                '<div style="font-size: 12px; color: var(--light-text); margin-top: 4px;">' +
                    'Tersedia: <strong>' + formatNumber(item.availableQuantity) + '</strong> pcs' +
                '</div>' +
            '</div>' +
            '<div class="usage-controls">' +
                '<select class="select-input" style="width: 120px;" onchange="updateQuantityFromPreset(' + index + ', this.value)">' +
                    '<option value="" ' + (presetValue === '' ? 'selected' : '') + '>Preset</option>' +
                    '<option value="1000" ' + (presetValue === '1000' ? 'selected' : '') + '>1,000</option>' +
                    '<option value="2000" ' + (presetValue === '2000' ? 'selected' : '') + '>2,000</option>' +
                    '<option value="3000" ' + (presetValue === '3000' ? 'selected' : '') + '>3,000</option>' +
                    '<option value="5000" ' + (presetValue === '5000' ? 'selected' : '') + '>5,000</option>' +
                    '<option value="custom" ' + (presetValue === 'custom' ? 'selected' : '') + '>Custom</option>' +
                '</select>' +
                '<input type="number" class="form-input qty-input" placeholder="Qty" min="1" max="' + item.availableQuantity + '" value="' + (item.quantity || '') + '" onchange="updateQuantity(' + index + ', this.value)">' +
                '<button class="btn btn-danger btn-sm" onclick="removeFromList(' + index + ')">🗑️</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function updateConfirmButtonState() {
    const confirmBtn = document.getElementById('confirmBtn');
    if (!confirmBtn) return;

    const hasItems = usageList.length > 0;
    const hasProductType = outputProductTypeInput ? Boolean(outputProductTypeInput.value) : true;
    const hasOperator = outputOperatorInput ? Boolean(outputOperatorInput.value) : true;
    confirmBtn.disabled = !(hasItems && hasProductType && hasOperator);
}

function updateQuantityFromPreset(index, value) {
    if (value && value !== 'custom') {
        usageList[index].quantity = parseInt(value, 10);
        renderUsageList();
    }
}

function updateQuantity(index, value) {
    usageList[index].quantity = parseInt(value, 10) || 0;
}

function removeFromList(index) {
    usageList.splice(index, 1);
    renderUsageList();
    showToast('Item dihapus dari daftar', 'success');
}

function clearUsageList() {
    if (usageList.length === 0) return;

    if (confirm('Hapus semua item dari daftar?')) {
        usageList = [];
        renderUsageList();
        showToast('Daftar dikosongkan', 'success');
    }
}

async function confirmUsage() {
    const confirmError = document.getElementById('confirmError');
    const confirmSuccess = document.getElementById('confirmSuccess');
    const confirmBtn = document.getElementById('confirmBtn');
    const productType = outputProductTypeInput ? outputProductTypeInput.value : '';
    const operatorId = outputOperatorInput ? parseInt(outputOperatorInput.value, 10) : NaN;

    if (confirmError) confirmError.style.display = 'none';
    if (confirmSuccess) confirmSuccess.style.display = 'none';

    if (!productType) {
        const message = 'isi type meter terlebih dahulu';
        showConfirmError(message);
        showToast(message, 'warning');
        if (outputProductTypeInput) {
            outputProductTypeInput.focus();
        }
        return;
    }

    const invalidItems = usageList.filter(item => !item.quantity || item.quantity <= 0);
    if (invalidItems.length > 0) {
        showConfirmError('Semua item harus memiliki quantity yang valid');
        return;
    }

    const exceededItems = usageList.filter(item => item.quantity > item.availableQuantity);
    if (exceededItems.length > 0) {
        const names = exceededItems.map(item => item.name).join(', ');
        showConfirmError('Quantity melebihi stok tersedia: ' + names);
        return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Memproses...';

    try {
        const items = usageList.map(item => ({
            materialId: item.materialId,
            quantity: item.quantity,
            rid: item.rid || null
        }));

        const machineSelect = document.getElementById('outputMachine');
        const machineId = machineSelect && machineSelect.value ? machineSelect.value : undefined;

        const response = await fetch('/api/transactions/output', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items, productType, operatorId, machineId })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showConfirmSuccess('Penggunaan material berhasil dikonfirmasi! Stok telah dikurangi.');
            showToast('Penggunaan material dikonfirmasi!', 'success');
            loadOutputHistory();

            setTimeout(() => {
                usageList = [];
                renderUsageList();
                if (confirmSuccess) confirmSuccess.style.display = 'none';
            }, 2000);
        } else {
            showConfirmError(data.error || 'Gagal mengkonfirmasi penggunaan material');
        }
    } catch (error) {
        console.error('Confirm usage error:', error);
        showConfirmError('Terjadi kesalahan saat mengkonfirmasi penggunaan');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ Konfirmasi Penggunaan';
    }
}

function showScanError(message) {
    const scanError = document.getElementById('scanError');
    if (!scanError) return;
    scanError.textContent = message;
    scanError.style.display = 'block';
}

function showConfirmError(message) {
    const confirmError = document.getElementById('confirmError');
    if (!confirmError) return;
    confirmError.textContent = message;
    confirmError.style.display = 'block';
}

function showConfirmSuccess(message) {
    const confirmSuccess = document.getElementById('confirmSuccess');
    if (!confirmSuccess) return;
    confirmSuccess.textContent = message;
    confirmSuccess.style.display = 'block';
}

function applyOutputHistoryFilters() {
    loadOutputHistory();
}

function resetOutputHistoryFilters() {
    if (outputHistoryStartInput) outputHistoryStartInput.value = '';
    if (outputHistoryEndInput) outputHistoryEndInput.value = '';
    loadOutputHistory();
}

async function loadOutputMeterTypes() {
    if (!outputProductTypeInput) return;

    const previousValue = outputProductTypeInput.value;
    try {
        const response = await fetch('/api/meter-types');
        const data = await response.json();

        if (response.ok && data.success && Array.isArray(data.data) && data.data.length > 0) {
            const types = data.data;
            outputProductTypeInput.innerHTML = [
                '<option value="">Pilih Type</option>',
                ...types.map((t) => '<option value="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</option>')
            ].join('');

            const hasPreviousValue = types.some((t) => t.name === previousValue);
            if (hasPreviousValue) {
                outputProductTypeInput.value = previousValue;
            }
        }
    } catch (error) {
        console.error('Load output meter types error:', error);
    }
}

async function loadOutputOperators() {
    if (!outputOperatorInput) return;

    const previousValue = outputOperatorInput.value;
    outputOperatorInput.disabled = true;
    outputOperatorInput.innerHTML = '<option value="">Memuat operator...</option>';

    try {
        const response = await fetch('/api/users/operators');
        const data = await response.json();

        if (!(response.ok && data.success)) {
            throw new Error(data.error || 'Gagal memuat operator');
        }

        const operators = Array.isArray(data.data) ? data.data : [];
        if (operators.length === 0) {
            outputOperatorInput.innerHTML = '<option value="">Belum ada operator</option>';
            outputOperatorInput.disabled = true;
            return;
        }

        outputOperatorInput.innerHTML = [
            '<option value="">Pilih Operator</option>',
            ...operators.map((operator) => '<option value="' + operator.id + '">' + escapeHtml(operator.name) + '</option>')
        ].join('');

        const hasPreviousValue = operators.some((operator) => String(operator.id) === previousValue);
        if (hasPreviousValue) {
            outputOperatorInput.value = previousValue;
        }

        outputOperatorInput.disabled = false;
    } catch (error) {
        console.error('Load output operators error:', error);
        outputOperatorInput.innerHTML = '<option value="">Gagal memuat operator</option>';
        outputOperatorInput.disabled = true;
    } finally {
        updateConfirmButtonState();
    }
}

async function loadOutputHistory() {
    const historyBody = document.getElementById('outputHistoryBody');
    if (!historyBody) return;

    const startDateTime = outputHistoryStartInput ? outputHistoryStartInput.value : '';
    const endDateTime = outputHistoryEndInput ? outputHistoryEndInput.value : '';

    if (startDateTime && endDateTime && new Date(startDateTime) > new Date(endDateTime)) {
        showToast('Rentang tanggal tidak valid: "Dari" lebih besar dari "Sampai"', 'warning');
        return;
    }

    try {
        const params = new URLSearchParams({
            page: 1,
            limit: OUTPUT_HISTORY_LIMIT,
            type: 'OUTPUT'
        });

        if (startDateTime) params.set('startDateTime', startDateTime);
        if (endDateTime) params.set('endDateTime', endDateTime);

        const response = await fetch('/api/transactions/history?' + params.toString());
        const data = await response.json();

        if (response.ok && data.success) {
            renderOutputHistory(data.data);
            return;
        }

        historyBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--danger-color);">Gagal memuat history output</td></tr>';
    } catch (error) {
        console.error('Load output history error:', error);
        historyBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--danger-color);">Terjadi kesalahan saat memuat history</td></tr>';
    }
}

function renderOutputHistory(historyItems) {
    const historyBody = document.getElementById('outputHistoryBody');
    if (!historyBody) return;

    if (!historyItems || historyItems.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--light-text);">Belum ada data output</td></tr>';
        return;
    }

    historyBody.innerHTML = historyItems.map((item) => {
        const ridBadge = item.rid ? '<span class="badge" style="background-color: #e0f2fe; color: #0369a1; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-family: monospace; font-weight: 600;">' + escapeHtml(item.rid) + '</span>' : '<span style="color: var(--light-text);">-</span>';

        return '<tr>' +
            '<td style="font-family: monospace; font-weight: bold;">' + escapeHtml(item.material_id) + '</td>' +
            '<td>' + ridBadge + '</td>' +
            '<td>' + escapeHtml(item.specification || item.material_name) + '</td>' +
            '<td>' + escapeHtml(item.product_type || '-') + '</td>' +
            '<td>' + escapeHtml(item.operator_name || item.display_user || item.username || '-') + '</td>' +
            '<td>' + formatNumber(item.quantity) + ' pcs</td>' +
            '<td>' + formatDateTime(item.created_at) + '</td>' +
        '</tr>';
    }).join('');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

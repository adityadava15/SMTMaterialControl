// Material Output Logic

// Usage list array
let usageList = [];
const OUTPUT_HISTORY_LIMIT = 20;

initMaterialOutputPage();

// Setup scanner input
// Setup scanner input
const scanInput = document.getElementById('scanInput');
const outputProductTypeInput = document.getElementById('outputProductType');
const outputOperatorInput = document.getElementById('outputOperator');
const outputHistoryStartInput = document.getElementById('outputHistoryStartDateTime');
const outputHistoryEndInput = document.getElementById('outputHistoryEndDateTime');
// Remove old setup and use new QR handler
// setupScannerInput(scanInput, handleScan); 

// Auto-focus scanner input
scanInput.focus();

async function initMaterialOutputPage() {
    const user = await checkAuth();
    if (!user) return;

    await loadOutputOperators();
    updateConfirmButtonState();
    loadOutputHistory();
}

// ========== QR CODE PARSING FUNCTIONS ==========

function parseQRCode(scannedText) {
    if (!scannedText || scannedText.trim() === '') return null;
    const text = scannedText.trim();

    try {
        const materialId = extractMaterialID(text);
        const quantity = extractQuantity(text); // We parse QTY but output page typically just needs ID lookup first

        if (!materialId || materialId === '' || materialId === 'null') return null;

        return { id: materialId, qty: quantity };
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

// ========== QR SCAN EVENT HANDLER ==========

scanInput.addEventListener('input', handleQRScan);
scanInput.addEventListener('change', handleQRScan);

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

    qrScanTimeout = setTimeout(() => {
        if (scannedText && scannedText.length > 5) {
            processQRCode(scannedText);
        }
    }, 300);
}

function processQRCode(scannedText) {
    const parsed = parseQRCode(scannedText);

    if (parsed && parsed.id) {
        // Success - handle the scanned ID
        handleScan(parsed.id, parsed.qty); // Pass QTY if needed later
        scanInput.value = '';
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
    scanInput.value = '';
    scanInput.focus();
}

async function handleScan(materialId, scannedQty = null) {
    if (!materialId) {
        return;
    }

    const scanError = document.getElementById('scanError');
    scanError.style.display = 'none';

    try {
        // Fetch material details
        const response = await fetch(`/api/materials/${materialId}`);
        const data = await response.json();

        if (response.ok && data.success) {
            // Check if already in list
            const existing = usageList.find(item => item.materialId === materialId);

            if (existing) {
                showToast('Material sudah ada dalam daftar', 'warning');
            } else {
                // Add to usage list
                // Use scanned qty if available, otherwise 0
                const initialQty = scannedQty ? parseInt(scannedQty) : 0;

                addToUsageList({
                    materialId: data.data.id,
                    name: data.data.name,
                    availableQuantity: data.data.quantity,
                    quantity: initialQty
                });
                showToast(`Material ${data.data.name} ditambahkan` + (initialQty > 0 ? ` (Qty: ${initialQty})` : ''), 'success');
            }
        } else {
            showScanError(data.error || 'Material tidak ditemukan');
        }
    } catch (error) {
        console.error('Scan error:', error);
        showScanError('Error saat mencari material');
    }

    // Refocus scanner input
    scanInput.focus();
}

function addToUsageList(item) {
    usageList.push(item);
    renderUsageList();
}

function renderUsageList() {
    const container = document.getElementById('usageList');
    const itemCount = document.getElementById('itemCount');

    itemCount.textContent = `${usageList.length} item`;

    if (usageList.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--light-text); padding: 40px;">
                Scan material untuk menambahkan ke daftar penggunaan
            </p>
        `;
        updateConfirmButtonState();
        return;
    }

    updateConfirmButtonState();

    container.innerHTML = usageList.map((item, index) => {
        // Determine which preset option to select
        const qty = item.quantity || 0;
        let presetValue = "";

        if ([1000, 2000, 3000, 5000].includes(qty)) {
            presetValue = qty.toString();
        } else if (qty > 0) {
            presetValue = "custom";
        }

        return `
        <div class="usage-item">
            <div class="usage-info">
                <div class="usage-id">${item.materialId}</div>
                <div class="usage-name">${item.name}</div>
                <div style="font-size: 12px; color: var(--light-text); margin-top: 4px;">
                    Tersedia: <strong>${formatNumber(item.availableQuantity)}</strong> pcs
                </div>
            </div>
            <div class="usage-controls">
                <select class="select-input" style="width: 120px;" onchange="updateQuantityFromPreset(${index}, this.value)">
                    <option value="" ${presetValue === "" ? "selected" : ""}>Preset</option>
                    <option value="1000" ${presetValue === "1000" ? "selected" : ""}>1,000</option>
                    <option value="2000" ${presetValue === "2000" ? "selected" : ""}>2,000</option>
                    <option value="3000" ${presetValue === "3000" ? "selected" : ""}>3,000</option>
                    <option value="5000" ${presetValue === "5000" ? "selected" : ""}>5,000</option>
                    <option value="custom" ${presetValue === "custom" ? "selected" : ""}>Custom</option>
                </select>
                <input 
                    type="number" 
                    class="form-input qty-input" 
                    placeholder="Qty"
                    min="1"
                    max="${item.availableQuantity}"
                    value="${item.quantity || ''}"
                    onchange="updateQuantity(${index}, this.value)"
                >
                <button class="btn btn-danger btn-sm" onclick="removeFromList(${index})">\u{1F5D1}\uFE0F</button>
            </div>
        </div>
    `}).join('');
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
        usageList[index].quantity = parseInt(value);
        renderUsageList();
    }
}

function updateQuantity(index, value) {
    usageList[index].quantity = parseInt(value) || 0;
}

function removeFromList(index) {
    usageList.splice(index, 1);
    renderUsageList();
    showToast('Item dihapus dari daftar', 'success');
}

function clearUsageList() {
    if (usageList.length === 0) {
        return;
    }

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

    confirmError.style.display = 'none';
    confirmSuccess.style.display = 'none';

    if (!productType) {
        const message = 'isi type meter terlebih dahulu';
        showConfirmError(message);
        showToast(message, 'warning');
        if (outputProductTypeInput) {
            outputProductTypeInput.focus();
        }
        return;
    }

    // Validate quantities
    const invalidItems = usageList.filter(item => !item.quantity || item.quantity <= 0);
    if (invalidItems.length > 0) {
        showConfirmError('Semua item harus memiliki quantity yang valid');
        return;
    }

    // Check if quantity exceeds available
    const exceededItems = usageList.filter(item => item.quantity > item.availableQuantity);
    if (exceededItems.length > 0) {
        const names = exceededItems.map(item => item.name).join(', ');
        showConfirmError(`Quantity melebihi stok tersedia: ${names}`);
        return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '\u23F3 Memproses...';

    try {
        // Prepare items for API
        const items = usageList.map(item => ({
            materialId: item.materialId,
            quantity: item.quantity
        }));

        const response = await fetch('/api/transactions/output', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items, productType, operatorId })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showConfirmSuccess('Penggunaan material berhasil dikonfirmasi! Stok telah dikurangi.');
            showToast('Penggunaan material dikonfirmasi!', 'success');
            loadOutputHistory();

            // Clear list after success
            setTimeout(() => {
                usageList = [];
                renderUsageList();
                confirmSuccess.style.display = 'none';
            }, 2000);
        } else {
            showConfirmError(data.error || 'Gagal mengkonfirmasi penggunaan material');
        }
    } catch (error) {
        console.error('Confirm usage error:', error);
        showConfirmError('Terjadi kesalahan saat mengkonfirmasi penggunaan');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '\u2705 Konfirmasi Penggunaan';
    }
}

function showScanError(message) {
    const scanError = document.getElementById('scanError');
    scanError.textContent = message;
    scanError.style.display = 'block';
}

function showConfirmError(message) {
    const confirmError = document.getElementById('confirmError');
    confirmError.textContent = message;
    confirmError.style.display = 'block';
}

function showConfirmSuccess(message) {
    const confirmSuccess = document.getElementById('confirmSuccess');
    confirmSuccess.textContent = message;
    confirmSuccess.style.display = 'block';
}

function applyOutputHistoryFilters() {
    loadOutputHistory();
}

function resetOutputHistoryFilters() {
    if (outputHistoryStartInput) {
        outputHistoryStartInput.value = '';
    }

    if (outputHistoryEndInput) {
        outputHistoryEndInput.value = '';
    }

    loadOutputHistory();
}

async function loadOutputOperators() {
    if (!outputOperatorInput) {
        return;
    }

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
            ...operators.map((operator) => `<option value="${operator.id}">${escapeHtml(operator.name)}</option>`)
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

        if (startDateTime) {
            params.set('startDateTime', startDateTime);
        }

        if (endDateTime) {
            params.set('endDateTime', endDateTime);
        }

        const response = await fetch(`/api/transactions/history?${params.toString()}`);
        const data = await response.json();

        if (response.ok && data.success) {
            renderOutputHistory(data.data);
            return;
        }

        historyBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--danger-color);">
                    Gagal memuat history output
                </td>
            </tr>
        `;
    } catch (error) {
        console.error('Load output history error:', error);
        historyBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--danger-color);">
                    Terjadi kesalahan saat memuat history
                </td>
            </tr>
        `;
    }
}

function renderOutputHistory(historyItems) {
    const historyBody = document.getElementById('outputHistoryBody');
    if (!historyBody) return;

    if (!historyItems || historyItems.length === 0) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--light-text);">
                    Belum ada data output
                </td>
            </tr>
        `;
        return;
    }

    historyBody.innerHTML = historyItems.map((item) => `
        <tr>
            <td style="font-family: 'Courier New', monospace; font-weight: bold;">${escapeHtml(item.material_id)}</td>
            <td>${escapeHtml(item.material_name)}</td>
            <td>${escapeHtml(item.product_type || '-')}</td>
            <td>${escapeHtml(item.operator_name || item.display_user || item.username || '-')}</td>
            <td>${formatNumber(item.quantity)} pcs</td>
            <td>${formatDateTime(item.created_at)}</td>
        </tr>
    `).join('');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

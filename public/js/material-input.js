// Material Input Logic

// Check authentication
checkAuth();

// Setup form
const form = document.getElementById('materialInputForm');
const materialIdInput = document.getElementById('materialId');
const materialNameInput = document.getElementById('materialName');
const materialRidInput = document.getElementById('materialRid');
const quantityPreset = document.getElementById('quantityPreset');
const materialQuantity = document.getElementById('materialQuantity');

let lookupTimer = null;

// Handle quantity preset changes
quantityPreset.addEventListener('change', (e) => {
    const value = e.target.value;

    if (value && value !== 'custom') {
        materialQuantity.value = value;
        materialQuantity.readOnly = true;
    } else {
        materialQuantity.value = '';
        materialQuantity.readOnly = false;
        materialQuantity.focus();
    }
});

// ========== QR CODE PARSING HELPERS ==========
function extractMaterialID(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('Z01') || upper.startsWith('Z0')) {
        const tokens = trimmed.split(/\s+/);
        if (tokens.length > 5 && tokens[5] !== 'null') {
            return tokens[5].trim();
        }
    }
    const ampIndex = trimmed.indexOf('&');
    if (ampIndex > 0) {
        return trimmed.substring(0, ampIndex).trim();
    }
    return trimmed;
}

function extractQuantity(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (/^Z0/i.test(trimmed)) {
        const tokens = trimmed.split(/\s+/);
        if (tokens.length > 13 && tokens[13] !== 'null') {
            const val = parseFloat(tokens[13].trim());
            return isNaN(val) ? null : Math.round(val);
        }
    } else {
        const parts = trimmed.split('&');
        if (parts.length >= 2) {
            const val = parseInt(parts[1].trim(), 10);
            return isNaN(val) ? null : val;
        }
    }
    return null;
}

function extractRID(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
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

function handlePotentialQRScan() {
    const raw = materialIdInput.value;
    if (!raw) return;

    if (/^Z0/i.test(raw.trim()) || raw.includes('&') || /[\r\n]/.test(raw)) {
        const parsedId = extractMaterialID(raw);
        const parsedQty = extractQuantity(raw);
        const parsedRid = extractRID(raw);

        if (parsedId) {
            materialIdInput.value = parsedId;
            if (parsedQty && (!materialQuantity.value || materialQuantity.readOnly)) {
                materialQuantity.value = parsedQty;
            }
            if (parsedRid && materialRidInput) {
                materialRidInput.value = parsedRid;
            }
            showToast(`Material ID: ${parsedId}${parsedQty ? ` | Qty: ${parsedQty}` : ''}`, 'info');
            loadMaterialNameFromMaster(parsedId);
            return true;
        }
    }
    return false;
}

materialIdInput.addEventListener('input', () => {
    if (handlePotentialQRScan()) return;

    const materialId = extractMaterialID(materialIdInput.value);
    materialNameInput.value = '';

    if (lookupTimer) clearTimeout(lookupTimer);

    if (!materialId) return;

    lookupTimer = setTimeout(() => {
        loadMaterialNameFromMaster(materialId);
    }, 250);
});

materialIdInput.addEventListener('paste', () => {
    setTimeout(handlePotentialQRScan, 20);
});

materialIdInput.addEventListener('blur', () => {
    const materialId = extractMaterialID(materialIdInput.value);
    if (materialId) {
        materialIdInput.value = materialId;
        loadMaterialNameFromMaster(materialId);
    }
});

// Handle form submission
form.addEventListener('submit', handleMaterialInput);

async function loadMaterialNameFromMaster(materialId) {
    try {
        const response = await fetch(`/api/material-catalog/${encodeURIComponent(materialId)}`);
        const data = await response.json();

        if (response.ok && data.success) {
            materialNameInput.value = data.data.specification || data.data.material_name || '';
            return;
        }

        materialNameInput.value = '';
    } catch (error) {
        console.error('Load material master error:', error);
        materialNameInput.value = '';
    }
}

async function handleMaterialInput(e) {
    e.preventDefault();

    const materialId = extractMaterialID(materialIdInput.value.trim());
    if (materialId) materialIdInput.value = materialId;
    const quantity = parseInt(materialQuantity.value, 10);
    const materialName = materialNameInput.value.trim();

    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');

    // Hide previous messages
    successMessage.style.display = 'none';
    errorMessage.style.display = 'none';

    // Validate
    if (!materialId || !quantity || quantity <= 0) {
        showError('Material ID dan quantity harus diisi dengan benar');
        return;
    }

    if (!materialName) {
        showError('Material ID belum terdaftar di master data');
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = '\u23F3 Memproses...';

    try {
        const rid = materialRidInput && materialRidInput.value ? materialRidInput.value.trim() : null;

        const response = await fetch('/api/materials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: materialId,
                quantity: quantity,
                rid: rid
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showSuccess(data.message || 'Material berhasil ditambahkan!');
            showToast(`Material ${data.data.name} berhasil ditambahkan!`, 'success');

            setTimeout(() => {
                resetForm();
            }, 1000);
        } else {
            const errorMsg = data.error || 'Gagal menambahkan material';
            showError(errorMsg);
            showToast(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Error adding material:', error);
        showError('Terjadi kesalahan saat menambahkan material');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '\u2705 Input Material';
    }
}

function showSuccess(message) {
    const successMessage = document.getElementById('successMessage');
    successMessage.textContent = message;
    successMessage.style.display = 'block';
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function resetForm() {
    form.reset();
    materialNameInput.value = '';
    materialQuantity.readOnly = false;
    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    materialIdInput.focus();
}

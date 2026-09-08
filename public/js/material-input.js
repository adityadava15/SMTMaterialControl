// Material Input Logic

// Check authentication
checkAuth();

// Setup form
const form = document.getElementById('materialInputForm');
const materialIdInput = document.getElementById('materialId');
const materialNameInput = document.getElementById('materialName');
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

materialIdInput.addEventListener('input', () => {
    const materialId = materialIdInput.value.trim();
    materialNameInput.value = '';

    if (lookupTimer) clearTimeout(lookupTimer);

    if (!materialId) return;

    lookupTimer = setTimeout(() => {
        loadMaterialNameFromMaster(materialId);
    }, 250);
});

materialIdInput.addEventListener('blur', () => {
    const materialId = materialIdInput.value.trim();
    if (materialId) {
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
            materialNameInput.value = data.data.material_name || '';
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

    const materialId = materialIdInput.value.trim();
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
        const response = await fetch('/api/materials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: materialId,
                quantity: quantity
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
            showError(data.error || 'Gagal menambahkan material');
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

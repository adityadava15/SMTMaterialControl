// Master Materials Management Logic (Superadmin & Admin)

let currentMasterPage = 1;
const MASTER_LIMIT = 20;
let currentMasterSearch = '';

document.addEventListener('DOMContentLoaded', initMasterMaterialsPage);

async function initMasterMaterialsPage() {
    const user = await checkAuth();
    if (!user) return;

    const role = String(user.role || '').trim().toLowerCase();
    const username = String(user.username || '').trim().toLowerCase();
    const canAccess = role === 'superadmin' || role === 'admin' || role === 'user' || username === 'admin';
    if (!canAccess) {
        showToast('Akses ditolak. Silakan login terlebih dahulu.', 'error');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1200);
        return;
    }

    const searchInput = document.getElementById('masterSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchMaster(1);
            }
        });
    }

    setupMaterialIdScanInput(
        document.getElementById('addMaterialId'),
        'addSpecification',
        'addMaterialIdFeedback',
        'saveAddBtn'
    );
    setupMaterialIdScanInput(
        document.getElementById('editMaterialId'),
        'editSpecification',
        'editMaterialIdFeedback',
        'saveEditBtn',
        () => {
            const el = document.getElementById('editOriginalId');
            return el ? el.value : null;
        }
    );

    // Category Dropdown initialization (Master vs Meter Komponen Quantity)
    const urlParams = new URLSearchParams(window.location.search);
    const initialCategory = urlParams.get('category') || 'master';
    switchMasterCategory(initialCategory);

    await loadMasterData(1);
}

// ========== CATEGORY DROPDOWN SWITCHER (MASTER vs METER KOMPONEN QUANTITY) ==========

function switchMasterCategory(category) {
    const masterContainer = document.getElementById('viewMasterContainer');
    const meterQtyContainer = document.getElementById('viewMeterQuantityContainer');
    const pageTitle = document.getElementById('pageTitleText');
    const pageSubtitle = document.getElementById('pageSubtitleText');
    const categorySubtitle = document.getElementById('currentCategorySubtitle');
    const masterBadge = document.getElementById('totalMasterBadge');
    const dropdown = document.getElementById('masterCategoryDropdown');

    const effectiveCategory = category === 'meter_quantity' ? 'meter_quantity' : 'master';

    if (dropdown && dropdown.value !== effectiveCategory) {
        dropdown.value = effectiveCategory;
    }

    if (effectiveCategory === 'meter_quantity') {
        if (masterContainer) masterContainer.style.display = 'none';
        if (meterQtyContainer) meterQtyContainer.style.display = 'block';
        if (pageTitle) pageTitle.textContent = 'Meter Komponen Quantity';
        if (pageSubtitle) pageSubtitle.textContent = 'Katalog standar quantity komponen per type meter.';
        if (categorySubtitle) categorySubtitle.textContent = 'Menampilkan data meter komponen quantity';
        if (masterBadge) masterBadge.style.display = 'none';
    } else {
        if (masterContainer) masterContainer.style.display = 'block';
        if (meterQtyContainer) meterQtyContainer.style.display = 'none';
        if (pageTitle) pageTitle.textContent = 'Master Data Material SMT';
        if (pageSubtitle) pageSubtitle.textContent = 'Kelola daftar katalog Material ID dan Spesifikasi untuk auto-complete saat scan input dan output mesin.';
        if (categorySubtitle) categorySubtitle.textContent = 'Menampilkan data master material SMT';
        if (masterBadge) masterBadge.style.display = 'inline-flex';
    }

    // Update sidebar active sub-item styling
    const navSubMaster = document.getElementById('navSubMaster');
    const navSubMeterQuantity = document.getElementById('navSubMeterQuantity');
    if (effectiveCategory === 'meter_quantity') {
        if (navSubMeterQuantity) {
            navSubMeterQuantity.className = 'flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1e3a8a] text-white shadow-xs transition';
        }
        if (navSubMaster) {
            navSubMaster.className = 'flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition';
        }
    } else {
        if (navSubMaster) {
            navSubMaster.className = 'flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1e3a8a] text-white shadow-xs transition';
        }
        if (navSubMeterQuantity) {
            navSubMeterQuantity.className = 'flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition';
        }
    }

    // Persist in URL query param
    try {
        const url = new URL(window.location);
        if (effectiveCategory === 'meter_quantity') {
            url.searchParams.set('category', 'meter_quantity');
        } else {
            url.searchParams.delete('category');
        }
        window.history.replaceState({}, '', url);
    } catch (e) {
        // Silently ignore URL state errors
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ========== LOAD MASTER DATA ==========

async function loadMasterData(page = 1) {
    const tbody = document.getElementById('masterTableBody');
    const badgeCount = document.getElementById('totalMasterBadge');
    if (!tbody) return;

    currentMasterPage = Math.max(1, parseInt(page, 10) || 1);

    try {
        const params = new URLSearchParams({
            page: currentMasterPage,
            limit: MASTER_LIMIT,
            search: currentMasterSearch
        });

        const response = await fetch(`/api/material-catalog?${params.toString()}`);
        const result = await response.json();

        if (response.ok && result.success) {
            const pagination = result.pagination || { total: 0, page: 1, limit: MASTER_LIMIT, totalPages: 1 };
            
            if (badgeCount) {
                badgeCount.textContent = `${formatNumber(pagination.total || 0)} Material Terdaftar`;
            }

            renderMasterTable(result.data || [], pagination);
            renderMasterPagination(pagination);
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 24px; color: var(--danger-color);">
                        ${escapeHtml(result.error || 'Gagal memuat master data material')}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Load master data error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 24px; color: var(--danger-color);">
                    Terjadi kesalahan koneksi saat memuat data master
                </td>
            </tr>
        `;
    }
}

function renderMasterTable(items, pagination) {
    const tbody = document.getElementById('masterTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 36px; color: var(--light-text);">
                    <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
                    <strong>Belum ada data master material${currentMasterSearch ? ' yang cocok dengan pencarian' : ''}</strong>
                    <p style="font-size: 13px; margin: 6px 0 0 0; opacity: 0.85;">
                        Anda dapat mengunggah file Excel master atau menekan tombol <strong>Tambah Material Manual</strong>.
                    </p>
                </td>
            </tr>
        `;
        return;
    }

    const startIndex = (pagination.page - 1) * pagination.limit;

    tbody.innerHTML = items.map((item, index) => {
        const escapedId = escapeHtml(item.material_id);
        const specVal = item.specification || item.material_name || '';
        const escapedSpec = escapeHtml(specVal);
        const qtyVal = item.qty !== undefined && item.qty !== null ? item.qty : 1;
        const unitVal = item.unit || 'PCS';
        const escapedUnit = escapeHtml(unitVal);
        const singleQuoteId = escapeSingleQuote(item.material_id);
        const singleQuoteSpec = escapeSingleQuote(specVal);
        const singleQuoteUnit = escapeSingleQuote(unitVal);

        return `
            <tr>
                <td style="color: var(--light-text); font-size: 13px;">${startIndex + index + 1}</td>
                <td>
                    <span class="material-id-cell">${escapedId}</span>
                </td>
                <td style="font-weight: 500; color: var(--dark-text);">
                    ${escapedSpec}
                </td>
                <td style="text-align: center; font-weight: 600; color: var(--dark-text);">
                    ${formatNumber(qtyVal)}
                </td>
                <td style="text-align: center;">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                        ${escapedUnit}
                    </span>
                </td>
                <td style="font-size: 13px; color: var(--light-text); white-space: nowrap;">
                    ⏱️ ${formatDateTime(item.updated_at || item.created_at)}
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button 
                        type="button" 
                        class="btn btn-secondary btn-sm" 
                        style="padding: 4px 10px; font-size: 12px; margin-right: 4px;"
                        onclick="openEditModal('${singleQuoteId}', '${singleQuoteSpec}', ${qtyVal}, '${singleQuoteUnit}')"
                        title="Edit material ini"
                    >
                        ✏️ Edit
                    </button>
                    <button 
                        type="button" 
                        class="btn btn-danger btn-sm" 
                        style="padding: 4px 10px; font-size: 12px;"
                        onclick="deleteMasterItem('${singleQuoteId}', '${singleQuoteSpec}')"
                        title="Hapus material ini"
                    >
                        🗑️ Hapus
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderMasterPagination(pagination) {
    const container = document.getElementById('masterPagination');
    const infoEl = document.getElementById('masterPageInfo');
    if (!container) return;

    if (!pagination || pagination.total === 0) {
        container.innerHTML = '';
        if (infoEl) infoEl.textContent = 'Menampilkan 0 data';
        return;
    }

    const { page, total, totalPages, limit } = pagination;
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    if (infoEl) {
        infoEl.innerHTML = `Menampilkan <strong>${from}-${to}</strong> dari total <strong>${formatNumber(total)}</strong> data (Halaman ${page}/${totalPages})`;
    }

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    if (page > 1) {
        html += `<button type="button" class="page-btn" onclick="loadMasterData(1)" title="Halaman Pertama">&laquo;</button>`;
        html += `<button type="button" class="page-btn" onclick="loadMasterData(${page - 1})">&lsaquo; Prev</button>`;
    }

    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button type="button" class="page-btn ${i === page ? 'active' : ''}" onclick="loadMasterData(${i})">${i}</button>`;
    }

    if (page < totalPages) {
        html += `<button type="button" class="page-btn" onclick="loadMasterData(${page + 1})">Next &rsaquo;</button>`;
        html += `<button type="button" class="page-btn" onclick="loadMasterData(${totalPages})" title="Halaman Terakhir">&raquo;</button>`;
    }

    container.innerHTML = html;
}

// ========== SEARCH & FILTER ==========

function searchMaster(page = 1) {
    const searchInput = document.getElementById('masterSearchInput');
    currentMasterSearch = searchInput ? searchInput.value.trim() : '';
    loadMasterData(page);
}

function resetSearchMaster() {
    const searchInput = document.getElementById('masterSearchInput');
    if (searchInput) searchInput.value = '';
    currentMasterSearch = '';
    loadMasterData(1);
}

// ========== UPLOAD & AUTO-UPDATE EXCEL ==========

async function handleUploadExcel(e) {
    e.preventDefault();

    const fileInput = document.getElementById('masterFileInput');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const file = fileInput && fileInput.files && fileInput.files[0];

    if (!file) {
        showToast('Silakan pilih file Excel terlebih dahulu', 'warning');
        return;
    }

    const originalText = submitBtn ? submitBtn.textContent : 'Upload';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Memproses Excel...';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/material-catalog/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const summary = result.summary || {};
            const inserted = summary.inserted || 0;
            const updated = summary.updated || 0;
            const total = summary.totalValidRows || (inserted + updated);

            showToast(`Upload sukses! ${total} baris diproses (${inserted} baru, ${updated} auto-updated).`, 'success');
            
            if (fileInput) fileInput.value = '';
            await loadMasterData(1);
        } else {
            showToast(result.error || 'Gagal mengunggah file Excel master', 'error');
        }
    } catch (error) {
        console.error('Upload master Excel error:', error);
        showToast('Terjadi kesalahan koneksi saat upload', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// ========== EXPORT EXCEL ==========

async function exportMasterExcel() {
    const exportBtn = document.getElementById('exportExcelBtn');
    const originalText = exportBtn ? exportBtn.textContent : 'Export';

    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Mengekspor...';
    }

    try {
        showToast('Menyiapkan file Excel master material...', 'info');

        const response = await fetch('/api/material-catalog/export');
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Gagal mengekspor data');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `Master_Material_SMT_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast('File Excel master berhasil diunduh!', 'success');
    } catch (error) {
        console.error('Export Excel error:', error);
        showToast(error.message || 'Terjadi kesalahan saat mengunduh Excel', 'error');
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }
    }
}

// ========== TAMBAH MATERIAL MANUAL ==========

// --- QR / Barcode Parsing (Ambil ID Material Saja) ---
function _extractMaterialIDFromScan(text) {
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

    const ampIdx = trimmed.indexOf('&');
    if (ampIdx > 0) {
        return trimmed.substring(0, ampIdx).trim();
    }

    return trimmed;
}

/**
 * Setup scanner listener and duplicate check directly on Material ID input fields
 */
function setupMaterialIdScanInput(inputEl, targetNameInputId, feedbackElId, saveBtnId, getOriginalIdFn) {
    if (!inputEl) return;
    let scanTimer = null;
    let dupTimer = null;

    const feedbackEl = feedbackElId ? document.getElementById(feedbackElId) : null;
    const saveBtn = saveBtnId ? document.getElementById(saveBtnId) : null;

    const clearFeedback = () => {
        if (feedbackEl) {
            feedbackEl.style.display = 'none';
            feedbackEl.innerHTML = '';
        }
        inputEl.style.borderColor = '';
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.removeAttribute('title');
        }
    };

    const checkDuplicate = async (rawInput) => {
        const id = _extractMaterialIDFromScan(rawInput || inputEl.value || '');
        if (!id) {
            clearFeedback();
            return false;
        }

        const origId = getOriginalIdFn ? getOriginalIdFn() : null;
        if (origId && origId.trim().toLowerCase() === id.trim().toLowerCase()) {
            clearFeedback();
            return false;
        }

        try {
            const res = await fetch(`/api/material-catalog/${encodeURIComponent(id)}`);
            const json = await res.json();

            if (res.ok && json.success && json.data) {
                // ID sudah terdaftar!
                const existingSpec = json.data.specification || json.data.material_name;
                inputEl.style.borderColor = '#dc2626';
                if (feedbackEl) {
                    feedbackEl.style.display = 'block';
                    feedbackEl.style.background = '#fef2f2';
                    feedbackEl.style.color = '#dc2626';
                    feedbackEl.style.border = '1px solid #fecaca';
                    feedbackEl.innerHTML = `⚠️ <strong>ID Sudah Terdaftar!</strong> Material ID <code>${escapeHtml(id)}</code> sudah ada di master data dengan spesifikasi <strong>"${escapeHtml(existingSpec)}"</strong>. Tidak dapat menambahkan ID yang sama!`;
                }
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.title = 'Material ID sudah ada di master data!';
                }
                showToast(`Material ID "${id}" sudah ada di data master!`, 'warning');
                return true;
            } else {
                clearFeedback();
                return false;
            }
        } catch (err) {
            clearFeedback();
            return false;
        }
    };

    const scheduleDupCheck = () => {
        clearTimeout(dupTimer);
        dupTimer = setTimeout(() => {
            checkDuplicate(inputEl.value);
        }, 250);
    };

    const processScan = () => {
        const raw = inputEl.value;
        if (!raw) {
            clearFeedback();
            return;
        }

        const parsed = _extractMaterialIDFromScan(raw);
        if (parsed) {
            inputEl.value = parsed;
            if (parsed !== raw) {
                showToast(`Material ID terdeteksi: ${parsed}`, 'success');
            }
        }

        // Pastikan spesifikasi tetap kosong saat scan, tidak terisi potongan barcode
        const specEl = document.getElementById(targetNameInputId);
        if (specEl && parsed && parsed !== raw) {
            specEl.value = '';
        }

        scheduleDupCheck();
    };

    inputEl.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val) {
            clearFeedback();
            return;
        }

        // Debounce 150ms agar menunggu barcode scanner selesai mengirim seluruh karakter
        clearTimeout(scanTimer);
        scanTimer = setTimeout(processScan, 150);
    });

    inputEl.addEventListener('paste', () => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(processScan, 50);
    });

    inputEl.addEventListener('blur', () => {
        processScan();
    });

    // Mencegah barcode scanner menekan Tab atau Enter yang menyebabkan kursor loncat ke field nama sebelum scan selesai
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            clearTimeout(scanTimer);
            processScan();
        }
    });
}

function openAddModal() {
    const modal = document.getElementById('addMaterialModal');
    const form = document.getElementById('addMaterialForm');
    if (form) form.reset();

    const idInput = document.getElementById('addMaterialId');
    if (idInput) idInput.style.borderColor = '';

    const qtyInput = document.getElementById('addQty');
    if (qtyInput) qtyInput.value = '1';

    const unitInput = document.getElementById('addUnit');
    if (unitInput) unitInput.value = 'PCS';

    const feedback = document.getElementById('addMaterialIdFeedback');
    if (feedback) {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    }

    const saveBtn = document.getElementById('saveAddBtn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.removeAttribute('title');
    }

    if (modal) {
        modal.style.display = 'flex';
        if (idInput) {
            setTimeout(() => idInput.focus(), 150);
        }
    }
}

function closeAddModal() {
    const modal = document.getElementById('addMaterialModal');
    if (modal) modal.style.display = 'none';
}

async function submitAddMaterial(e) {
    e.preventDefault();

    const idInput = document.getElementById('addMaterialId');
    const specInput = document.getElementById('addSpecification');
    const qtyInput = document.getElementById('addQty');
    const unitInput = document.getElementById('addUnit');
    const saveBtn = document.getElementById('saveAddBtn');

    const rawId = idInput ? idInput.value.trim() : '';
    const materialId = _extractMaterialIDFromScan(rawId);
    if (idInput && materialId) idInput.value = materialId;

    const specification = specInput ? specInput.value.trim() : '';
    const parsedQty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
    const qty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;
    const unit = (unitInput ? unitInput.value.trim().toUpperCase() : '') || 'PCS';

    if (!materialId) {
        showToast('Material ID wajib diisi', 'warning');
        if (idInput) idInput.focus();
        return;
    }

    if (!specification) {
        showToast('Spesifikasi wajib diisi sebelum menyimpan!', 'warning');
        if (specInput) specInput.focus();
        return;
    }

    // Validasi duplikasi sebelum submit
    try {
        const checkRes = await fetch(`/api/material-catalog/${encodeURIComponent(materialId)}`);
        const checkJson = await checkRes.json();
        if (checkRes.ok && checkJson.success && checkJson.data) {
            const existingSpec = checkJson.data.specification || checkJson.data.material_name;
            showToast(`Material ID "${materialId}" sudah terdaftar (${existingSpec}). Tidak boleh duplikasi!`, 'error');
            if (idInput) idInput.style.borderColor = '#dc2626';
            const feedback = document.getElementById('addMaterialIdFeedback');
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.background = '#fef2f2';
                feedback.style.color = '#dc2626';
                feedback.style.border = '1px solid #fecaca';
                feedback.innerHTML = `⚠️ <strong>ID Sudah Terdaftar!</strong> Material ID <code>${escapeHtml(materialId)}</code> sudah ada di master data dengan spesifikasi <strong>"${escapeHtml(existingSpec)}"</strong>. Tidak dapat menambahkan ID yang sama!`;
            }
            if (saveBtn) saveBtn.disabled = true;
            return;
        }
    } catch (err) {
        // Jika cek gagal koneksi, biarkan backend memvalidasi
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Menyimpan...';
    }

    try {
        const response = await fetch('/api/material-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                materialId,
                specification,
                materialName: specification,
                qty,
                unit
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Material berhasil ditambahkan ke data master!', 'success');
            closeAddModal();
            await loadMasterData(currentMasterPage);
        } else {
            showToast(result.error || 'Gagal menambahkan material', 'error');
            if (idInput) idInput.style.borderColor = '#dc2626';
        }
    } catch (error) {
        console.error('Add material error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Simpan Material';
        }
    }
}

// ========== EDIT MATERIAL MANUAL ==========

function openEditModal(materialId, specification, qty = 1, unit = 'PCS') {
    const modal = document.getElementById('editMaterialModal');
    const origInput = document.getElementById('editOriginalId');
    const idInput = document.getElementById('editMaterialId');
    const specInput = document.getElementById('editSpecification');
    const qtyInput = document.getElementById('editQty');
    const unitInput = document.getElementById('editUnit');
    const feedback = document.getElementById('editMaterialIdFeedback');
    const saveBtn = document.getElementById('saveEditBtn');

    if (origInput) origInput.value = materialId;
    if (idInput) {
        idInput.value = materialId;
        idInput.style.borderColor = '';
    }
    if (specInput) specInput.value = specification;
    if (qtyInput) qtyInput.value = (qty !== undefined && qty !== null) ? qty : 1;
    if (unitInput) unitInput.value = unit || 'PCS';

    if (feedback) {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.removeAttribute('title');
    }

    if (modal) {
        modal.style.display = 'flex';
        if (specInput) setTimeout(() => specInput.focus(), 100);
    }
}

function closeEditModal() {
    const modal = document.getElementById('editMaterialModal');
    if (modal) modal.style.display = 'none';
}

async function submitEditMaterial(e) {
    e.preventDefault();

    const origInput = document.getElementById('editOriginalId');
    const idInput = document.getElementById('editMaterialId');
    const specInput = document.getElementById('editSpecification');
    const qtyInput = document.getElementById('editQty');
    const unitInput = document.getElementById('editUnit');
    const saveBtn = document.getElementById('saveEditBtn');

    const originalId = origInput ? origInput.value.trim() : '';
    const rawNewId = idInput ? idInput.value.trim() : '';
    const newMaterialId = _extractMaterialIDFromScan(rawNewId);
    if (idInput && newMaterialId) idInput.value = newMaterialId;

    const specification = specInput ? specInput.value.trim() : '';
    const parsedQty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
    const qty = (!isNaN(parsedQty) && parsedQty > 0) ? parsedQty : 1;
    const unit = (unitInput ? unitInput.value.trim().toUpperCase() : '') || 'PCS';

    if (!newMaterialId) {
        showToast('Material ID wajib diisi', 'warning');
        if (idInput) idInput.focus();
        return;
    }

    if (!specification) {
        showToast('Spesifikasi wajib diisi sebelum menyimpan!', 'warning');
        if (specInput) specInput.focus();
        return;
    }

    // Cek duplikasi jika ID diubah ke ID lain
    if (newMaterialId.toLowerCase() !== originalId.toLowerCase()) {
        try {
            const checkRes = await fetch(`/api/material-catalog/${encodeURIComponent(newMaterialId)}`);
            const checkJson = await checkRes.json();
            if (checkRes.ok && checkJson.success && checkJson.data) {
                const existingSpec = checkJson.data.specification || checkJson.data.material_name;
                showToast(`Material ID "${newMaterialId}" sudah digunakan (${existingSpec}). Tidak dapat menduplikasi!`, 'error');
                if (idInput) idInput.style.borderColor = '#dc2626';
                const feedback = document.getElementById('editMaterialIdFeedback');
                if (feedback) {
                    feedback.style.display = 'block';
                    feedback.style.background = '#fef2f2';
                    feedback.style.color = '#dc2626';
                    feedback.style.border = '1px solid #fecaca';
                    feedback.innerHTML = `⚠️ <strong>ID Sudah Digunakan!</strong> Material ID <code>${escapeHtml(newMaterialId)}</code> sudah terdaftar dengan spesifikasi <strong>"${escapeHtml(existingSpec)}"</strong>.`;
                }
                if (saveBtn) saveBtn.disabled = true;
                return;
            }
        } catch (err) {
            // Biarkan backend memvalidasi
        }
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Menyimpan...';
    }

    try {
        const response = await fetch(`/api/material-catalog/${encodeURIComponent(originalId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                materialId: newMaterialId,
                specification,
                materialName: specification,
                qty,
                unit
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Master material berhasil diperbarui!', 'success');
            closeEditModal();
            await loadMasterData(currentMasterPage);
        } else {
            showToast(result.error || 'Gagal memperbarui master material', 'error');
            if (idInput) idInput.style.borderColor = '#dc2626';
        }
    } catch (error) {
        console.error('Edit material error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Simpan Perubahan';
        }
    }
}

// ========== HAPUS MATERIAL ==========

async function deleteMasterItem(materialId, specification) {
    const confirmed = confirm(`Apakah Anda yakin ingin menghapus master material:\n\nID: ${materialId}\nSpesifikasi: ${specification}\n\nTindakan ini tidak dapat dibatalkan.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/material-catalog/${encodeURIComponent(materialId)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(`Material "${materialId}" berhasil dihapus`, 'success');
            await loadMasterData(currentMasterPage);
        } else {
            showToast(result.error || 'Gagal menghapus material', 'error');
        }
    } catch (error) {
        console.error('Delete material error:', error);
        showToast('Terjadi kesalahan koneksi saat menghapus', 'error');
    }
}

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    const addModal = document.getElementById('addMaterialModal');
    const editModal = document.getElementById('editMaterialModal');

    if (event.target === addModal) {
        closeAddModal();
    }
    if (event.target === editModal) {
        closeEditModal();
    }
});

function escapeSingleQuote(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

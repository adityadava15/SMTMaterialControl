// Master Materials Management Logic (Superadmin Only)

let currentMasterPage = 1;
const MASTER_LIMIT = 20;
let currentMasterSearch = '';

document.addEventListener('DOMContentLoaded', initMasterMaterialsPage);

async function initMasterMaterialsPage() {
    const user = await checkAuth();
    if (!user) return;

    const role = String(user.role || '').trim().toLowerCase();
    if (role !== 'superadmin') {
        showToast('Akses ditolak. Halaman ini khusus Superadmin.', 'error');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
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

    await loadMasterData(1);
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
                    <td colspan="5" style="text-align: center; padding: 24px; color: var(--danger-color);">
                        ${escapeHtml(result.error || 'Gagal memuat master data material')}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Load master data error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 24px; color: var(--danger-color);">
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
                <td colspan="5" style="text-align: center; padding: 36px; color: var(--light-text);">
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
        const escapedName = escapeHtml(item.material_name);
        const singleQuoteId = escapeSingleQuote(item.material_id);
        const singleQuoteName = escapeSingleQuote(item.material_name);

        return `
            <tr>
                <td style="color: var(--light-text); font-size: 13px;">${startIndex + index + 1}</td>
                <td>
                    <span class="material-id-cell">${escapedId}</span>
                </td>
                <td style="font-weight: 500; color: var(--dark-text);">
                    ${escapedName}
                </td>
                <td style="font-size: 13px; color: var(--light-text); white-space: nowrap;">
                    ⏱️ ${formatDateTime(item.updated_at || item.created_at)}
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button 
                        type="button" 
                        class="btn btn-secondary btn-sm" 
                        style="padding: 4px 10px; font-size: 12px; margin-right: 4px;"
                        onclick="openEditModal('${singleQuoteId}', '${singleQuoteName}')"
                        title="Edit material ini"
                    >
                        ✏️ Edit
                    </button>
                    <button 
                        type="button" 
                        class="btn btn-danger btn-sm" 
                        style="padding: 4px 10px; font-size: 12px;"
                        onclick="deleteMasterItem('${singleQuoteId}', '${singleQuoteName}')"
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

function openAddModal() {
    const modal = document.getElementById('addMaterialModal');
    const form = document.getElementById('addMaterialForm');
    if (form) form.reset();
    if (modal) {
        modal.style.display = 'flex';
        const idInput = document.getElementById('addMaterialId');
        if (idInput) setTimeout(() => idInput.focus(), 100);
    }
}

function closeAddModal() {
    const modal = document.getElementById('addMaterialModal');
    if (modal) modal.style.display = 'none';
}

async function submitAddMaterial(e) {
    e.preventDefault();

    const idInput = document.getElementById('addMaterialId');
    const nameInput = document.getElementById('addMaterialName');
    const saveBtn = document.getElementById('saveAddBtn');

    const materialId = idInput ? idInput.value.trim() : '';
    const materialName = nameInput ? nameInput.value.trim() : '';

    if (!materialId || !materialName) {
        showToast('Material ID dan Nama Material wajib diisi', 'warning');
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Menyimpan...';
    }

    try {
        const response = await fetch('/api/material-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ materialId, materialName })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Material berhasil ditambahkan ke data master!', 'success');
            closeAddModal();
            await loadMasterData(currentMasterPage);
        } else {
            showToast(result.error || 'Gagal menambahkan material', 'error');
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

function openEditModal(materialId, materialName) {
    const modal = document.getElementById('editMaterialModal');
    const origInput = document.getElementById('editOriginalId');
    const idInput = document.getElementById('editMaterialId');
    const nameInput = document.getElementById('editMaterialName');

    if (origInput) origInput.value = materialId;
    if (idInput) idInput.value = materialId;
    if (nameInput) nameInput.value = materialName;

    if (modal) {
        modal.style.display = 'flex';
        if (nameInput) setTimeout(() => nameInput.focus(), 100);
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
    const nameInput = document.getElementById('editMaterialName');
    const saveBtn = document.getElementById('saveEditBtn');

    const originalId = origInput ? origInput.value.trim() : '';
    const newMaterialId = idInput ? idInput.value.trim() : '';
    const materialName = nameInput ? nameInput.value.trim() : '';

    if (!newMaterialId || !materialName) {
        showToast('Material ID dan Nama Material tidak boleh kosong', 'warning');
        return;
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
                materialName
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Master material berhasil diperbarui!', 'success');
            closeEditModal();
            await loadMasterData(currentMasterPage);
        } else {
            showToast(result.error || 'Gagal memperbarui master material', 'error');
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

async function deleteMasterItem(materialId, materialName) {
    const confirmed = confirm(`Apakah Anda yakin ingin menghapus master material:\n\nID: ${materialId}\nNama: ${materialName}\n\nTindakan ini tidak dapat dibatalkan.`);
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

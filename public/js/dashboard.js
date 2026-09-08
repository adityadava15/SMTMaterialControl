// Dashboard Logic
let currentPage = 1;
const limit = 10;
let currentUser = null;
let isSuperAdmin = false;

initDashboard();

// Search on Enter key
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            loadMaterials();
        }
    });
}

async function initDashboard() {
    const user = await checkAuth();
    if (!user) return;

    currentUser = user;
    isSuperAdmin = currentUser.role === 'superadmin';
    toggleActionColumn();

    await Promise.all([
        loadDashboardStats(),
        loadMaterials()
    ]);
}

function toggleActionColumn() {
    const actionHeader = document.getElementById('actionHeader');
    if (actionHeader) {
        actionHeader.style.display = isSuperAdmin ? '' : 'none';
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalMaterials').textContent = formatNumber(data.stats.totalMaterials);
            document.getElementById('totalQuantity').textContent = formatNumber(data.stats.totalQuantity);
            document.getElementById('inputToday').textContent = formatNumber(data.stats.inputToday);
            document.getElementById('outputToday').textContent = formatNumber(data.stats.outputToday);
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Load materials table
async function loadMaterials() {
    const search = document.getElementById('searchInput').value.trim();

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: limit,
            search: search
        });

        const response = await fetch(`/api/materials?${params}`);
        const data = await response.json();

        if (data.success) {
            displayMaterials(data.data);
            displayPagination(data.pagination);
        } else {
            showToast('Gagal memuat data material', 'error');
        }
    } catch (error) {
        console.error('Error loading materials:', error);
        showToast('Error memuat data', 'error');
    }
}

function displayMaterials(materials) {
    const tbody = document.getElementById('materialTableBody');
    const colspan = isSuperAdmin ? 5 : 4;

    if (materials.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" style="text-align: center; padding: 40px; color: var(--light-text);">
                    Tidak ada data material
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = materials.map(material => `
        <tr>
            <td style="font-family: 'Courier New', monospace; font-weight: bold; color: var(--primary-color);">
                ${material.id}
            </td>
            <td>${material.name}</td>
            <td><strong>${formatNumber(material.quantity)}</strong> pcs</td>
            <td>${formatDateTime(material.updated_at)}</td>
            ${isSuperAdmin ? `
                <td>
                    <button
                        class="btn btn-danger btn-sm delete-material-btn"
                        type="button"
                        data-material-id="${material.id}"
                    >
                        Delete
                    </button>
                </td>
            ` : ''}
        </tr>
    `).join('');

    if (isSuperAdmin) {
        tbody.querySelectorAll('.delete-material-btn').forEach((button) => {
            button.addEventListener('click', () => {
                deleteMaterial(button.dataset.materialId);
            });
        });
    }
}

async function deleteMaterial(materialId) {
    if (!isSuperAdmin) {
        showToast('Akses ditolak', 'error');
        return;
    }

    const confirmed = confirm(`Hapus material "${materialId}" dari inventory?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/materials/${encodeURIComponent(materialId)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Material berhasil dihapus', 'success');
            await Promise.all([
                loadDashboardStats(),
                loadMaterials()
            ]);
        } else {
            showToast(data.error || 'Gagal menghapus material', 'error');
        }
    } catch (error) {
        console.error('Error deleting material:', error);
        showToast('Error saat menghapus material', 'error');
    }
}

function displayPagination(pagination) {
    const container = document.getElementById('pagination');
    const { page, totalPages } = pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    if (page > 1) {
        html += `<button class="page-btn" onclick="changePage(${page - 1})">&larr; Prev</button>`;
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += `<span>...</span>`;
        }
    }

    // Next button
    if (page < totalPages) {
        html += `<button class="page-btn" onclick="changePage(${page + 1})">Next &rarr;</button>`;
    }

    container.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    loadMaterials();
}

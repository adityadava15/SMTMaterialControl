// Profile Page Logic

// Check authentication
checkAuth();

// Elements
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const updateProfileBtn = document.getElementById('updateProfileBtn');
const userManagementCard = document.getElementById('userManagementCard');
const userListContainer = document.getElementById('userListBody');
const addUserForm = document.getElementById('addUserForm');
const operatorListBody = document.getElementById('operatorListBody');
const addOperatorForm = document.getElementById('addOperatorForm');
const addOperatorBtn = document.getElementById('addOperatorBtn');
const newOperatorNameInput = document.getElementById('newOperatorName');

const catalogUploadForm = document.getElementById('catalogUploadForm');
const catalogFileInput = document.getElementById('catalogFileInput');
const uploadCatalogBtn = document.getElementById('uploadCatalogBtn');
const catalogSearchInput = document.getElementById('catalogSearchInput');
const materialCatalogBody = document.getElementById('materialCatalogBody');
const materialCatalogPagination = document.getElementById('materialCatalogPagination');

let currentCatalogPage = 1;
const catalogLimit = 20;

// Load Profile Data
async function loadProfile() {
    try {
        const response = await fetch('/api/users/profile');
        const data = await response.json();

        if (response.ok && data.success) {
            const user = data.data;

            // Update Form
            usernameInput.value = user.username;

            // Update Header
            document.getElementById('headerUsername').textContent = user.username;
            document.getElementById('headerRole').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

            // Show User Management if Superadmin
            if (user.role === 'superadmin') {
                userManagementCard.style.display = 'block';
                loadAllUsers();
                loadOperatorMaster();
            }
        } else {
            showToast('Gagal memuat profil', 'error');
        }
    } catch (error) {
        console.error('Load profile error:', error);
        showToast('Terjadi kesalahan saat memuat profil', 'error');
    }
}

// Update Profile
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!username) {
        showToast('Username tidak boleh kosong', 'warning');
        return;
    }

    updateProfileBtn.disabled = true;
    updateProfileBtn.textContent = 'Updating...';

    try {
        const response = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Profil berhasil diperbarui', 'success');
            passwordInput.value = '';

            const newUsername = usernameInput.value;
            const welcomeText = document.getElementById('welcomeText');
            const headerUsername = document.getElementById('headerUsername');

            if (welcomeText) welcomeText.textContent = `Halo, ${newUsername}`;
            if (headerUsername) headerUsername.textContent = newUsername;
        } else {
            showToast(data.error || 'Gagal memperbarui profil', 'error');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        updateProfileBtn.disabled = false;
        updateProfileBtn.textContent = 'Update Profile';
    }
});

// Load All Users (Superadmin)
async function loadAllUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (response.ok && data.success) {
            renderUserList(data.data);
        } else {
            userListContainer.innerHTML = '<p class="text-error">Gagal memuat daftar user</p>';
        }
    } catch (error) {
        console.error('Load users error:', error);
        userListContainer.innerHTML = '<p class="text-error">Terjadi kesalahan koneksi</p>';
    }
}

async function loadOperatorMaster() {
    if (!operatorListBody) {
        return;
    }

    try {
        const response = await fetch('/api/users/operators');
        const data = await response.json();

        if (response.ok && data.success) {
            renderOperatorList(data.data);
        } else {
            operatorListBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--danger-color);">Gagal memuat daftar operator</td></tr>';
        }
    } catch (error) {
        console.error('Load operators error:', error);
        operatorListBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--danger-color);">Terjadi kesalahan koneksi</td></tr>';
    }
}

function renderOperatorList(operators) {
    if (!operatorListBody) {
        return;
    }

    if (!operators || operators.length === 0) {
        operatorListBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Belum ada operator.</td></tr>';
        return;
    }

    operatorListBody.innerHTML = operators.map((operator) => `
        <tr>
            <td>${escapeHtml(operator.name)}</td>
            <td style="color: var(--light-text); font-size: 13px;">${formatDateTime(operator.created_at)}</td>
            <td style="text-align: right;">
                <button class="btn btn-danger btn-sm" onclick="deleteOperator(${operator.id}, '${escapeSingleQuote(operator.name)}')" style="padding: 4px 8px; font-size: 12px;">
                    \u{1F5D1}\uFE0F Delete
                </button>
            </td>
        </tr>
    `).join('');
}

// Render User List
function renderUserList(users) {
    if (users.length === 0) {
        userListContainer.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Tidak ada user lain.</td></tr>';
        return;
    }

    userListContainer.innerHTML = users.map((user) => {
        const hasPlainPassword = Boolean(user.password);
        const passwordDisplay = hasPlainPassword
            ? hidePassword(user.password)
            : '<span style="color: #d97706; font-size: 11px; font-style: italic;">(Hash lama - klik reset)</span>';

        return `
        <tr>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-small">${user.username.substring(0, 2).toUpperCase()}</div>
                    <span style="font-weight: 500;">${escapeHtml(user.username)}</span>
                </div>
            </td>
            <td>
                <span class="role-badge role-${user.role}">${escapeHtml(user.role)}</span>
            </td>
            <td>
                <div class="password-cell">
                    <span id="passwordText-${user.id}" class="password-text" data-visible="false" data-password="${escapeHtml(user.password || '')}">
                        ${passwordDisplay}
                    </span>
                    ${hasPlainPassword ? `
                    <button
                        type="button"
                        class="password-eye-btn"
                        onclick="toggleUserPassword(${user.id})"
                        title="Tampilkan/Sembunyikan Password"
                        aria-label="Toggle password visibility"
                    >
                        ${getEyeIcon(false)}
                    </button>` : ''}
                </div>
            </td>
            <td style="color: var(--light-text); font-size: 13px;">
                ${new Date(user.created_at).toLocaleDateString()}
            </td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="btn btn-secondary btn-sm" onclick="changeUserPassword(${user.id}, '${escapeSingleQuote(user.username)}')" style="padding: 4px 8px; font-size: 12px; margin-right: 4px;" title="Ubah Password User">
                    🔑 Reset
                </button>
                ${user.username !== usernameInput.value ? `
                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id}, '${escapeSingleQuote(user.username)}')" style="padding: 4px 8px; font-size: 12px;">
                        🗑️ Delete
                    </button>
                ` : '<span style="font-size: 12px; color: #9ca3af; font-style: italic;">(You)</span>'}
            </td>
        </tr>
    `;
    }).join('');
}

function hidePassword(plainPassword) {
    if (!plainPassword) {
        return '-';
    }

    return '•'.repeat(plainPassword.length);
}

function toggleUserPassword(userId) {
    const passwordText = document.getElementById(`passwordText-${userId}`);
    if (!passwordText) return;

    const plainPassword = passwordText.dataset.password || '';
    const currentlyVisible = passwordText.dataset.visible === 'true';
    const nextVisible = !currentlyVisible;

    if (currentlyVisible) {
        passwordText.textContent = hidePassword(plainPassword);
        passwordText.dataset.visible = 'false';
    } else {
        passwordText.textContent = plainPassword || '-';
        passwordText.dataset.visible = 'true';
    }

    const button = passwordText.nextElementSibling;
    if (button) {
        button.innerHTML = getEyeIcon(nextVisible);
    }
}

async function changeUserPassword(userId, username) {
    const newPassword = prompt(`Masukkan password baru untuk user "${username}":`);
    if (newPassword === null) {
        return;
    }

    const trimmedPassword = newPassword.trim();
    if (!trimmedPassword) {
        showToast('Password tidak boleh kosong', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: trimmedPassword })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(data.message || `Password user "${username}" berhasil diperbarui`, 'success');
            loadAllUsers();
        } else {
            showToast(data.error || 'Gagal memperbarui password user', 'error');
        }
    } catch (error) {
        console.error('Change user password error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

function getEyeIcon(visible) {
    if (visible) {
        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 2-3.84 3.58-5.2"></path>
                <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.83 11.83 0 0 1-1.67 3.12"></path>
                <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>
    `;
}

// Add New User
if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('newUsername').value;
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newRole').value;

        if (!username || !password || !role) {
            showToast('Semua field harus diisi', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, role })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`User ${username} berhasil dibuat!`, 'success');
                addUserForm.reset();
                loadAllUsers();
            } else {
                showToast(data.error || 'Gagal membuat user', 'error');
            }
        } catch (error) {
            console.error('Add user error:', error);
            showToast('Terjadi kesalahan koneksi', 'error');
        }
    });
}

if (addOperatorForm) {
    addOperatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const operatorName = (newOperatorNameInput ? newOperatorNameInput.value : '')
            .trim()
            .replace(/\s+/g, ' ');

        if (!operatorName) {
            showToast('Nama operator tidak boleh kosong', 'warning');
            return;
        }

        if (operatorName.length > 100) {
            showToast('Nama operator maksimal 100 karakter', 'warning');
            return;
        }

        if (addOperatorBtn) {
            addOperatorBtn.disabled = true;
            addOperatorBtn.textContent = 'Adding...';
        }

        try {
            const response = await fetch('/api/users/operators', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: operatorName })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`Operator ${operatorName} berhasil ditambahkan`, 'success');
                addOperatorForm.reset();
                loadOperatorMaster();
            } else {
                showToast(data.error || 'Gagal menambahkan operator', 'error');
            }
        } catch (error) {
            console.error('Add operator error:', error);
            showToast('Terjadi kesalahan koneksi', 'error');
        } finally {
            if (addOperatorBtn) {
                addOperatorBtn.disabled = false;
                addOperatorBtn.textContent = 'Tambah Operator';
            }
        }
    });
}

// Delete User
async function deleteUser(id, username) {
    if (!confirm(`Apakah Anda yakin ingin menghapus user "${username}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/users/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(`User ${username} berhasil dihapus`, 'success');
            loadAllUsers();
        } else {
            showToast(data.error || 'Gagal menghapus user', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

async function deleteOperator(id, operatorName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus operator "${operatorName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/users/operators/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast(`Operator ${operatorName} berhasil dihapus`, 'success');
            loadOperatorMaster();
        } else {
            showToast(data.error || 'Gagal menghapus operator', 'error');
        }
    } catch (error) {
        console.error('Delete operator error:', error);
        showToast('Terjadi kesalahan koneksi', 'error');
    }
}

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

// Initial Load
document.addEventListener('DOMContentLoaded', loadProfile);

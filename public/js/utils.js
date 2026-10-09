// Utility Functions

// Toast notification
function showToast(message, type = 'success', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Content container
    const content = document.createElement('div');
    content.className = 'toast-content';
    content.textContent = message;

    // Close button ('x')
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Tutup');
    closeBtn.title = 'Tutup notifikasi';

    let dismissTimer = null;

    const closeToast = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 200);
    };

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeToast();
    });

    toast.appendChild(content);
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);

    if (duration > 0) {
        dismissTimer = setTimeout(closeToast, duration);
    }
}

// Toggle Sidebar (Desktop collapsible & Mobile drawer)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('mobileBackdrop');
    if (!sidebar) return;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        if (sidebar.classList.contains('hidden')) {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-72', 'shadow-2xl');
            if (backdrop) backdrop.classList.remove('hidden');
        } else {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('fixed', 'inset-y-0', 'left-0', 'z-50', 'w-72', 'shadow-2xl');
            if (backdrop) backdrop.classList.add('hidden');
        }
    } else {
        sidebar.classList.toggle('hidden');
    }
}

// Logout
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });

        if (response.ok) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login.html';
    }
}

// Check Authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login.html';
            return null;
        }

        const normalizedRole = String((data.user && data.user.role) || '').trim().toLowerCase();

        // Update UI with user info
        const welcomeText = document.getElementById('welcomeText');
        const userRole = document.getElementById('userRole');
        const userAvatar = document.getElementById('userAvatar');
        const dropdownUserName = document.getElementById('dropdownUserName');
        const dropdownUserRole = document.getElementById('dropdownUserRole');

        if (welcomeText) {
            welcomeText.textContent = data.user.username;
        }

        if (userAvatar && data.user.username) {
            userAvatar.textContent = data.user.username.charAt(0).toUpperCase();
        }

        if (dropdownUserName) {
            dropdownUserName.textContent = data.user.username;
        }

        if (userRole) {
            if (normalizedRole === 'superadmin') {
                userRole.textContent = 'SUPERADMIN';
            } else if (normalizedRole === 'admin') {
                userRole.textContent = 'ADMIN';
            } else {
                userRole.textContent = 'USER';
            }
        }

        if (dropdownUserRole) {
            dropdownUserRole.textContent = `Role: ${data.user.role}`;
        }

        // Master data links & pages protection (All authenticated users)
        const canAccessMasterData = true;
        const superadminElements = document.querySelectorAll('.superadmin-nav-item, .superadmin-only');
        if (canAccessMasterData) {
            superadminElements.forEach(el => {
                el.style.removeProperty('display');
                el.classList.remove('hidden');
            });
        }

        if (window.lucide) {
            lucide.createIcons();
        }

        return data.user;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
        return null;
    }
}

// Format number with comma separator
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Format date time
function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleString('id-ID', options);
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Scanner input handler - auto submit on Enter
function setupScannerInput(inputElement, onScanCallback) {
    inputElement.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onScanCallback(inputElement.value.trim());
            inputElement.value = '';
        }
    });
}

// User Dropdown Logic
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdownContent');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// Close dropdown when clicking outside
window.addEventListener('click', function (event) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdownContent');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (userMenuBtn && !userMenuBtn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    }
});

// Sidebar Dropdown Navigation Logic
function toggleNavDropdown(id) {
    const dropdown = document.getElementById(id);
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

function toggleSidebarMasterDropdown() {
    const submenu = document.getElementById('navMasterSubmenu');
    const arrow = document.getElementById('navMasterArrow');
    if (!submenu) return;

    if (submenu.classList.contains('hidden')) {
        submenu.classList.remove('hidden');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        submenu.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

// Automatically expand and set active state for sidebar dropdown on page load
document.addEventListener('DOMContentLoaded', () => {
    // Automatically verify session and populate top-right user profile
    checkAuth();

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');

    const outputDropdown = document.getElementById('navOutputDropdown');
    const navSubOutputStok = document.getElementById('navSubOutputStok');
    const navSubOutputMesin = document.getElementById('navSubOutputMesin');
    const navOutputToggle = document.getElementById('navOutputToggle');

    if (path.includes('material-output-machine')) {
        if (outputDropdown) outputDropdown.classList.add('open');
        if (navOutputToggle) navOutputToggle.classList.add('active');
        if (navSubOutputMesin) navSubOutputMesin.classList.add('active');
    } else if (path.includes('material-output')) {
        if (outputDropdown) outputDropdown.classList.add('open');
        if (navOutputToggle) navOutputToggle.classList.add('active');
        if (navSubOutputStok) navSubOutputStok.classList.add('active');
    } else if (path.includes('master-materials')) {
        const navMaster = document.getElementById('navMasterMaterials');
        if (navMaster) navMaster.classList.add('active');

        const navMasterSubmenu = document.getElementById('navMasterSubmenu');
        const navMasterArrow = document.getElementById('navMasterArrow');
        const navSubMaster = document.getElementById('navSubMaster');
        const navSubMeterQuantity = document.getElementById('navSubMeterQuantity');
        const navMasterToggle = document.getElementById('navMasterToggle');

        if (navMasterSubmenu) navMasterSubmenu.classList.remove('hidden');
        if (navMasterArrow) navMasterArrow.style.transform = 'rotate(180deg)';
        if (navMasterToggle) {
            navMasterToggle.classList.remove('text-slate-300');
            navMasterToggle.classList.add('text-white', 'bg-[#142563]', 'shadow-sm');
        }

        if (category === 'meter_quantity') {
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
    }
});

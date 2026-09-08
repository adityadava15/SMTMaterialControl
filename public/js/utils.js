// Utility Functions

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Toggle Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');

    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
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

        if (welcomeText) {
            welcomeText.textContent = `Halo, ${data.user.username}`;
        }

        if (userRole) {
            if (normalizedRole === 'superadmin') {
                userRole.textContent = 'Superadmin';
            } else if (normalizedRole === 'admin') {
                userRole.textContent = 'Admin';
            } else {
                userRole.textContent = 'User';
            }
        }

        // Superadmin-only links & pages protection
        const superadminElements = document.querySelectorAll('.superadmin-nav-item, .superadmin-only');
        if (normalizedRole === 'superadmin') {
            superadminElements.forEach(el => {
                el.style.display = '';
            });
        } else {
            superadminElements.forEach(el => {
                el.style.display = 'none';
            });

            // Redirect non-superadmin if trying to access master-materials
            const path = window.location.pathname;
            if (path.includes('master-materials')) {
                window.location.href = '/dashboard.html';
                return null;
            }
        }

        // Restrict access for all non-superadmin
        if (normalizedRole !== 'superadmin') {
            // Hide Material Input links in Sidebar
            const inputLinks = document.querySelectorAll('a[href*="material-input"]');
            inputLinks.forEach(link => {
                link.style.display = 'none';
            });

            // Redirect if trying to access Input pages
            const path = window.location.pathname;
            if (path.includes('material-input')) {
                window.location.href = '/material-output.html';
                return null;
            }
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
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Format date time
function formatDateTime(dateString) {
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
        dropdown.classList.toggle('show-dropdown');
    }
}

// Close dropdown when clicking outside
window.onclick = function (event) {
    if (!event.target.matches('.user-info') && !event.target.closest('.user-info')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show-dropdown')) {
                openDropdown.classList.remove('show-dropdown');
            }
        }
    }
};

// Sidebar Dropdown Navigation Logic
function toggleNavDropdown(id) {
    const dropdown = document.getElementById(id);
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

// Automatically expand and set active state for sidebar dropdown on page load
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
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
    }
});

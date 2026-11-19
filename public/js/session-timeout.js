// Session Timeout & Activity Tracker
// Auto-logout after 15 minutes of inactivity

const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const WARNING_TIME = 2 * 60 * 1000; // Show warning 2 minutes before timeout

let lastActivityTime = Date.now();
let sessionCheckInterval;
let warningShown = false;

// Track user activity
function resetActivityTimer() {
    lastActivityTime = Date.now();
    warningShown = false;

    // Remove warning if exists
    const existingWarning = document.getElementById('sessionWarning');
    if (existingWarning) {
        existingWarning.remove();
    }
}

// Keep session alive explicitly (pings server to refresh rolling session cookie)
async function keepSessionAlive() {
    resetActivityTimer();
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        if (!data.authenticated) {
            clearInterval(sessionCheckInterval);
            alert('Session telah berakhir. Silakan login kembali.');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Keep session alive error:', error);
    }
}

// Events that count as user activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

activityEvents.forEach(event => {
    document.addEventListener(event, resetActivityTimer, true);
});

// Show warning before auto-logout
function showSessionWarning() {
    if (warningShown) return;
    warningShown = true;

    const warning = document.createElement('div');
    warning.id = 'sessionWarning';
    warning.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f59e0b;
        color: white;
        padding: 14px 22px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        z-index: 10000;
        font-weight: 600;
        animation: slideDown 0.3s ease-out;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    warning.innerHTML = `
        <span style="font-size: 1.25rem;">⚠️</span>
        <span>Session akan berakhir dalam 2 menit karena tidak ada aktivitas.</span>
        <button onclick="keepSessionAlive()" style="margin-left: 12px; padding: 6px 14px; background: white; color: #b45309; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
            Tetap Login
        </button>
    `;

    document.body.appendChild(warning);
}

// Check session validity
async function checkSession() {
    const inactiveTime = Date.now() - lastActivityTime;

    // Show warning 2 minutes before timeout
    if (inactiveTime >= SESSION_TIMEOUT - WARNING_TIME && !warningShown) {
        showSessionWarning();
    }

    // Auto-logout if inactive for 15 minutes
    if (inactiveTime >= SESSION_TIMEOUT) {
        clearInterval(sessionCheckInterval);

        // Logout
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Show message and redirect
        alert('Session telah berakhir karena tidak ada aktivitas selama 15 menit. Silakan login kembali.');
        window.location.href = '/login.html';
        return;
    }

    // Only ping /api/auth/check if the user is active (< 13 min idle),
    // to avoid rolling the server-side session indefinitely while the user is idle in the warning window
    if (inactiveTime < SESSION_TIMEOUT - WARNING_TIME) {
        try {
            const response = await fetch('/api/auth/check');
            const data = await response.json();

            if (!data.authenticated) {
                clearInterval(sessionCheckInterval);
                alert('Session telah berakhir. Silakan login kembali.');
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
    }
}

// Start session monitoring
function startSessionMonitoring() {
    // Initial activity timestamp
    resetActivityTimer();

    // Check session periodically
    sessionCheckInterval = setInterval(checkSession, CHECK_INTERVAL);

    // Check when page becomes visible again (user returns to tab)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkSession();
        }
    });
}

// Initialize on page load
if (window.location.pathname !== '/login.html') {
    startSessionMonitoring();
}

// Make functions available globally
window.resetActivityTimer = resetActivityTimer;
window.keepSessionAlive = keepSessionAlive;

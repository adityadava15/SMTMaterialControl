// Authentication Logic

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    checkExistingSession();

    // Handle login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Toggle password visibility
    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    if (togglePasswordBtn && passwordInput) {
        const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
        const eyeOffIcon = togglePasswordBtn.querySelector('.eye-off-icon');

        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            
            if (isPassword) {
                eyeIcon.style.display = 'none';
                eyeOffIcon.style.display = 'block';
                togglePasswordBtn.setAttribute('aria-label', 'Sembunyikan password');
            } else {
                eyeIcon.style.display = 'block';
                eyeOffIcon.style.display = 'none';
                togglePasswordBtn.setAttribute('aria-label', 'Tampilkan password');
            }
        });
    }
});

async function checkExistingSession() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (data.authenticated) {
            // Redirect to dashboard if already logged in
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.querySelector('button[type="submit"]');

    // Hide previous errors
    errorMessage.style.display = 'none';

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Login successful
            showSuccessMessage('Login berhasil! Redirect...');
            const normalizedRole = String((data.user && data.user.role) || '').trim().toLowerCase();

            setTimeout(() => {
                if (normalizedRole === 'superadmin') {
                    window.location.href = '/dashboard.html';
                } else if (normalizedRole === 'admin') {
                    window.location.href = '/material-output.html';
                } else {
                    window.location.href = '/dashboard.html';
                }
            }, 500);
        } else {
            // Login failed
            showError(data.error || 'Login gagal. Periksa username dan password.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Masuk';
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Terjadi kesalahan. Silakan coba lagi.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function showSuccessMessage(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.className = 'alert alert-success';
    errorMessage.style.display = 'block';
}

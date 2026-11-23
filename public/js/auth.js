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
                if (eyeIcon) eyeIcon.style.display = 'none';
                if (eyeOffIcon) eyeOffIcon.style.display = 'block';
                togglePasswordBtn.setAttribute('aria-label', 'Sembunyikan password');
            } else {
                if (eyeIcon) eyeIcon.style.display = 'block';
                if (eyeOffIcon) eyeOffIcon.style.display = 'none';
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
    const defaultBtnText = submitBtn ? submitBtn.textContent : 'SIGN IN';

    // Hide previous errors
    errorMessage.style.display = 'none';
    if (errorMessage.classList.contains('form-feedback')) {
        errorMessage.className = 'form-feedback';
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'SIGNING IN...';

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

            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        } else {
            // Login failed
            showError(data.error || 'Login gagal. Periksa username dan password.');
            submitBtn.disabled = false;
            submitBtn.textContent = defaultBtnText;
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Terjadi kesalahan. Silakan coba lagi.');
        submitBtn.disabled = false;
        submitBtn.textContent = defaultBtnText;
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    if (errorMessage.classList.contains('form-feedback')) {
        errorMessage.className = 'form-feedback';
    } else {
        errorMessage.className = 'alert alert-error';
    }
    errorMessage.style.display = 'block';
}

function showSuccessMessage(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    if (errorMessage.classList.contains('form-feedback')) {
        errorMessage.className = 'form-feedback is-info';
    } else {
        errorMessage.className = 'alert alert-success';
    }
    errorMessage.style.display = 'block';
}

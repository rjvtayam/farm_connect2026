/**
 * Farm Connect - Authentication Module
 * Handles login form validation, AJAX submission, role-based redirect,
 * municipality dropdown, and password toggles.
 */

document.addEventListener('DOMContentLoaded', function () {
    initializeAuth();
});

function initializeAuth() {
    // Initialize password toggles
    initializePasswordToggles();

    // Initialize role & municipality dropdowns
    initializeDropdowns();

    // Initialize login form (AJAX-based)
    initializeLoginForm();

    // Initialize 2FA page features (countdown, OTP digits, resend)
    initialize2FA();

    // Restore saved username for returning (trusted) users
    initRememberMe();

    // Attach overlays for forgot-password and reset-password forms
    initAuthFormOverlays();
}

// ============================================================
// LOGIN FORM - AJAX Submission with Role-Based Redirect
// ============================================================
function initializeLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const roleInput = document.getElementById('roleInput');
    const municipalityInput = document.getElementById('municipalityInput');

    // Store original button content
    if (submitBtn) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
    }

    // Real-time input validation
    const inputs = form.querySelectorAll('input[required], input[type="email"]');
    inputs.forEach(input => {
        input.addEventListener('input', () => validateInput(input));
        input.addEventListener('blur', () => validateInput(input));
    });

    // Form submission via AJAX
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // 1. Validate required fields
        let isValid = true;
        inputs.forEach(input => {
            if (!validateInput(input)) {
                isValid = false;
            }
        });

        if (!isValid) {
            showError('Please fill in all required fields correctly.');
            return;
        }

        // 2. Validate municipality is selected
        if (!municipalityInput.value) {
            showError('Please select a municipality before logging in.');
            // Highlight the municipality dropdown
            const muniDropdown = document.getElementById('municipalityDropdown');
            if (muniDropdown) {
                muniDropdown.classList.add('dropdown-error');
                setTimeout(() => muniDropdown.classList.remove('dropdown-error'), 3000);
            }
            return;
        }

        // 3. Role-specific data for SweetAlert2 popups
        const currentRole = roleInput ? roleInput.value : 'admin';
        const rolePopupData = {
            'admin': { icon: 'fa-user-shield', title: 'Admin System Access', color: '#6366f1' },
            'mao': { icon: 'fa-building', title: 'MAO Portal Access', color: '#0ea5e9' },
            'encoder': { icon: 'fa-keyboard', title: 'Encoder Portal Access', color: '#10b981' },
            'verifier': { icon: 'fa-user-check', title: 'Verifier Portal Access', color: '#f59e0b' }
        };
        const roleData = rolePopupData[currentRole] || rolePopupData['admin'];

        // Disable button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('btn-loading');
        }

        // Show SweetAlert2 loading popup — renders instantly
        Swal.fire({
            title: `Logging in as ${currentRole.toUpperCase()}`,
            html: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
                     <i class="fas ${roleData.icon}" style="font-size:2rem;color:${roleData.color};"></i>
                     <span style="color:#64748b;">Verifying your credentials...</span>
                   </div>`,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            background: '#ffffff',
            color: '#1e293b',
            customClass: { popup: 'premium-white-popup' },
            didOpen: () => { Swal.showLoading(); }
        });

        // 4. Submit via AJAX
        try {
            const formData = new FormData(form);

            const response = await fetch('/auth/api/login', {
                method: 'POST',
                body: formData,
                credentials: 'include',
                headers: { 'X-CSRFToken': formData.get('csrf_token') }
            });

            const data = await response.json();

            if (data.success) {
                // ── Handle Remember Me ──
                const rememberBox = form.querySelector('input[name="remember"]');
                const usernameField = form.querySelector('input[name="username"]');
                const curRole = roleInput ? roleInput.value : 'admin';
                if (rememberBox && rememberBox.checked && usernameField) {
                    localStorage.setItem(`fc_saved_${curRole}`, usernameField.value.trim());
                } else if (rememberBox && !rememberBox.checked) {
                    localStorage.removeItem(`fc_saved_${curRole}`);
                }

                // ── Determine greeting content ──
                let greetIcon, greetTitle, greetText;

                if (data.skip_2fa) {
                    if (data.is_trusted) {
                        greetIcon = 'fa-hand-peace';
                        greetTitle = 'Welcome back!';
                        greetText = 'Trusted device recognized. Redirecting...';
                    } else {
                        greetIcon = 'fa-rocket';
                        greetTitle = 'Welcome to Farm Connect!';
                        greetText = 'Account verified. Accessing your portal...';
                    }
                } else {
                    greetIcon = 'fa-shield-alt';
                    greetTitle = 'Security Check';
                    greetText = data.message || 'Redirecting to 2FA...';
                }

                // ── Show success popup bridging as a true loading screen ──
                Swal.fire({
                    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
                             <i class="fas ${greetIcon}" style="font-size:2.5rem;color:${roleData.color};"></i>
                             <h2 style="margin:0;font-size:1.4rem;font-weight:700;">${greetTitle}</h2>
                             <span style="color:#64748b;font-size:0.95rem;">${greetText}</span>
                           </div>`,
                    showConfirmButton: false,
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    timer: 10000, 
                    background: '#ffffff',
                    color: '#1e293b',
                    customClass: { popup: 'premium-white-popup' }
                });
                
                // Immediately navigate — the popup persists exactly until the browser loads the next page
                window.location.href = data.redirect;
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Login Failed',
                    text: data.message || 'Invalid credentials.',
                    confirmButtonText: 'Try Again',
                    background: '#ffffff',
                    color: '#1e293b',
                    confirmButtonColor: roleData.color,
                    customClass: { popup: 'premium-white-popup' }
                });
                resetButton(submitBtn);
            }
        } catch (error) {
            console.error('Login failed:', error);
            Swal.fire({
                icon: 'error',
                title: 'Connection Error',
                text: 'Could not reach the server. Please try again.',
                confirmButtonText: 'OK',
                background: '#ffffff',
                color: '#1e293b',
                confirmButtonColor: '#ef4444',
                customClass: { popup: 'premium-white-popup' }
            });
            resetButton(submitBtn);
        }
    });
}

function resetButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('btn-loading', 'btn-success-state');
    btn.innerHTML = btn.dataset.originalText || 'Log In';
}

// ============================================================
// REMEMBER ME — Restore saved username on page load
// ============================================================
function initRememberMe() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const roleInput = document.getElementById('roleInput');
    const usernameInput = form.querySelector('input[name="username"]');
    const rememberBox = form.querySelector('input[name="remember"]');
    const agreeBox = form.querySelector('input[name="agree_terms"]');
    const emailGroup = form.querySelector('input[name="email"]');

    // ── Helper: get saved username for a specific role ──
    function getSavedUser(role) {
        return localStorage.getItem(`fc_saved_${role}`) || '';
    }

    // ── Helper: apply trusted-device mode or full-form mode ──
    function applyTrustedMode(isTrusted) {
        // Remember-me checkbox
        if (rememberBox) {
            if (isTrusted) {
                rememberBox.checked = true;
            }
            const label = rememberBox.closest('.remember-me');
            if (label) label.style.display = isTrusted ? 'none' : '';
            const options = rememberBox.closest('.form-options');
            if (options) options.style.justifyContent = isTrusted ? 'flex-end' : '';
        }

        // Agree-terms checkbox
        if (agreeBox) {
            agreeBox.checked = isTrusted;
            const legalRow = agreeBox.closest('.legal-agreement');
            if (legalRow) legalRow.style.display = isTrusted ? 'none' : '';
        }

        // Email field
        if (emailGroup) {
            const fg = emailGroup.closest('.form-group');
            if (fg) fg.style.display = isTrusted ? 'none' : '';
        }

        // ── Polish: Hide Role and Municipality for trusted users ──
        const roleSelector = document.querySelector('.role-selector');
        const municipalitySection = document.getElementById('municipalitySection');
        // if (roleSelector) roleSelector.style.display = isTrusted ? 'none' : '';
        // if (municipalitySection) municipalitySection.style.display = isTrusted ? 'none' : '';
    }

    // ── Evaluate trusted state for current role ──
    function evaluateTrust() {
        const currentRole = roleInput ? roleInput.value : 'admin';
        const savedUser = getSavedUser(currentRole);

        if (savedUser) {
            // Pre-fill username and apply trusted mode
            if (usernameInput) usernameInput.value = savedUser;
            applyTrustedMode(true);
        } else {
            // Clear username (don't carry over from another role) and show full form
            if (usernameInput) usernameInput.value = '';
            applyTrustedMode(false);
        }
    }

    // ── On page load: evaluate for initial role ──
    evaluateTrust();

    // ── When the role dropdown changes, re-evaluate ──
    // Hook into the role option click events
    const roleOptions = document.querySelectorAll('#roleDropdown .dropdown-option');
    roleOptions.forEach(option => {
        option.addEventListener('click', function () {
            // Small delay to let the role input update first
            setTimeout(evaluateTrust, 50);
        });
    });

    // ── When user types a different username, reveal full form ──
    if (usernameInput) {
        usernameInput.addEventListener('input', function () {
            const currentRole = roleInput ? roleInput.value : 'admin';
            const savedUser = getSavedUser(currentRole);

            if (savedUser && this.value.trim() !== savedUser) {
                // Different user — show full form
                applyTrustedMode(false);
            } else if (savedUser && this.value.trim() === savedUser) {
                // Back to saved user — re-hide
                applyTrustedMode(true);
            }
        });
    }

    // ── Migrate old localStorage format (fc_saved_username → per-role) ──
    const oldUser = localStorage.getItem('fc_saved_username');
    const oldRole = localStorage.getItem('fc_saved_role');
    if (oldUser && oldRole) {
        localStorage.setItem(`fc_saved_${oldRole}`, oldUser);
        localStorage.removeItem('fc_saved_username');
        localStorage.removeItem('fc_saved_role');
        // Re-evaluate after migration
        evaluateTrust();
    }
}

// ============================================================
// INPUT VALIDATION
// ============================================================
function validateInput(input) {
    const value = input.value.trim();
    const formGroup = input.closest('.form-group');
    let isValid = true;
    let errorMessage = '';

    // If input is optional and empty, it's valid
    if (!input.hasAttribute('required') && value === '') {
        if (formGroup) {
            formGroup.classList.remove('has-error');
            const existingError = formGroup.querySelector('.error-message');
            if (existingError) existingError.remove();
        }
        return true;
    }

    // Required field validation
    if (input.hasAttribute('required') && !value) {
        // Skip checkbox validation here (handled separately)
        if (input.type === 'checkbox') {
            isValid = input.checked;
            errorMessage = isValid ? '' : 'You must agree to proceed';
        } else {
            isValid = false;
            errorMessage = 'This field is required';
        }
    }
    // Email validation (only if value is not empty)
    else if (input.type === 'email' && value && !validateEmail(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address';
    }
    // Password validation
    else if (input.type === 'password' && input.name === 'password' && value.length < 6) {
        isValid = false;
        errorMessage = 'Password must be at least 6 characters';
    }

    // Update UI
    if (formGroup) {
        formGroup.classList.toggle('has-error', !isValid);

        // Remove existing error message
        const existingError = formGroup.querySelector('.error-message');
        if (existingError) existingError.remove();

        // Add new error message if invalid
        if (!isValid && errorMessage) {
            const errorSpan = document.createElement('span');
            errorSpan.className = 'error-message';
            errorSpan.textContent = errorMessage;
            formGroup.appendChild(errorSpan);
        }
    }

    return isValid;
}

function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

// ============================================================
// PASSWORD TOGGLES
// ============================================================
function initializePasswordToggles() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        const toggleBtn = input.parentElement?.querySelector('.password-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                const isHidden = input.type === 'password';
                input.type = isHidden ? 'text' : 'password';
                this.classList.toggle('password-hidden');
                this.classList.toggle('password-visible');
            });
        }
    });
}

// ============================================================
// ROLE & MUNICIPALITY DROPDOWNS
// ============================================================
function initializeDropdowns() {
    const municipalityDropdown = document.getElementById('municipalityDropdown');
    if (!municipalityDropdown) return;

    // Municipality Data (Laguna)
    const municipalities = [
        "Alaminos", "Bay", "Biñan", "Cabuyao", "Calamba", "Calauan", "Cavinti",
        "Famy", "Kalayaan", "Liliw", "Los Baños", "Luisiana", "Lumban", "Mabitac",
        "Magdalena", "Majayjay", "Nagcarlan", "Paete", "Pagsanjan", "Pakil",
        "Pangil", "Pila", "Rizal", "San Pablo", "San Pedro", "Santa Cruz",
        "Santa Maria", "Santa Rosa", "Siniloan", "Victoria"
    ];

    const municipalityOptions = document.getElementById('municipalityOptions');
    const selectedMunicipality = document.getElementById('selectedMunicipality');
    const municipalitySection = document.getElementById('municipalitySection');
    const municipalityInput = document.getElementById('municipalityInput');
    const roleInput = document.getElementById('roleInput');
    const submitBtn = document.querySelector('#login-form button[type="submit"]');

    // ── Helper: show a "Coming Soon" toast ──
    function showComingSoonToast(municipalityName) {
        // Remove existing toast if any
        const existing = document.querySelector('.coming-soon-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'coming-soon-toast';
        toast.innerHTML = `
            <div class="coming-soon-toast-content">
                <i class="fas fa-hard-hat"></i>
                <div>
                    <strong>${municipalityName}</strong>
                    <span>Coming Soon — Currently available in Mabitac only</span>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ── Helper: select Mabitac programmatically ──
    function selectMabitac() {
        selectedMunicipality.innerHTML = `<i class="fas fa-map-marker-alt"></i> Mabitac`;
        municipalityInput.value = 'Mabitac';
        municipalityOptions.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.value === 'Mabitac');
        });
        municipalityDropdown.classList.remove('open', 'dropdown-error');
    }

    // Populate Municipality Options
    municipalities.forEach(mun => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.dataset.value = mun;
        option.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${mun}`;

        if (mun !== 'Mabitac') {
            // Non-Mabitac: show "Coming Soon" badge
            option.innerHTML += `<span class="coming-soon-badge">Coming Soon</span>`;
            option.classList.add('option-coming-soon');
        }

        option.addEventListener('click', function () {
            if (mun !== 'Mabitac') {
                // Show toast and revert to Mabitac
                showComingSoonToast(mun);
                selectMabitac();
                return;
            }

            selectedMunicipality.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${mun}`;
            municipalityInput.value = mun;

            // Active state
            municipalityOptions.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');

            municipalityDropdown.classList.remove('open', 'dropdown-error');
        });
        municipalityOptions.appendChild(option);
    });

    // ── Auto-select Mabitac on page load ──
    selectMabitac();

    // Toggle Municipality Dropdown
    municipalityDropdown.querySelector('.dropdown-trigger').addEventListener('click', function (e) {
        e.stopPropagation();
        municipalityDropdown.classList.toggle('open');
        if (window.roleDropdown) window.roleDropdown.classList.remove('open');
    });

    // Role Dropdown Logic
    const roleDropdown = document.getElementById('roleDropdown');
    window.roleDropdown = roleDropdown;
    const roleTrigger = roleDropdown.querySelector('.dropdown-trigger');
    const roleOptionItems = roleDropdown.querySelectorAll('.dropdown-option');
    const selectedRole = document.getElementById('selectedRole');

    // Header mappings
    const headers = {
        'admin': document.getElementById('adminHeader'),
        'mao': document.getElementById('maoHeader'),
        'encoder': document.getElementById('encoderHeader'),
        'verifier': document.getElementById('verifierHeader')
    };

    // Role icon/color mappings for button
    const roleStyles = {
        'admin': { icon: 'fa-user-shield', label: 'Log in as Admin' },
        'mao': { icon: 'fa-building', label: 'Log in as MAO' },
        'encoder': { icon: 'fa-keyboard', label: 'Log in as Encoder' },
        'verifier': { icon: 'fa-user-check', label: 'Log in as Verifier' }
    };

    roleTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        roleDropdown.classList.toggle('open');
        if (municipalityDropdown) municipalityDropdown.classList.remove('open');
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!roleDropdown.contains(e.target)) roleDropdown.classList.remove('open');
        if (municipalityDropdown && !municipalityDropdown.contains(e.target)) municipalityDropdown.classList.remove('open');
    });

    roleOptionItems.forEach(option => {
        option.addEventListener('click', function () {
            const role = this.dataset.role;
            const iconClass = this.querySelector('i').className;
            const text = this.innerText.trim();

            selectedRole.innerHTML = `<i class="${iconClass}"></i> ${text}`;
            roleInput.value = role;

            roleOptionItems.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            roleDropdown.classList.remove('open');

            // Toggle Headers with smooth transition
            Object.values(headers).forEach(header => {
                if (header) {
                    header.style.opacity = '0';
                    setTimeout(() => { header.style.display = 'none'; }, 200);
                }
            });
            if (headers[role]) {
                setTimeout(() => {
                    headers[role].style.display = 'block';
                    requestAnimationFrame(() => { headers[role].style.opacity = '1'; });
                }, 200);
            }

            // Update submit button text
            if (submitBtn && roleStyles[role]) {
                submitBtn.innerHTML = `<i class="fas ${roleStyles[role].icon}"></i> ${roleStyles[role].label}`;
                submitBtn.dataset.originalText = submitBtn.innerHTML;
            }

            // Municipality is always required
            municipalitySection.style.display = 'block';
            municipalityInput.setAttribute('required', 'true');

            // Add role-themed class to the auth card
            const authCard = document.querySelector('.auth-card');
            if (authCard) {
                authCard.className = 'auth-card role-' + role;
            }
        });
    });

    // Set initial button text
    if (submitBtn && roleInput) {
        const initialRole = roleInput.value || 'admin';
        if (roleStyles[initialRole]) {
            submitBtn.innerHTML = `<i class="fas ${roleStyles[initialRole].icon}"></i> ${roleStyles[initialRole].label}`;
            submitBtn.dataset.originalText = submitBtn.innerHTML;
        }
    }
}

// ============================================================
// FLASH MESSAGES (uses same classes as partials/flash-messages.html)
// ============================================================
function showError(message) {
    const flashContainer = document.getElementById('flash-messages');
    if (!flashContainer) return;

    // Clear existing AJAX-injected messages
    flashContainer.querySelectorAll('.ajax-flash').forEach(el => el.remove());

    const flashDiv = document.createElement('div');
    flashDiv.className = 'flash-message danger show ajax-flash';
    flashDiv.setAttribute('role', 'alert');
    flashDiv.innerHTML = `
        <div class="flash-content">
            <i class="fas fa-exclamation-circle flash-icon"></i>
            <span class="flash-text">${message}</span>
        </div>
        <button type="button" class="close-btn" onclick="this.parentElement.parentElement.remove();">
            <i class="fas fa-times"></i>
        </button>
    `;

    flashContainer.appendChild(flashDiv);

    // Auto-remove after 6 seconds
    setTimeout(() => {
        if (flashDiv.parentNode) {
            flashDiv.classList.remove('show');
            flashDiv.classList.add('hide');
            setTimeout(() => flashDiv.remove(), 300);
        }
    }, 6000);
}

function showSuccess(message) {
    const flashContainer = document.getElementById('flash-messages');
    if (!flashContainer) return;

    // Clear existing AJAX-injected messages
    flashContainer.querySelectorAll('.ajax-flash').forEach(el => el.remove());

    const flashDiv = document.createElement('div');
    flashDiv.className = 'flash-message success show ajax-flash';
    flashDiv.setAttribute('role', 'alert');
    flashDiv.innerHTML = `
        <div class="flash-content">
            <i class="fas fa-check-circle flash-icon"></i>
            <span class="flash-text">${message}</span>
        </div>
        <button type="button" class="close-btn" onclick="this.parentElement.parentElement.remove();">
            <i class="fas fa-times"></i>
        </button>
    `;

    flashContainer.appendChild(flashDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (flashDiv.parentNode) {
            flashDiv.classList.remove('show');
            flashDiv.classList.add('hide');
            setTimeout(() => flashDiv.remove(), 300);
        }
    }, 5000);
}

// ============================================================
// TWO-FACTOR AUTHENTICATION — OTP Digits, Countdown, Resend
// ============================================================
let countdownInterval = null;
const COUNTDOWN_DURATION = 60; // seconds

function initialize2FA() {
    const otpContainer = document.getElementById('otpDigits');
    if (!otpContainer) return; // Not on the 2FA page

    const digits = otpContainer.querySelectorAll('.otp-digit');
    const hiddenInput = document.getElementById('otpHiddenInput');
    const form = document.getElementById('twofa-form');

    // Focus first digit
    if (digits[0]) digits[0].focus();

    // OTP Digit Box Behavior
    digits.forEach((digit, index) => {
        // Only allow numeric input
        digit.addEventListener('input', function (e) {
            const value = this.value.replace(/[^0-9]/g, '');
            this.value = value.charAt(0) || '';

            if (value && index < digits.length - 1) {
                digits[index + 1].focus();
            }

            // Update hidden field
            updateHiddenOTP(digits, hiddenInput);

            // Auto-submit when all 6 digits are filled
            if (isOTPComplete(digits)) {
                updateHiddenOTP(digits, hiddenInput);
                // Show overlay then submit
                showAuthOverlay();
                setTimeout(() => {
                    if (form) form.submit();
                }, 200);
            }
        });

        // Handle backspace
        digit.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace') {
                if (!this.value && index > 0) {
                    digits[index - 1].focus();
                    digits[index - 1].value = '';
                    updateHiddenOTP(digits, hiddenInput);
                }
            }
            // Arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                digits[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < digits.length - 1) {
                e.preventDefault();
                digits[index + 1].focus();
            }
        });

        // Handle paste
        digit.addEventListener('paste', function (e) {
            e.preventDefault();
            const pastedData = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
            if (pastedData.length >= 6) {
                for (let i = 0; i < 6 && i < digits.length; i++) {
                    digits[i].value = pastedData[i] || '';
                }
                digits[Math.min(5, pastedData.length - 1)].focus();
                updateHiddenOTP(digits, hiddenInput);

                if (isOTPComplete(digits)) {
                    setTimeout(() => {
                        if (form) form.submit();
                    }, 200);
                }
            }
        });

        // Select all on focus
        digit.addEventListener('focus', function () {
            this.select();
            this.parentElement.classList.add('otp-active');
        });

        digit.addEventListener('blur', function () {
            this.parentElement.classList.remove('otp-active');
        });
    });

    // Form submission — stitch digits into hidden field
    if (form) {
        form.addEventListener('submit', function (e) {
            updateHiddenOTP(digits, hiddenInput);
            if (!isOTPComplete(digits)) {
                e.preventDefault();
                showError('Please enter all 6 digits of the verification code.');
            } else {
                showAuthOverlay();
            }
        });
    }

    // Start countdown timer
    startCountdown();
}

function updateHiddenOTP(digits, hiddenInput) {
    if (!hiddenInput) return;
    let code = '';
    digits.forEach(d => { code += d.value; });
    hiddenInput.value = code;
}

function isOTPComplete(digits) {
    return Array.from(digits).every(d => d.value.length === 1);
}

function startCountdown() {
    const numberEl = document.getElementById('countdownNumber');
    const ringEl = document.getElementById('countdownRing');
    const resendBtn = document.getElementById('resendBtn');
    const countdownContainer = document.getElementById('otpCountdown');

    if (!numberEl || !ringEl) return;

    let remaining = COUNTDOWN_DURATION;
    const circumference = 100; // SVG path length

    // Reset ring
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = '0';

    if (resendBtn) resendBtn.disabled = true;
    if (countdownContainer) countdownContainer.classList.remove('expired');

    // Clear any existing interval
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        remaining--;
        numberEl.textContent = remaining;

        // Update ring progress
        const progress = ((COUNTDOWN_DURATION - remaining) / COUNTDOWN_DURATION) * circumference;
        ringEl.style.strokeDashoffset = progress;

        if (remaining <= 10) {
            numberEl.classList.add('countdown-urgent');
        }

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            numberEl.textContent = '0';
            numberEl.classList.remove('countdown-urgent');
            if (countdownContainer) countdownContainer.classList.add('expired');
            if (resendBtn) resendBtn.disabled = false;
        }
    }, 1000);
}

function resend2FACode() {
    const resendBtn = document.getElementById('resendBtn');
    const resendText = document.getElementById('resendBtnText');

    if (!resendBtn || resendBtn.disabled) return;

    // Disable and show loading
    resendBtn.disabled = true;
    if (resendText) resendText.textContent = 'Sending...';
    resendBtn.querySelector('i').className = 'fas fa-spinner fa-spin';

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
        || document.querySelector('input[name="csrf_token"]')?.value;

    fetch('/auth/resend-2fa', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showSuccess(data.message || 'New code sent!');
                // Clear existing digits
                const digits = document.querySelectorAll('.otp-digit');
                digits.forEach(d => { d.value = ''; });
                const hidden = document.getElementById('otpHiddenInput');
                if (hidden) hidden.value = '';
                if (digits[0]) digits[0].focus();
                // Restart countdown
                startCountdown();
            } else {
                showError(data.message || 'Failed to resend code.');
            }
        })
        .catch(err => {
            console.error('Resend 2FA failed:', err);
            showError('Connection error. Please try again.');
        })
        .finally(() => {
            if (resendText) resendText.textContent = 'Send Code Again';
            resendBtn.querySelector('i').className = 'fas fa-redo-alt';
        });
}

// ============================================================
// AUTH OVERLAY HELPERS — Shared across all auth forms
// ============================================================

/**
 * Show the auth loading overlay. Works on any page that has
 * <div id="authOverlay"> OR <div id="loginOverlay">.
 */
function showAuthOverlay() {
    const overlay = document.getElementById('authOverlay')
        || document.getElementById('loginOverlay');
    if (!overlay) return;

    overlay.classList.remove('success');
    overlay.classList.add('active');
}

/**
 * Attach overlay to standard (non-AJAX) auth forms:
 * forgot-password and reset-password.
 */
function initAuthFormOverlays() {
    const formIds = ['forgotPasswordForm', 'resetPasswordForm'];

    formIds.forEach(id => {
        const form = document.getElementById(id);
        if (!form) return;

        form.addEventListener('submit', function (e) {
            // Let HTML5 validation run first
            if (!form.checkValidity()) return;

            showAuthOverlay();
        });
    });
}


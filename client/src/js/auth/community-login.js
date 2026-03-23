/**
 * Farm Connect — Community Login Module
 * Handles email validation, form submission, and social login interactions.
 */

document.addEventListener('DOMContentLoaded', function () {
    initCommunityLogin();
});

function initCommunityLogin() {
    const form = document.getElementById('community-email-form');
    const emailInput = document.getElementById('communityEmail');
    const facebookBtn = document.getElementById('facebookLoginBtn');
    const googleBtn = document.getElementById('googleLoginBtn');

    if (!form) return;

    // ── Email form validation & submission ──
    emailInput.addEventListener('input', function () {
        const group = this.closest('.community-input-group');
        group.classList.remove('has-error');
        const existingErr = group.querySelector('.error-msg');
        if (existingErr) existingErr.remove();
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const email = emailInput.value.trim();
        const group = emailInput.closest('.community-input-group');

        // Clear previous errors
        group.classList.remove('has-error');
        const existingErr = group.querySelector('.error-msg');
        if (existingErr) existingErr.remove();

        // Validate
        if (!email) {
            showFieldError(group, 'Please enter your email address');
            return;
        }

        if (!isValidEmail(email)) {
            showFieldError(group, 'Please enter a valid email address');
            return;
        }

        // Show loading state
        const btn = form.querySelector('.community-btn-email');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        btn.disabled = true;

        // Simulate — replace with actual API call when backend is ready
        setTimeout(() => {
            showComingAlert('Email login coming soon! The community feature is under development.');
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 1200);
    });

    // ── Facebook button ──
    if (facebookBtn) {
        facebookBtn.addEventListener('click', function (e) {
            e.preventDefault();
            showComingAlert('Facebook login coming soon! We are working on integrating this feature.');
        });
    }

    // ── Google button ──
    if (googleBtn) {
        // No e.preventDefault() here so the href link can work
        googleBtn.addEventListener('click', function (e) {
            // Optional: show loading state on button before redirect
            const originalHTML = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
            this.classList.add('loading');
        });
    }
}

// ── Helpers ──

function isValidEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function showFieldError(group, message) {
    group.classList.add('has-error');
    const errSpan = document.createElement('span');
    errSpan.className = 'error-msg';
    errSpan.textContent = message;
    group.appendChild(errSpan);
    group.querySelector('input').focus();
}

function showComingAlert(message) {
    // Remove existing toast
    const existing = document.querySelector('.community-coming-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'community-coming-toast';
    toast.innerHTML = `
        <div class="community-coming-toast-inner">
            <div class="community-coming-icon">
                <i class="fas fa-hard-hat"></i>
            </div>
            <div class="community-coming-text">
                <strong>Coming Soon</strong>
                <span>${message}</span>
            </div>
            <button class="community-coming-close" onclick="this.closest('.community-coming-toast').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Inject CSS for toast (inline so it works without extra CSS dependency)
    toast.setAttribute('style', `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%) translateY(120%);
        z-index: 9999;
        background: #ffffff;
        color: #1e293b;
        border-radius: 16px;
        padding: 1.25rem 1.5rem;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0,0,0,0.05);
        border: 1px solid rgba(226, 232, 240, 0.8);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        max-width: 420px;
        width: 90%;
    `);

    document.body.appendChild(toast);

    // Force reflow then animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    });

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

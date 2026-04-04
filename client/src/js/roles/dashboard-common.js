/**
 * Farm Connect — Shared Dashboard Utilities
 * Used by all role panels
 */

// ── Password Visibility Toggle (Global) ──
window.togglePasswordVisibility = function(button, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const icon = button.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    }
};

// Load data on page load


// ── Modal Management ──
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-overlay')) {
        const modal = e.target.closest('.modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

// Close modal on ESC key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            activeModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

// ── Toast Notifications ──
function showFlashMessage(message, type = 'success') {
    let container = document.querySelector('.dashboard-flash');
    if (!container) {
        container = document.createElement('div');
        container.className = 'dashboard-flash';
        document.body.appendChild(container);
    }

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `dashboard-toast ${type}`;
    toast.innerHTML = `
        <i class="${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── Sidebar Navigation ──
function setupSidebarNavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-item:not(.logout)');
    const sections = document.querySelectorAll('.content-section');
    const dashboardHome = document.getElementById('dashboard-home');

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href.startsWith('/') || href.startsWith('http')) return; // Skip real links
            e.preventDefault();

            const targetId = href.substring(1) || 'dashboard';

            // Update active state
            navLinks.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            // Show target section with animation
            if (targetId === 'dashboard') {
                if (dashboardHome) dashboardHome.style.display = 'block';
                sections.forEach(section => section.style.display = 'none');
            } else {
                if (dashboardHome) dashboardHome.style.display = 'none';
                sections.forEach(section => {
                    section.style.display = section.id === targetId ? 'block' : 'none';
                });
            }

            // Force Chart.js to recalculate its grid dimensions if Analytics tab is shown
            if (targetId === 'analytics') {
                setTimeout(() => {
                    const allCharts = {
                        ...(window.encoderCharts || {}),
                        ...(window.verifierCharts || {}),
                        ...(window.maoCharts || {})
                    };
                    Object.values(allCharts).forEach(chart => {
                        if (chart && typeof chart.resize === 'function') {
                            chart.resize();
                        }
                    });
                }, 15);
            }

            // Scroll to top of main area
            const main = document.querySelector('.dashboard-main');
            if (main) main.scrollTop = 0;
        });
    });
}

// ── Date Formatting ──
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ── Set Current Date in Header ──
function setCurrentDate() {
    const dateEl = document.querySelector('.current-date');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

// ── Theme Toggle (Dark/Light Mode) ──
function initTheme() {
    const saved = localStorage.getItem('fc-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// Apply theme IMMEDIATELY to prevent flash of wrong theme
initTheme();

window.toggleTheme = function() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('fc-theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('fc-theme', 'dark');
    }
};

// ── Welcome Banner (Time-Based Greeting + Live Clock) ──
function setupWelcomeBanner() {
    const banner = document.getElementById('welcomeBanner');
    if (!banner) return;

    const userName = banner.dataset.userName || 'User';
    const greetingEl = banner.querySelector('.welcome-greeting');
    const subtitleEl = banner.querySelector('.welcome-subtitle');
    const dateEl = banner.querySelector('.welcome-date');

    const hour = new Date().getHours();
    let greeting, subtitle;

    if (hour < 12) {
        greeting = `Good Morning, ${userName}!`;
        subtitle = 'Start your day right — here\'s your dashboard overview.';
    } else if (hour < 17) {
        greeting = `Good Afternoon, ${userName}!`;
        subtitle = 'Keep up the great work — here\'s what\'s happening.';
    } else {
        greeting = `Good Evening, ${userName}!`;
        subtitle = 'Wrapping up the day — here\'s your latest summary.';
    }

    if (greetingEl) {
        const wave = greetingEl.querySelector('.welcome-wave');
        if (wave) {
            greetingEl.innerHTML = `<span class="welcome-wave">${wave.innerHTML}</span> ${greeting}`;
        } else {
            greetingEl.textContent = greeting;
        }
    }
    
    if (subtitleEl) subtitleEl.textContent = subtitle;
    
    // Render date + live time with icons
    if (dateEl) {
        function updateDateTime() {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            dateEl.innerHTML = `
                <span class="welcome-date-item"><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
                <span class="welcome-date-divider"></span>
                <span class="welcome-date-item"><i class="fas fa-clock"></i> ${timeStr}</span>
            `;
        }
        updateDateTime();
        setInterval(updateDateTime, 1000); // Live clock
    }
}

// ── Activity Feed Timeline ──
function loadActivityFeed() {
    const feedContainer = document.getElementById('activityFeedList');
    const logContainer = document.getElementById('activityLog');
    
    // Determine the API endpoint based on the current role's URL path
    const path = window.location.pathname;
    let apiUrl = '/admin/api/activity-feed';
    if (path.includes('/mao/')) apiUrl = '/mao/api/activity-feed';
    else if (path.includes('/encoder/')) apiUrl = '/encoder/api/activity-feed';
    else if (path.includes('/verifier/')) apiUrl = '/verifier/api/activity-feed';

    fetch(apiUrl, { credentials: 'include' })
        .then(res => {
            if (!res.ok) throw new Error('Failed to load activity feed');
            return res.json();
        })
        .then(data => {
            const items = data.activities || [];
            
            let htmlContent = '';
            
            if (items.length === 0) {
                htmlContent = `
                    <div class="activity-empty">
                        <i class="fas fa-stream"></i>
                        <p>No recent activity to show.</p>
                    </div>`;
            } else {
                htmlContent = items.map(item => {
                    const dotClass = item.type === 'success' ? 'dot-success'
                        : item.type === 'warning' ? 'dot-warning'
                            : item.type === 'danger' ? 'dot-danger'
                                : item.type === 'info' ? 'dot-info' : '';

                    return `
                        <div class="activity-item">
                            <div class="activity-dot ${dotClass}"></div>
                            <div class="activity-content">
                                <p class="activity-message">${item.message}</p>
                                <span class="activity-time">${formatDateTime(item.timestamp)}</span>
                            </div>
                        </div>`;
                }).join('');
            }
            
            if (feedContainer) feedContainer.innerHTML = htmlContent;
            if (logContainer) {
                // For the dedicated Activity Log tab, wrap it inside the same timeline structure 
                // to maintain consistent styling with the feed if it expects it
                logContainer.classList.add('activity-feed-timeline');
                logContainer.innerHTML = htmlContent;
            }
        })
        .catch(err => {
            console.warn('Activity feed load failed:', err);
            const errorHtml = `
                <div class="activity-empty">
                    <i class="fas fa-stream"></i>
                    <p>Activity feed coming soon.</p>
                </div>`;
            if (feedContainer) feedContainer.innerHTML = errorHtml;
            if (logContainer) logContainer.innerHTML = errorHtml;
        });
}

// ── AJAX Utilities ───────────────────────────────────────────────────────────
function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// ── Profile & Account Management ─────────────────────────────────────────────
let selectedProfileFile = null;

function handleProfileFile(file) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!allowed.includes(file.type)) {
        showFlashMessage('Invalid file type. Use PNG, JPG, or GIF.', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showFlashMessage('File too large. Maximum 5 MB.', 'error');
        return;
    }
    selectedProfileFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('profileAvatarPreview');
        if (preview) {
             preview.innerHTML = `<img src="${e.target.result}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        }
    };
    reader.readAsDataURL(file);
}

function saveProfile() {
    const fullNameEl = document.getElementById('profileFullName');
    const fullName = fullNameEl ? fullNameEl.value.trim() : '';
    
    if (!fullName) {
        showFlashMessage('Full name cannot be empty.', 'error');
        return;
    }

    const submitBtn = document.querySelector('#profileModal .btn-primary');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    const formData = new FormData();
    formData.append('full_name', fullName);
    if (selectedProfileFile) formData.append('profile_image', selectedProfileFile);

    fetch('/auth/update-profile', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken() },
        body: formData,
    })
    .then((r) => r.json())
    .then((data) => {
        if (data.success) {
            showFlashMessage('Profile updated successfully!', 'success');
            closeModal('profileModal');
            
            // ── Real-Time Sidebar Update ──
            const nameEls = document.querySelectorAll('.user-name');
            nameEls.forEach(el => el.textContent = fullName);
            
            if (data.avatar_url) {
                // Add cache-busting timestamp
                const bustedUrl = `${data.avatar_url}?t=${new Date().getTime()}`;
                
                const sidebarAvatar = document.getElementById('sidebarAvatar');
                if (sidebarAvatar) {
                    sidebarAvatar.innerHTML = `<img src="${bustedUrl}" alt="Profile" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`;
                }
                // Also update the preview in case they open the modal again
                const preview = document.getElementById('profileAvatarPreview');
                if (preview) {
                    preview.innerHTML = `<img src="${bustedUrl}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                }
            }
            
            selectedProfileFile = null;
        } else {
            showFlashMessage(data.message || 'Failed to update profile.', 'error');
        }
    })
    .catch(() => showFlashMessage('Network error. Please try again.', 'error'))
    .finally(() => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    });
}

function changePassword() {
    const newPw = document.getElementById('newPassword').value;
    const confirmPw = document.getElementById('confirmPassword').value;
    const btn = document.querySelector('.btn-change-password');

    if (!newPw || !confirmPw) { showFlashMessage('Please fill in both password fields.', 'error'); return; }
    if (newPw.length < 8) { showFlashMessage('Password must be at least 8 characters.', 'error'); return; }
    if (newPw !== confirmPw) { showFlashMessage('Passwords do not match.', 'error'); return; }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    }

    fetch('/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify({ new_password: newPw }),
    })
    .then((r) => r.json())
    .then((data) => {
        if (data.success) {
            showFlashMessage('Password updated successfully!', 'success');
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            showFlashMessage(data.message || 'Failed to update password.', 'error');
        }
    })
    .catch(() => showFlashMessage('Network error. Please try again.', 'error'))
    .finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-alt"></i> Update Password';
        }
    });
}

// ── Account Deletion ─────────────────────────────────────────────────────────

function confirmDeleteAccount() {
    const overlay = document.getElementById('deleteAccountOverlay');
    if (overlay) overlay.classList.add('active');
}

function cancelDeleteAccount() {
    const overlay = document.getElementById('deleteAccountOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        const pwInput = document.getElementById('deleteAccountPassword');
        if (pwInput) pwInput.value = '';
    }
}

function executeDeleteAccount() {
    const passwordInput = document.getElementById('deleteAccountPassword');
    const password = passwordInput ? passwordInput.value : '';
    
    if (!password) { 
        showFlashMessage('Please enter your password to confirm.', 'error'); 
        return; 
    }

    const btn = document.querySelector('#deleteAccountOverlay .btn-danger');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    }

    fetch('/auth/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
        body: JSON.stringify({ password }),
    })
    .then((r) => r.json())
    .then((data) => {
        if (data.success) {
            showFlashMessage('Account deleted. Redirecting…', 'success');
            setTimeout(() => (window.location.href = '/auth/login'), 1500);
        } else {
            showFlashMessage(data.message || 'Failed to delete account.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Forever';
            }
        }
    })
    .catch(() => {
        showFlashMessage('Network error. Please try again.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Forever';
        }
    });
}

// Ensure these are available globally if scripts are loaded as modules or just for clarity
window.handleProfileFile = handleProfileFile;
window.saveProfile = saveProfile;
window.changePassword = changePassword;
window.confirmDeleteAccount = confirmDeleteAccount;
window.cancelDeleteAccount = cancelDeleteAccount;
window.executeDeleteAccount = executeDeleteAccount;

window.socket = null; // Exposed globally
let socket; // Local reference for this file


/**
 * Socket.IO Initialization
 */
function initSocket() {
    window.socket = io();
    socket = window.socket; // Synchronize local reference
    
    socket.on('connect', () => {
        console.log('Connected to real-time server');
    });
    
    socket.on('new_submission', (data) => {
        showFlashMessage(`New ${data.form_type.toUpperCase()} submission from ${data.barangay}`, 'success');
        // Refresh stats if applicable
        if (typeof loadStats === 'function') loadStats();
    });
    
    socket.on('submission_action', (data) => {
        // Shared live update for dashboards
        if (typeof loadStats === 'function') loadStats();
        if (typeof loadRecentActivity === 'function') loadRecentActivity();
        if (typeof loadActivityFeed === 'function') loadActivityFeed();
    });

    // ── Instant notification badge refresh (no more waiting for 5s poll) ──
    socket.on('new_notification', (data) => {
        loadNotificationCount();
        // If the dropdown is currently open, refresh the list too
        if (_notifDropdownOpen) {
            loadNotifications();
        }
    });

    socket.on('new_activity', (data) => {
        console.log('New activity received:', data);
        if (typeof loadActivityFeed === 'function') loadActivityFeed();
        
        // Show a subtle notification for admins, but skip login/logout events
        // since the backend already handles flash messaging for those actions
        const msg = (data.message || '').toLowerCase();
        const isAuthEvent = msg.includes('login') || msg.includes('logout') || msg.includes('signed out');
        if (window.location.pathname.includes('/admin') && !isAuthEvent) {
             showFlashMessage(data.message, data.type || 'info');
        }
    });
}

// ── Shared Stats Helpers (used by all panels) ──────────────────────────────
window.updateTrendBadge = function(elementId, trendValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('up', 'down', 'neutral');
    if (trendValue > 0) {
        el.classList.add('up');
        el.innerHTML = `<i class="fas fa-arrow-up"></i> +${trendValue}%`;
    } else if (trendValue < 0) {
        el.classList.add('down');
        el.innerHTML = `<i class="fas fa-arrow-down"></i> ${trendValue}%`;
    } else {
        el.classList.add('neutral');
        el.innerHTML = `<i class="fas fa-minus"></i> 0%`;
    }
};

window.animateCount = function(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = target; // Simplified for production display reliability
};

// ── Initialize Common Features ──
document.addEventListener('DOMContentLoaded', function () {
    initTheme(); // Apply saved theme on load
    setupSidebarNavigation();
    setCurrentDate();
    setupWelcomeBanner();
    loadActivityFeed();
    initNotifications();
    initSocket();
    // loadOnlineUsers is called inside initNotifications now
});


// ── Notification System ──────────────────────────────────────────────────────

// Determine the role prefix from the current URL (e.g., /encoder, /verifier, /mao)
function _getApiPrefix() {
    const path = window.location.pathname;
    if (path.includes('/encoder')) return '/encoder';
    if (path.includes('/verifier')) return '/verifier';
    if (path.includes('/mao')) return '/mao';
    if (path.includes('/admin')) return '/admin';
    return '';
}

let _notifDropdownOpen = false;

function initNotifications() {
    loadNotificationCount();
    // Poll every 5 seconds (more real-time)
    setInterval(() => {
        loadNotificationCount();
        loadActivityFeed(); // Also refresh activity feed
    }, 5000);

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        const bell = document.getElementById('notificationBell');
        if (bell && !bell.contains(e.target) && _notifDropdownOpen) {
            document.getElementById('notifDropdown')?.classList.remove('open');
            _notifDropdownOpen = false;
        }
    });
}

function loadNotificationCount() {
    const prefix = _getApiPrefix();
    if (!prefix) return;

    fetch(`${prefix}/api/notifications/unread-count`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;
            const badge = document.getElementById('notifBadge');
            if (!badge) return;

            const count = data.count || 0;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        })
        .catch(() => { });
}

function toggleNotifications() {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;

    _notifDropdownOpen = !_notifDropdownOpen;
    dropdown.classList.toggle('open', _notifDropdownOpen);

    if (_notifDropdownOpen) {
        loadNotifications();
    }
}

function loadNotifications() {
    const prefix = _getApiPrefix();
    const container = document.getElementById('notifList');
    if (!container || !prefix) return;

    container.innerHTML = `
        <div class="notif-empty">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading...</p>
        </div>`;

    fetch(`${prefix}/api/notifications`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;

            const items = data.notifications || [];
            if (items.length === 0) {
                container.innerHTML = `
                    <div class="notif-empty">
                        <i class="fas fa-check-circle"></i>
                        <p>No notifications yet</p>
                    </div>`;
                return;
            }

            container.innerHTML = items.map(n => {
                const iconMap = {
                    new_submission: 'fas fa-file-alt',
                    verified: 'fas fa-check-double',
                    approved: 'fas fa-check-circle',
                    rejected: 'fas fa-times-circle',
                    info: 'fas fa-info-circle',
                };
                const colorMap = {
                    new_submission: 'notif-type-new',
                    verified: 'notif-type-verified',
                    approved: 'notif-type-approved',
                    rejected: 'notif-type-rejected',
                    info: 'notif-type-info',
                };

                const icon = iconMap[n.type] || 'fas fa-bell';
                const colorCls = colorMap[n.type] || '';
                const readCls = n.is_read ? 'notif-read' : 'notif-unread';

                const cursorStyle = n.reference_id ? 'cursor: pointer;' : '';
                return `
                    <div class="notif-item ${readCls} ${colorCls}" style="${cursorStyle}" onclick="handleNotificationClick(${n.id}, ${n.reference_id || 'null'}, '${n.type}', this)">
                        <div class="notif-item-icon"><i class="${icon}"></i></div>
                        <div class="notif-item-body">
                            <p class="notif-item-msg">${n.message}</p>
                            <span class="notif-item-time">${_timeAgo(n.created_at)}</span>
                        </div>
                        ${!n.is_read ? '<span class="notif-dot"></span>' : ''}
                    </div>`;
            }).join('');
        })
        .catch(() => {
            container.innerHTML = `
                <div class="notif-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Could not load notifications</p>
                </div>`;
        });
}

function markNotificationRead(nid, el) {
    const prefix = _getApiPrefix();
    if (!prefix) return Promise.resolve();

    return fetch(`${prefix}/api/notifications/${nid}/read`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken() },
        credentials: 'include',
    }).then(() => {
        if (el) {
            el.classList.remove('notif-unread');
            el.classList.add('notif-read');
            const dot = el.querySelector('.notif-dot');
            if (dot) dot.remove();
        }
        loadNotificationCount();
    }).catch(() => { });
}

function handleNotificationClick(nid, refId, type, el) {
    // First mark as read
    markNotificationRead(nid, el).then(() => {
        // Close dropdown
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
            _notifDropdownOpen = false;
        }

        // Navigate based on role and notification type
        if (!refId) return; // Info message without a link

        const path = window.location.pathname;

        // Verifier Panel Logic
        if (path.includes('/verifier')) {
            // Switch to pending registrations map/list
            const formsLink = document.querySelector('.sidebar-nav a[href="#pending"]');
            if (formsLink) formsLink.click();

            // Try to open the specific review modal after a short delay
            setTimeout(() => {
                if (typeof viewSubmission === 'function') {
                    viewSubmission(refId);
                }
            }, 500);
        }
        // MAO Panel Logic
        else if (path.includes('/mao')) {
            const formsLink = document.querySelector('.sidebar-nav a[href="#registrations"]');
            if (formsLink) formsLink.click();

            setTimeout(() => {
                if (typeof reviewRegistration === 'function') {
                    reviewRegistration(refId);
                } else if (typeof viewRegistration === 'function') {
                    viewRegistration(refId);
                }
            }, 500);
        }
        // Encoder Panel Logic
        else if (path.includes('/encoder')) {
            // For rejected or verified notifications, switch to track submissions
            if (type === 'rejected' || type === 'verified' || type === 'approved') {
                const trackLink = document.querySelector('.sidebar-nav a[href="#my-submissions"]');
                if (trackLink) trackLink.click();

                setTimeout(() => {
                    if (typeof viewSubmission === 'function') {
                        viewSubmission(refId);
                    }
                }, 500);
            }
        }
    });
}

function markAllNotificationsRead() {
    const prefix = _getApiPrefix();
    if (!prefix) return;

    fetch(`${prefix}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken() },
        credentials: 'include',
    }).then(() => {
        loadNotificationCount();
        loadNotifications();
    }).catch(() => { });
}

function _timeAgo(isoStr) {
    if (!isoStr) return '';
    const now = new Date();
    const d = new Date(isoStr);
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Online Users System ──────────────────────────────────────────────────
function toggleOnlineUsers() {
    openModal('onlineUsersModal');
    loadOnlineUsers();
}

function loadOnlineUsers() {
    const container = document.getElementById('onlineUsersList');
    const badge = document.getElementById('onlineCount');
    if (!container) return;

    // Only admin panel has the /api/online-users endpoint;
    // non-admin panels would get 403, so skip the fetch entirely.
    const isAdminPanel = window.location.pathname.includes('/admin');
    if (!isAdminPanel) {
        if (badge) badge.style.display = 'none';
        return;
    }

    fetch('/admin/api/online-users', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;

            const users = data.users || [];
            
            if (badge) {
                if (data.count > 0) {
                    badge.textContent = data.count > 99 ? '99+' : data.count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }

            if (users.length === 0) {
                container.innerHTML = `
                    <div class="notif-empty">
                        <i class="fas fa-user-slash"></i>
                        <p>No other users online</p>
                    </div>`;
                return;
            }

            container.innerHTML = `
                <div class="online-user-list">
                    ${users.map(u => {
                        const avatarImg = u.avatar_url 
                            ? `<img src="${u.avatar_url}" alt="${u.full_name}">` 
                            : `<i class="fas ${u.type === 'staff' ? 'fa-user-tie' : 'fa-user'}"></i>`;

                        return `
                            <div class="online-user-item">
                                <div class="user-avatar-mini">
                                    ${avatarImg}
                                </div>
                                <div class="online-user-info">
                                    <span class="online-user-name">
                                        ${u.full_name}
                                        <span class="online-type-badge ${u.type}">${u.type}</span>
                                    </span>
                                    <span class="online-user-role">${u.role}</span>
                                </div>
                                <div class="status-dot online"></div>
                            </div>`;
                    }).join('')}
                </div>`;
        })
        .catch(() => {
            container.innerHTML = `
                <div class="notif-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load online personnel</p>
                </div>`;
        });
}

// Hook into initializers
(function() {
    // Wrap initNotifications to also call loadOnlineUsers
    const originalInitNotifs = window.initNotifications;
    window.initNotifications = function() {
        if (typeof originalInitNotifs === 'function') originalInitNotifs();
        
        loadOnlineUsers();
        // Polling is already handled by loadNotificationCount interval to refresh activity feed.
        // We'll add a specific one for online users or bundle it.
        setInterval(loadOnlineUsers, 30000); // 30s refresh for online list

        // Close on click outside
        document.addEventListener('click', function(e) {
            const btn = document.getElementById('onlineUsersBtn');
            const dropdown = document.getElementById('onlineUsersDropdown');
            if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target) && _onlineUsersDropdownOpen) {
                dropdown.classList.remove('open');
                _onlineUsersDropdownOpen = false;
            }
        });
    };

    // Close online dropdown when opening notifications
    const originalToggleNotifs = window.toggleNotifications;
    window.toggleNotifications = function() {
        if (!_notifDropdownOpen) {
            const dropdown = document.getElementById('onlineUsersDropdown');
            if (dropdown && _onlineUsersDropdownOpen) {
                dropdown.classList.remove('open');
                _onlineUsersDropdownOpen = false;
            }
        }
        if (typeof originalToggleNotifs === 'function') originalToggleNotifs();
    };
})();

window.toggleOnlineUsers = toggleOnlineUsers;

// ── Global showToast alias (used by verifier/encoder panels, defined in mao-panel) ──
// Ensures showToast never throws a ReferenceError on panels that don't define it locally
if (typeof window.showToast === 'undefined') {
    window.showToast = function(msg, type) {
        if (typeof showFlashMessage === 'function') {
            showFlashMessage(msg, type);
        }
    };
}

// ── Shared PDF Viewer & Print Utilities ──
window.closePdfViewer = function (overlayId, blobUrl) {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.remove();
        if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
        }
    }
};

window.printPdfIframe = function (iframeId) {
    const frame = document.getElementById(iframeId);
    if (frame && frame.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
    } else {
        if (window.showFlashMessage) {
            window.showFlashMessage('Unable to print document at this time.', 'error');
        } else {
            alert('Unable to print document at this time.');
        }
    }
};

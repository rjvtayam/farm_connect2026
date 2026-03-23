/**
 * Admin Dashboard Functionality
 * Handles: user management, beneficiary management, stats, profile, account deletion
 */


let allUsers = [];
let allCommunityMembers = [];

// ── Form Validation ──
function validateUserForm(formData) {
    const email = formData.get('email');
    const password = formData.get('password');
    const fullName = formData.get('full_name');
    const username = formData.get('username');
    const role = formData.get('role');

    if (!fullName || fullName.trim() === '') {
        showFlashMessage('Full Name is required.', 'error');
        return false;
    }
    if (!username || username.trim() === '') {
        showFlashMessage('Username is required.', 'error');
        return false;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFlashMessage('Please enter a valid email address.', 'error');
        return false;
    }
    // Password required for creation, optional for edit
    if (password !== null && password !== undefined) {
        if (password.length > 0 && password.length < 6) {
            showFlashMessage('Password must be at least 6 characters.', 'error');
            return false;
        }
    }
    if (role === '') {
        showFlashMessage('Please select a role.', 'error');
        return false;
    }
    
    return true;
}

// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadUsers();
    loadCommunityMembers();
    setupSearchAndFilters();
    initAdminCharts();
    initCommandCenter();
    loadTrashCount();
});

let commandMap = null;
let heatLayer = null;
let markersLayer = null;
let gisLayerGroup = null; // Group for polygons and status markers
let staffLayerGroup = null; // Group for staff icons
let allSubmissions = [];
let allStaff = [];

const MABITAC_BARANGAYS = {
    'Amuyong': [14.4172, 121.4170],
    'Antonio': [14.4382, 121.4398],
    'Mabitac': [14.4284, 121.4285],
    'Bayanihan': [14.4284, 121.4285],
    'Bayanihan (Mabitac)': [14.4284, 121.4285],
    'Nanguma': [14.4442, 121.4468],
    'Paagahan': [14.4111, 121.4086],
    'Pag-asa': [14.4258, 121.4322],
    'Libis ng Nayon': [14.4284, 121.4285],
    'Sinagtala': [14.4312, 121.4241],
    'Matalatala': [14.4082, 121.4352],
    'San Roque': [14.4250, 121.4300],
    'Maligaya': [14.4300, 121.4200],
    'Masikap': [14.4400, 121.4450]
};

function initCommandCenter() {
    const mapDiv = document.getElementById('adminCommandMap');
    if (!mapDiv) return;

    // Use vibrant, colorful Standard Map tiles
    commandMap = L.map('adminCommandMap', {
        zoomControl: false // We'll put it in a better spot if needed
    }).setView([14.4284, 121.4285], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(commandMap);

    L.control.zoom({ position: 'bottomright' }).addTo(commandMap);

    gisLayerGroup = L.featureGroup().addTo(commandMap);
    staffLayerGroup = L.featureGroup().addTo(commandMap);
    
    // Initial data load
    loadCommandCenterData();

    // Setup Filters
    const roleFilter = document.getElementById('mapRoleFilter');
    
    if (roleFilter) roleFilter.addEventListener('change', renderMapData);
    
    // Listen for real-time events via global socket
    const activeSocket = window.socket || (typeof socket !== 'undefined' ? socket : null);
    if (activeSocket) {
        activeSocket.on('new_submission', (data) => {
            console.log("📍 Command Center: New submission received", data);
            showFlashMessage(`New enrollment from ${data.barangay}`, 'info');
            loadCommandCenterData(); // Full refresh for accuracy
            loadHeatmapData();
        });

        activeSocket.on('staff_update', (data) => {
            console.log("👥 Command Center: Staff update received", data);
            loadCommandCenterData(); // Refresh staff list
        });
        
        activeSocket.on('status_updated', (data) => {
            console.log("🔄 Command Center: Status update received", data);
            loadCommandCenterData();
        });
    }

    // Auto-refresh map every 60 seconds to update Online/Offline status
    setInterval(() => {
        console.log("⏱️ Command Center: Periodic status refresh");
        loadCommandCenterData();
    }, 60000);
}

function loadCommandCenterData() {
    fetch('/admin/api/gis/all-submissions')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                allSubmissions = data.submissions;
                allStaff = data.staff || [];
                renderMapData();
            }
        })
        .catch(err => console.error("Error loading command center data:", err));
}

function renderMapData() {
    if (!commandMap || !gisLayerGroup || !staffLayerGroup) return;

    const roleVal = document.getElementById('mapRoleFilter')?.value || 'all';

    gisLayerGroup.clearLayers();
    staffLayerGroup.clearLayers();

    // 2. Render Staff (Show ALL by default for real-time monitoring)
    const now = new Date();
    const coordinateCounts = {}; // Track overlaps

    allStaff.forEach(staff => {
        // Calculate Online Status (Active in last 5 minutes)
        const lastActive = staff.last_active ? new Date(staff.last_active) : null;
        const isOnline = lastActive && (now - lastActive) < (5 * 60 * 1000);
        const status = isOnline ? 'online' : 'offline';

        // Role Filter
        if (roleVal !== 'all' && staff.role !== roleVal) return;
        
        let coords = [...(MABITAC_BARANGAYS[staff.last_barangay] || [14.4284, 121.4285])];
        const coordKey = `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;

        if (coordinateCounts[coordKey]) {
            // Apply a small spiral-like jitter for overlapping markers
            const angle = 0.5 * coordinateCounts[coordKey];
            const jitter = 0.0004 * coordinateCounts[coordKey];
            coords[0] += Math.cos(angle) * jitter;
            coords[1] += Math.sin(angle) * jitter;
            coordinateCounts[coordKey]++;
        } else {
            coordinateCounts[coordKey] = 1;
        }

        renderStaffOnMap(staff, isOnline, coords);
    });
}

function renderStaffOnMap(staff, isOnline, coords) {
    // coords provided by renderMapData to handle jitter
    const statusClass = isOnline ? 'online' : 'offline';
    
    const roleIcons = {
        'encoder': '<i class="fas fa-keyboard"></i>',
        'verifier': '<i class="fas fa-search-location"></i>',
        'mao': '<i class="fas fa-user-tie"></i>',
        'admin': '<i class="fas fa-user-shield"></i>'
    };

    const iconHtml = `
        <div class="staff-map-marker ${staff.role} ${statusClass}">
            ${roleIcons[staff.role] || '<i class="fas fa-user"></i>'}
            <div class="status-indicator-dot ${statusClass}"></div>
        </div>
    `;

    const customIcon = L.divIcon({
        html: iconHtml,
        className: `staff-div-marker-wrap ${staff.role}`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker(coords, { icon: customIcon }).addTo(staffLayerGroup);
    
    marker.bindTooltip(`
        <div class="staff-tooltip">
            <div class="d-flex align-items-center mb-1">
                <strong>${staff.name}</strong>
                <span class="ms-2 badge ${isOnline ? 'bg-success' : 'bg-secondary'}" style="font-size: 0.6rem;">
                    ${isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
            </div>
            <span class="role-label">${staff.role.toUpperCase()}</span><br>
            <small class="text-muted">Last Active: ${staff.last_active ? new Date(staff.last_active).toLocaleString() : 'Never'}</small><br>
            <small class="text-muted">Location: ${staff.last_barangay}</small>
        </div>
    `, { direction: 'top', offset: [0, -10] });
}

function renderSubmissionOnMap(sub) {
    const statusColors = {
        'pending': '#f59e0b',
        'verified': '#3b82f6',
        'approved': '#10b981',
        'returned': '#ef4444'
    };
    const color = statusColors[sub.status] || '#94a3b8';

    const subGroup = L.featureGroup();

    // 1. Render Polygon (Boundary) if available
    if (sub.geo_data) {
        const polygon = L.geoJSON(sub.geo_data, {
            style: {
                color: color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.2
            }
        });
        polygon.bindTooltip(`<b>${sub.beneficiary_name}</b><br><span style="color:${color}">${sub.status.toUpperCase()}</span>`, {
            className: 'admin-map-tooltip',
            sticky: true
        });
        polygon.addTo(subGroup);
    }

    // 2. Render Point Marker
    if (sub.main_coords) {
        const marker = L.circleMarker(sub.main_coords, {
            radius: sub.status === 'pending' ? 7 : 5,
            fillColor: color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            className: sub.status === 'pending' ? 'marker-pulse' : ''
        });

        const tooltipHtml = `
            <div class="sub-tooltip">
                <strong>${sub.beneficiary_name}</strong><br>
                <span>Status: <b style="color:${color}">${sub.status.toUpperCase()}</b></span><br>
                <small>Encoded by: ${sub.encoder_name}</small>
                ${sub.verifier_name !== 'N/A' ? `<br><small>Verified by: ${sub.verifier_name}</small>` : ''}
            </div>
        `;

        marker.bindTooltip(tooltipHtml, {
            className: 'admin-map-tooltip',
            direction: 'top',
            offset: [0, -5]
        });

        marker.on('click', () => {
             Swal.fire({
                 title: sub.beneficiary_name,
                 html: `<div class="text-start">
                          <p><b>Status:</b> <span class="badge badge-${sub.status}">${sub.status.toUpperCase()}</span></p>
                          <p><b>Barangay:</b> ${sub.barangay}</p>
                          <p><b>Encoded by:</b> ${sub.encoder_name}</p>
                          <p><b>Date:</b> ${new Date(sub.submission_date).toLocaleDateString()}</p>
                        </div>`,
                 confirmButtonText: 'View Details',
                 confirmButtonColor: '#4F46E5'
             });
        });

        marker.addTo(subGroup);
    }

    subGroup.addTo(gisLayerGroup);
}

function filterMapData() {
    renderMapData();
}

function loadHeatmapData() {
    // Heatmap removed as requested to focus on staff monitoring
    return;
}

function flashMarker(barangay, type, text) {
    if (!commandMap) return;
    
    const coords = MABITAC_BARANGAYS[barangay] || [14.4333, 121.4333];
    const color = type === 'new' ? '#4F46E5' : '#10b981';
    
    const marker = L.circleMarker(coords, {
        radius: 12,
        fillColor: color,
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.8,
        className: 'marker-pulse'
    }).addTo(commandMap);
    
    marker.bindTooltip(text, {permanent: true, direction: 'top', className: 'admin-map-tooltip'}).openTooltip();
    
    setTimeout(() => {
        commandMap.removeLayer(marker);
    }, 8000);
}

// ── Search & Filter Initialization ──
function setupSearchAndFilters() {
    const userSearch = document.getElementById('searchUsers');
    const roleFilter = document.getElementById('filterRole');
    const commSearch = document.getElementById('searchCommunityMembers');

    if (userSearch) userSearch.addEventListener('input', filterUsers);
    if (roleFilter) roleFilter.addEventListener('change', filterUsers);
    if (commSearch) commSearch.addEventListener('input', () => {
        filterCommunityMembers(commSearch.value.toLowerCase());
    });
}

function filterUsers() {
    const term = (document.getElementById('searchUsers')?.value || '').toLowerCase();
    const role = (document.getElementById('filterRole')?.value || '').toLowerCase();
    
    const filtered = allUsers.filter(user => {
        const matchesTerm = user.full_name.toLowerCase().includes(term) ||
            user.username.toLowerCase().includes(term) ||
            (user.email && user.email.toLowerCase().includes(term));
        const matchesRole = role ? user.role === role : true;
        return matchesTerm && matchesRole;
    });
    renderUsers(filtered);
}

function filterCommunityMembers(term) {
    const filtered = allCommunityMembers.filter(m => {
        return m.full_name.toLowerCase().includes(term) || 
               (m.email && m.email.toLowerCase().includes(term)) ||
               (m.municipality && m.municipality.toLowerCase().includes(term));
    });
    renderCommunityMembers(filtered);
}

// ── Stats ──
function loadStats() {
    fetch('/admin/api/stats')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                animateCount('totalUsers', data.stats.total_users || 0);
                animateCount('activeMAO', data.stats.mao_count || 0);
                animateCount('activeEncoders', data.stats.encoder_count || 0);
                animateCount('activeVerifiers', data.stats.verifier_count || 0);

                if (data.trends) {
                    updateTrendBadge('totalUsersTrend', data.trends.total_users);
                    updateTrendBadge('activeMAOTrend', data.trends.mao_count);
                    updateTrendBadge('activeEncodersTrend', data.trends.encoder_count);
                    updateTrendBadge('activeVerifiersTrend', data.trends.verifier_count);
                }
            }
        })
        .catch(error => console.error('Error loading stats:', error));
}

// function updateTrendBadge and animateCount are provided by dashboard-common.js

// ── User Management ──
function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7"><div class="loading-spinner"></div></td></tr>';

    fetch('/admin/api/users')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allUsers = data.users;
                renderUsers(allUsers);
                updateAdminCharts(allUsers);
            }
        })
        .catch(error => {
            console.error('Error loading users:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--text-light)">Failed to load users</td></tr>';
        });
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No users found</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    ${user.avatar_url 
                        ? `<img src="${user.avatar_url}" alt="Avatar" style="width:36px;height:36px;border-radius:10px;object-fit:cover;">` 
                        : `<div class="user-avatar-small" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--bg-light);color:var(--primary);border:1px solid var(--border);">
                             <i class="fas ${user.role === 'admin' ? 'fa-user-shield' : 
                                            user.role === 'encoder' ? 'fa-keyboard' : 
                                            user.role === 'verifier' ? 'fa-user-check' : 
                                            user.role === 'mao' ? 'fa-user-tie' : 'fa-user'}" style="font-size: 1rem;"></i>
                           </div>`
                    }
                    <div>
                        <div style="font-weight:600;color:var(--text-dark)">${user.full_name}</div>
                        <div style="font-size:0.8rem;color:var(--text-light)">@${user.username}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge badge-${user.role}">${user.role.toUpperCase()}</span></td>
            <td style="font-size:0.85rem;color:var(--text-light)">${user.email || '—'}</td>
            <td>${user.contact_no || '<span style="color:var(--text-light)">—</span>'}</td>
            <td>
                <div style="display:flex;align-items:center;">
                    <span class="status-dot ${user.is_online ? 'online' : 'offline'}"></span>
                    <span class="status-badge ${user.is_active ? (user.is_online ? 'active' : 'offline') : 'inactive'}">${user.is_active ? (user.is_online ? 'Online' : 'Offline') : 'Inactive'}</span>
                </div>
            </td>
            <td style="color:var(--text-light);font-size:0.85rem">${user.last_activity || 'Never'}</td>
            <td style="color:var(--text-light);font-size:0.85rem">${formatDate(user.created_at)}</td>
            <td>
                <div style="display:flex;gap:0.25rem;">
                    <button class="btn-icon" onclick="editUser(${user.id})" title="Edit User">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-icon delete" onclick="deleteUser(${user.id})" title="Delete User">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ── Create User with Optional Avatar ──
let selectedNewUserFile = null;

window.handleNewUserFile = function(file) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!allowed.includes(file.type)) {
        showFlashMessage('Invalid file type. Use PNG, JPG, or GIF.', 'error');
        document.getElementById('newUserAvatar').value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showFlashMessage('File too large. Maximum 5 MB.', 'error');
        document.getElementById('newUserAvatar').value = '';
        return;
    }
    selectedNewUserFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('newUserAvatarPreview');
        if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="New User Avatar" style="width:100%; height:100%; object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
};

document.getElementById('createUserForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    
    // Frontend Validation
    if (!validateUserForm(formData)) return;

    const password = formData.get('password');
    if (!password) {
        showFlashMessage('Password is required for new users.', 'error');
        return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

    // When making a multipart/form-data fetch request from FormData, do NOT set the Content-Type header.
    // The browser will automatically set it and calculate the required boundary.
    fetch('/admin/api/users', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCSRFToken() },
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeModal('createUserModal');
                loadUsers();
                loadStats();
                this.reset();
                selectedNewUserFile = null;
                const preview = document.getElementById('newUserAvatarPreview');
                if (preview) preview.innerHTML = '<i class="fas fa-user-shield"></i>';
                showFlashMessage('User created successfully', 'success');
            } else {
                showFlashMessage('Error: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error creating user:', error);
            showFlashMessage('Failed to create user', 'error');
        })
        .finally(() => {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create User'; }
        });
});

// ── Edit User with Optional Avatar ──
let selectedEditUserFile = null;

window.handleEditUserFile = function(file) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!allowed.includes(file.type)) {
        showFlashMessage('Invalid file type. Use PNG, JPG, or GIF.', 'error');
        document.getElementById('editUserAvatar').value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showFlashMessage('File too large. Maximum 5 MB.', 'error');
        document.getElementById('editUserAvatar').value = '';
        return;
    }
    selectedEditUserFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('editUserAvatarPreview');
        if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="Edit User Avatar" style="width:100%; height:100%; object-fit:cover;">`;
    };
    reader.readAsDataURL(file);
};

window.editUser = function (id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editFullName').value = user.full_name;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editRoleDisplay').value = user.role;
    document.getElementById('editContactNo').value = user.contact_no || '';
    document.getElementById('editIsActive').value = user.is_active ? 'true' : 'false';

    // Reset and Load Avatar Preview
    selectedEditUserFile = null;
    document.getElementById('editUserAvatar').value = '';
    const preview = document.getElementById('editUserAvatarPreview');
    if (preview) {
        if (user.avatar_url) {
            preview.innerHTML = `<img src="${user.avatar_url}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            // Use role-specific icon for edit preview too
            const roleIcon = user.role === 'admin' ? 'fa-user-shield' : 
                             user.role === 'encoder' ? 'fa-keyboard' : 
                             user.role === 'verifier' ? 'fa-user-check' : 'fa-user-tie';
            preview.innerHTML = `<i class="fas ${roleIcon}"></i>`;
        }
    }

    openModal('editUserModal');
};

document.getElementById('editUserForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    
    // Frontend Validation
    if (!validateUserForm(formData)) return;

    const userId = document.getElementById('editUserId').value;
    const submitBtn = this.querySelector('button[type="submit"]');
    
    // FormData 'is_active' will be "true" or "false" as a string
    // The backend update_user logic now handles string booleans.

    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    fetch(`/admin/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'X-CSRFToken': getCSRFToken() },
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                closeModal('editUserModal');
                loadUsers();
                showFlashMessage('User updated successfully', 'success');
            } else {
                showFlashMessage('Error: ' + data.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showFlashMessage('Failed to update user', 'error');
        })
        .finally(() => {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
        });
});

// Delete User
window.deleteUser = function (id) {
    const user = allUsers.find(u => u.id === id);
    const name = user ? user.full_name : 'this user';

    Swal.fire({
        title: `Delete "${name}"?`,
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e3342f',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/admin/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadUsers();
                        loadStats();
                        showFlashMessage('User deleted successfully', 'success');
                    } else {
                        showFlashMessage('Error: ' + data.message, 'error');
                    }
                })
                .catch(err => {
                    console.error(err);
                    showFlashMessage('Failed to delete user', 'error');
                });
        }
    });
};

// ── Community Members Management ──────────────────────────────────────────
function loadCommunityMembers() {
    const tbody = document.getElementById('communityMembersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/admin/api/community-members')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allCommunityMembers = data.members;
                renderCommunityMembers(allCommunityMembers);
                if (typeof updateAdminCharts === 'function') updateAdminCharts(allUsers);
            }
        })
        .catch(error => {
            console.error('Error loading community members:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load members</td></tr>';
        });
}

function renderCommunityMembers(list) {
    const tbody = document.getElementById('communityMembersTableBody');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-users-slash"></i>
                    <p>No community members found</p>
                </div>
            </td></tr>`;
        return;
    }

    const providerIcon = (provider) => {
        if (provider === 'google') return '<i class="fab fa-google" style="color:#db4437"></i>';
        if (provider === 'facebook') return '<i class="fab fa-facebook" style="color:#4267B2"></i>';
        return '<i class="fas fa-envelope" style="color:var(--primary)"></i>';
    };

    tbody.innerHTML = list.map(m => `
        <tr>
            <td>
                <div style="font-weight:600;color:var(--text-dark)">${m.full_name}</div>
                <div style="font-size:0.8rem;color:var(--text-light)">${m.email}</div>
            </td>
            <td style="text-align:center; font-size:1.1rem">${providerIcon(m.auth_provider)}</td>
            <td>
                <div style="display:flex;align-items:center;">
                    <span class="status-dot ${m.is_online ? 'online' : 'offline'}"></span>
                    <span class="status-badge ${m.is_active ? (m.is_online ? 'active' : 'offline') : 'inactive'}">
                        ${m.is_active ? (m.is_online ? 'Online' : 'Offline') : 'Disabled'}
                    </span>
                </div>
            </td>
            <td style="color:var(--text-light);font-size:0.85rem">${m.last_activity || 'Never'}</td>
            <td style="color:var(--text-light);font-size:0.85rem">${m.last_login_at}</td>
            <td style="color:var(--text-light);font-size:0.85rem">${formatDate(m.created_at)}</td>
            <td>
                <button class="btn-icon ${m.is_active ? 'delete' : ''}" 
                        onclick="toggleMemberStatus(${m.id})" 
                        title="${m.is_active ? 'Disable Account' : 'Enable Account'}">
                    <i class="fas ${m.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

window.toggleMemberStatus = function (id) {
    const member = allCommunityMembers.find(m => m.id === id);
    if (!member) return;

    const action = member.is_active ? 'Disable' : 'Enable';
    
    Swal.fire({
        title: `${action} Account?`,
        text: `Are you sure you want to ${action.toLowerCase()} the account for ${member.full_name}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: member.is_active ? '#e3342f' : '#4F46E5',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `Yes, ${action.toLowerCase()} it!`
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/admin/api/community-members/${id}/toggle-status`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCSRFToken() }
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        showFlashMessage(data.message, 'success');
                        loadCommunityMembers();
                    } else {
                        showFlashMessage(data.message, 'error');
                    }
                })
                .catch(err => {
                    console.error(err);
                    showFlashMessage('Failed to update status', 'error');
                });
        }
    });
};


// ── Admin Dashboard Charts ──────────────────────────────────────────────────
let usersRoleChartInstance = null;
let activityOverviewChartInstance = null;

window.initAdminCharts = function() {
    const roleCtx = document.getElementById('usersRoleChart');
    const activityCtx = document.getElementById('activityOverviewChart');
    
    if (roleCtx) {
        usersRoleChartInstance = new Chart(roleCtx, {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    if (activityCtx) {
        activityOverviewChartInstance = new Chart(activityCtx, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Signups', data: [], backgroundColor: 'rgba(79, 70, 229, 0.8)', borderRadius: 4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

window.updateAdminCharts = function(users) {
    if (!users || !usersRoleChartInstance) return;

    // 1. Users by Role Chart
    const roleCounts = { admin: 0, mao: 0, encoder: 0, verifier: 0 };
    let hasData = false;
    users.forEach(u => {
        if (roleCounts[u.role] !== undefined) {
            roleCounts[u.role]++;
            hasData = true;
        } else if (u.role) {
            roleCounts[u.role] = 1;
            hasData = true;
        }
    });

    // Provide default data if no users exist yet for better visual
    if (!hasData) {
        usersRoleChartInstance.data.labels = ['No Users Yet'];
        usersRoleChartInstance.data.datasets[0] = { data: [1], backgroundColor: ['#E5E7EB'], borderWidth: 0 };
    } else {
        usersRoleChartInstance.data.labels = ['Admin', 'MAO', 'Encoder', 'Verifier'];
        usersRoleChartInstance.data.datasets[0] = {
            data: [roleCounts.admin || 0, roleCounts.mao || 0, roleCounts.encoder || 0, roleCounts.verifier || 0],
            backgroundColor: ['#4F46E5', '#0EA5E9', '#22C55E', '#F59E0B'],
            borderWidth: 0,
            hoverOffset: 4
        };
    }
    usersRoleChartInstance.update();

    // 2. Monthly Signups Chart (Last 6 Months)
    if (!activityOverviewChartInstance) return;
    
    const months = [];
    const counts = [];
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(d.toLocaleString('default', { month: 'short' }));
        counts.push(0);
    }

    // Calculate current users
    users.forEach(u => {
        if (!u.created_at) return;
        const d = new Date(u.created_at);
        const mStr = d.toLocaleString('default', { month: 'short' });
        const idx = months.indexOf(mStr);
        if (idx !== -1) counts[idx]++;
    });

    // Add community members to "Signups"
    if (typeof allCommunityMembers !== 'undefined' && allCommunityMembers.length > 0) {
        allCommunityMembers.forEach(m => {
            if (!m.created_at) return;
            const d = new Date(m.created_at);
            const mStr = d.toLocaleString('default', { month: 'short' });
            const idx = months.indexOf(mStr);
            if (idx !== -1) counts[idx]++;
        });
    }

    activityOverviewChartInstance.data.labels = months;
    activityOverviewChartInstance.data.datasets[0].data = counts;
    activityOverviewChartInstance.update();
}

// ── Trash Bin Functions (Admin Global View) ────────────────────────────────

const TRASH_API_BASE_A = '/admin';

window.openTrashBin = async function() {
    document.getElementById('trashModalOverlay').classList.add('active');
    document.getElementById('trashModalBody').innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i></div>';
    try {
        const res = await fetch(`${TRASH_API_BASE_A}/api/trash`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) renderTrashItemsA(data.items);
    } catch (e) {
        document.getElementById('trashModalBody').innerHTML = '<div class="trash-empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load</h4><p>Please try again</p></div>';
    }
};

window.closeTrashBin = function(e) {
    if (e && e.target && !e.target.classList.contains('trash-modal-overlay')) return;
    document.getElementById('trashModalOverlay').classList.remove('active');
};

function renderTrashItemsA(items) {
    const body = document.getElementById('trashModalBody');
    if (!items || items.length === 0) {
        body.innerHTML = '<div class="trash-empty-state"><i class="fas fa-recycle"></i><h4>Trash is empty</h4><p>Deleted records from all panels will appear here</p></div>';
        return;
    }
    body.innerHTML = items.map(item => {
        const name = item.beneficiary_name || 'Unknown';
        const type = item.form_type || 'rsbsa';
        const deletedAt = item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
        return `
        <div class="trash-item">
            <div class="trash-item-info">
                <div class="trash-item-name">${name}</div>
                <div class="trash-item-meta">
                    <span><i class="fas fa-file-alt"></i> ${type.toUpperCase()}</span>
                    <span><i class="fas fa-user"></i> ${item.encoder_name || 'Unknown'}</span>
                    <span><i class="fas fa-user-slash"></i> By: ${item.deleted_by_name || 'Unknown'}</span>
                    <span><i class="fas fa-trash"></i> ${deletedAt}</span>
                </div>
            </div>
            <div class="trash-item-actions">
                <button class="trash-btn-restore" onclick="restoreFromTrash(${item.id})">
                    <i class="fas fa-undo"></i> Restore
                </button>
                <button class="trash-btn-delete" onclick="permanentDeleteFromTrash(${item.id})">
                    <i class="fas fa-times"></i> Delete
                </button>
            </div>
        </div>`;
    }).join('');
}

window.restoreFromTrash = async function(id) {
    try {
        const res = await fetch(`${TRASH_API_BASE_A}/api/trash/${id}/restore`, {
            method: 'POST', headers: { 'X-CSRFToken': getCSRFToken() }, credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Submission restored', 'success');
            openTrashBin(); loadTrashCount();
        } else showFlashMessage(data.message || 'Restore failed', 'error');
    } catch (e) { showFlashMessage('Network error', 'error'); }
};

window.permanentDeleteFromTrash = async function(id) {
    const result = await Swal.fire({
        title: 'Permanently Delete?',
        text: 'This action cannot be undone! Are you absolutely sure?',
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#e3342f',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete permanently'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`${TRASH_API_BASE_A}/api/trash/${id}/permanent`, {
            method: 'DELETE', headers: { 'X-CSRFToken': getCSRFToken() }, credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Permanently deleted', 'success');
            openTrashBin(); loadTrashCount();
        } else showFlashMessage(data.message || 'Delete failed', 'error');
    } catch (e) { showFlashMessage('Network error', 'error'); }
};

async function loadTrashCount() {
    try {
        const res = await fetch(`${TRASH_API_BASE_A}/api/trash/count`, { credentials: 'include' });
        const data = await res.json();
        const badge = document.getElementById('trashBadge');
        if (badge && data.success) {
            if (data.count > 0) { badge.textContent = data.count; badge.style.display = 'flex'; }
            else badge.style.display = 'none';
        }
    } catch (e) { /* silent */ }
}

/**
 * MAO Dashboard Functionality
 * Handles: stats, analytics charts, registrations table, search & filter
 */

let allRegistrations = [];
let allBeneficiaries = [];

// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadAnalytics();
    loadRegistrations();
    loadBeneficiaries();
    setupSearchAndFilters();
    loadTrashCount();
    initMAOSockets();

    // ── Real-time polling: refresh data every 15 seconds ──
    setInterval(() => {
        loadStats();
        loadRegistrations();
        loadBeneficiaries();
    }, 15000);
});

/**
 * MAO Specific Socket Events
 */
function initMAOSockets() {
    const socket = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!socket) return;

    socket.on('new_submission', (data) => {
        // MAO should see notifications for all new submissions in their muni
        loadStats();
        loadRegistrations();
    });

    socket.on('status_updated', (data) => {
        loadStats();
        loadRegistrations();
        loadBeneficiaries();
    });
}

// ── Search & Filter ──
function setupSearchAndFilters() {
    const searchInput = document.getElementById('searchRegistrations');
    const statusFilter = document.getElementById('filterStatus');
    const typeFilter = document.getElementById('filterType');
    const searchBen = document.getElementById('searchBeneficiaries');

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    if (typeFilter) {
        typeFilter.addEventListener('change', applyFilters);
    }
    if (searchBen) {
        searchBen.addEventListener('input', function () {
            filterBeneficiaries(this.value.toLowerCase());
        });
    }
}

function applyFilters() {
    const term = (document.getElementById('searchRegistrations')?.value || '').toLowerCase();
    const status = (document.getElementById('filterStatus')?.value || '').toLowerCase();
    const type = (document.getElementById('filterType')?.value || '').toLowerCase();

    const filtered = allRegistrations.filter(r => {
        const matchesTerm = (r.beneficiary_name || '').toLowerCase().includes(term) ||
            (r.barangay || '').toLowerCase().includes(term) ||
            (r.rsbsa_id || '').toLowerCase().includes(term);
        
        // Robust status matching
        let rStatus = (r.status || '').toLowerCase();
        if (rStatus === 'pending_verification') rStatus = 'pending';
        
        const matchesStatus = status === '' || rStatus === status;
        const matchesType = type === '' || (r.form_type || '').toLowerCase() === type;
        return matchesTerm && matchesStatus && matchesType;
    });
    renderRegistrations(filtered);
}

function filterBeneficiaries(term) {
    const filtered = allBeneficiaries.filter(b => {
        return b.full_name.toLowerCase().includes(term) ||
            (b.rsbsa_id && b.rsbsa_id.toLowerCase().includes(term));
    });
    renderBeneficiaries(filtered);
}

// ── Stats ──
function loadStats() {
    fetch('/mao/api/stats', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                animateCount('totalRegistrations', data.stats.total || 0);
                animateCount('approvedCount', data.stats.approved || 0);
                animateCount('pendingCount', data.stats.pending || 0); // Verified but not approved
                animateCount('pendingVerificationCount', data.stats.pending_verification || 0); // Not even verified yet
                animateCount('beneficiariesCount', data.stats.beneficiaries || 0);

                if (data.trends) {
                    updateTrendBadge('totalRegistrationsTrend', data.trends.total);
                    updateTrendBadge('approvedCountTrend', data.trends.approved);
                    updateTrendBadge('pendingCountTrend', data.trends.pending);
                    updateTrendBadge('pendingVerificationCountTrend', data.trends.pending_verification);
                    updateTrendBadge('beneficiariesCountTrend', data.trends.beneficiaries);
                }
            }
        })
        .catch(error => console.error('Error loading stats:', error));
}

// updateTrendBadge() and animateCount() are provided by dashboard-common.js



// ── Analytics Charts ──
function loadAnalytics() {
    fetch('/mao/api/analytics', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderCharts(data.analytics);
            }
        })
        .catch(error => console.error('Error loading analytics:', error));
}

function renderCharts(analytics) {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';

    // Helper for destroying existing charts if needed
    if (window.maoCharts) {
        Object.values(window.maoCharts).forEach(chart => chart.destroy());
    }
    window.maoCharts = {};

    // ── 1. Registration Types (Bar) ──
    const typeCtx = document.getElementById('registrationTypeChart')?.getContext('2d');
    if (typeCtx) {
        const typesData = analytics.types || {};
        const labels = Object.keys(typesData).map(k => k.toUpperCase());
        const values = Object.values(typesData);

        const gradient = typeCtx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#3b82f6'); 
        gradient.addColorStop(1, '#60a5fa');

        window.maoCharts.type = new Chart(typeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Registrations',
                    data: values,
                    backgroundColor: gradient,
                    borderRadius: 8,
                    barThickness: 30,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ── 2. Status Distribution (Doughnut) ──
    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        const data = analytics.status || {};
        window.maoCharts.status = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(data).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
                datasets: [{
                    data: Object.values(data),
                    backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#3b82f6'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } }
                }
            }
        });
    }

    // ── 3. Beneficiary Growth (Line) ──
    const growthCtx = document.getElementById('beneficiaryGrowthChart')?.getContext('2d');
    if (growthCtx) {
        const growthData = analytics.growth || {};
        const labels = Object.keys(growthData).sort();
        const values = labels.map(l => growthData[l]);

        const gradient = growthCtx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

        window.maoCharts.growth = new Chart(growthCtx, {
            type: 'line',
            data: {
                labels: labels.map(l => {
                    const [y, m] = l.split('-');
                    return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
                }),
                datasets: [{
                    label: 'Monthly Registrations',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#3b82f6',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ── 4. Barangay Distribution (Horizontal Bar) ──
    const brgyCtx = document.getElementById('barangayChart')?.getContext('2d');
    if (brgyCtx) {
        const data = analytics.barangays || {};
        const labels = Object.keys(data);
        const values = Object.values(data);

        window.maoCharts.brgy = new Chart(brgyCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Beneficiaries',
                    data: values,
                    backgroundColor: '#10b981',
                    borderRadius: 4,
                    indexAxis: 'y',
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // ── 5. Demographic Profile (Radar) ──
    const radarCtx = document.getElementById('demographicRadarChart')?.getContext('2d');
    if (radarCtx) {
        const sexData = analytics.demographics?.sex || {};
        const eduData = analytics.demographics?.education || {};
        
        // We'll normalize these into a single radar view for "Intensity"
        // Or just show Sex distribution in a radar if applicable
        const labels = ['Male', 'Female', 'PWD', '4Ps', 'IP'];
        // Dummy logic to fill radar with something interesting from data
        const values = [
            sexData['Male'] || 0,
            sexData['Female'] || sexData['female'] || 0,
            analytics.status?.approved || 0, // Placeholder for variety
            analytics.types?.rsba || 0,      // Placeholder 
            analytics.types?.fish || 0       // Placeholder
        ];

        window.maoCharts.radar = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Profile Focus',
                    data: values,
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    borderColor: '#8b5cf6',
                    pointBackgroundColor: '#8b5cf6',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        angleLines: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { display: false }
                    }
                }
            }
        });
    }
}

// ── Beneficiary Management ──
function loadBeneficiaries() {
    const tbody = document.getElementById('beneficiariesTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/mao/api/beneficiaries', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allBeneficiaries = data.beneficiaries;
                renderBeneficiaries(allBeneficiaries);
            }
        })
        .catch(error => {
            console.error('Error loading beneficiaries:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load beneficiaries</td></tr>';
        });
}

function renderBeneficiaries(list) {
    const tbody = document.getElementById('beneficiariesTableBody');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No beneficiaries found</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(b => {
        const addr = b.address || {};
        const formattedAddr = [addr.barangay, addr.municipality].filter(Boolean).join(', ') || '—';
        
        return `
            <tr>
                <td><span style="font-family:'JetBrains Mono',monospace;font-size:0.825rem;color:var(--primary);font-weight:600">${b.rsbsa_id || '—'}</span></td>
                <td><span style="font-weight:600;color:var(--text-dark)">${b.full_name}</span></td>
                <td>${formattedAddr}</td>
                <td>${b.mobile_number || '—'}</td>
                <td style="color:var(--text-light);font-size:0.85rem">${formatDate(b.created_at)}</td>
                <td>
                    <div style="display:flex;gap:0.25rem;">
                        <button class="btn-icon" onclick="viewBeneficiary(${b.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.viewBeneficiary = function (id) {
    const b = allBeneficiaries.find(x => x.id === id);
    if (!b) return;

    // We need to find at least ONE approved registration for this beneficiary
    // to show them the PDF view. We can fetch it or use a simplified mock for now.
    // Optimal way: Backend should provide the main Registration ID for the beneficiary.
    
    fetch(`/mao/api/registrations?search=${encodeURIComponent(b.full_name)}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.registrations.length > 0) {
                // Find the latest approved one
                const reg = data.registrations.find(r => r.status === 'approved') || data.registrations[0];
                viewRegistration(reg.id);
            } else {
                showToast('No registration records found for this beneficiary.', 'warning');
            }
        })
        .catch(err => {
            console.error('Error finding registration for beneficiary:', err);
            showToast('Failed to load records.', 'error');
        });
};

// ── Registrations Table ──
function loadRegistrations() {
    const tbody = document.getElementById('registrationsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/mao/api/registrations', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allRegistrations = data.registrations;
                renderRegistrations(allRegistrations);
            }
        })
        .catch(error => {
            console.error('Error loading registrations:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load registrations</td></tr>';
        });
}

function renderRegistrations(list) {
    const tbody = document.getElementById('registrationsTableBody');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>No registrations found</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => `
            <tr data-id="${r.id}" class="${r.status === 'verified' ? 'highlight-row' : ''}">
                <td>
                    <div style="font-weight: 600; color: var(--text-dark); margin-bottom: 2px;">${r.beneficiary_name}</div>
                </td>
                <td><span class="badge badge-type">${r.form_type.toUpperCase()}</span></td>
                <td>${r.barangay}</td>
                <td><span class="status-badge ${r.status}">${formatStatus(r.status)}</span></td>
                <td style="color:var(--text-light);font-size:0.85rem">${formatDate(r.created_at)}</td>
                <td>
                    <div style="display: flex; gap: 0.25rem; align-items: center;">
                        ${r.status !== 'approved' ? `
                            <button class="btn btn-primary btn-sm" onclick="viewRegistration(${r.id})">
                                <i class="fas fa-search"></i> Review
                            </button>
                        ` : `
                            <button class="btn btn-secondary btn-sm print-btn" onclick="printRegistration(${r.id})" title="Print Form">
                                <i class="fas fa-print"></i>
                            </button>
                        `}
                        <button class="btn-icon delete" onclick="softDeleteRegistration(${r.id})" title="Move to Trash">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `
    ).join('');
}

// ── Enhanced Review Modal Tabs & Logic ──
let reviewMap = null;
let reviewDrawnItems = null;

window.switchReviewTab = function(tabName, btn) {
    // Hide all contents
    document.querySelectorAll('.review-tab-content').forEach(el => el.style.display = 'none');
    // Deactivate all buttons
    document.querySelectorAll('.modal-tab-btn').forEach(el => el.classList.remove('active'));

    // Show selected
    const selectedTab = document.getElementById(`reviewTab-${tabName}`);
    if (selectedTab) {
        if (tabName === 'details') selectedTab.style.display = 'block';
        else selectedTab.style.display = 'block'; // form and map are height: 100%
        
        if (tabName === 'map') {
            setTimeout(() => {
                if (reviewMap) reviewMap.invalidateSize();
            }, 100);
        }
    }
    if (btn) btn.classList.add('active');
};

let currentRegId = null; // To store the ID of the registration being reviewed
let pendingMAOAction = null; // 'approved' or 'rejected'

window.promptMAOConfirmModal = function (action) {
    if (!currentRegId) return;

    pendingMAOAction = action;

    // Reset modal fields
    const remarksField = document.getElementById('reviewMAORemarks');
    remarksField.value = '';
    remarksField.classList.remove('error');
    document.getElementById('remarksMAOError').style.display = 'none';

    // Configure Modal UI based on action
    const header = document.getElementById('confirmMAOModalHeader');
    const title = document.getElementById('confirmMAOModalTitle');
    const message = document.getElementById('confirmMAOModalMessage');
    const label = document.getElementById('reviewMAORemarksLabel');
    const btn = document.getElementById('confirmMAOActionBtn');

    if (action === 'approved') {
        header.style.background = '#10b981';
        title.innerHTML = '<i class="fas fa-signature"></i> Final Approval';
        message.innerHTML = 'You are about to provide <strong>Final Approval</strong> for this registration. It will be permanently added to the Registry.';
        label.innerText = 'Approval Remarks / Signature Note (Optional)';
        btn.style.background = '#10b981';
        btn.style.borderColor = '#10b981';
        btn.innerText = 'Confirm Approval';
    } else {
        header.style.background = '#ef4444';
        title.innerHTML = '<i class="fas fa-times-circle"></i> Reject Registration';
        message.innerHTML = 'You are about to <strong>Reject</strong> this registration. It will be returned to the Verifier/Encoder.';
        label.innerHTML = 'Reason for Rejection <span style="color: #ef4444;">*</span>';
        btn.style.background = '#ef4444';
        btn.style.borderColor = '#ef4444';
        btn.innerText = 'Reject & Return';
    }

    openModal('confirmMAOReviewModal');
};

window.proceedMAOSubmission = function() {
    if (!pendingMAOAction || !currentRegId) return;

    const action = pendingMAOAction;
    const remarksField = document.getElementById('reviewMAORemarks');
    let remarks = remarksField.value.trim();

    // Rejection validation
    if (action === 'rejected' && remarks === '') {
        remarksField.style.borderColor = '#ef4444';
        document.getElementById('remarksMAOError').style.display = 'block';
        remarksField.focus();
        showToast('Rejection reason is required', 'warning');
        return;
    }

    // Disable buttons during submit
    const actionBtn = document.getElementById('confirmMAOActionBtn');
    const approveBtn = document.getElementById('maoApproveBtn');
    const rejectBtn = document.getElementById('maoRejectBtn');
    
    if (actionBtn) { actionBtn.disabled = true; actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    fetch(`/mao/api/registrations/${currentRegId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ action: action, remarks: remarks })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeModal('confirmMAOReviewModal');
            closeModal('reviewModal');
            showToast(`Registration successfully ${action}`, 'success');
            loadStats();
            loadRegistrations();
        } else {
            showToast(data.message || 'Review failed', 'error');
            if (actionBtn) { actionBtn.disabled = false; actionBtn.innerText = 'Confirm'; }
            if (approveBtn) approveBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error submitting review:', error);
        showToast('An error occurred during submission.', 'error');
        if (actionBtn) { actionBtn.disabled = false; actionBtn.innerText = 'Confirm'; }
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
    });
};

window.viewRegistration = function (id) {
    currentRegId = id;
    const content = document.getElementById('reviewModalContent');
    const title = document.getElementById('reviewModalTitle');
    const approveBtn = document.getElementById('maoApproveBtn');
    const rejectBtn = document.getElementById('maoRejectBtn');

    if (content) content.innerHTML = '<div class="loading-spinner"></div>';
    if (title) title.innerHTML = `<i class="fas fa-file-invoice"></i> Registration Review`;
    if (approveBtn) approveBtn.style.display = 'none';
    if (rejectBtn) rejectBtn.style.display = 'none';

    // Reset Tabs
    switchReviewTab('details', document.querySelector('.modal-tab-btn'));

    openModal('reviewModal');

    fetch(`/mao/api/registrations/${id}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                if (content) content.innerHTML = '<p class="error">Failed to load registration details.</p>';
                return;
            }

            const reg = data.registration;
            const b = reg.beneficiary || {};
            
            // Show action buttons ONLY if it's verified (ready for MAO)
            if (reg.status === 'verified') {
                if (approveBtn) approveBtn.style.display = 'inline-flex';
                if (rejectBtn) rejectBtn.style.display = 'inline-flex';
            }

            // Parse registration data
            const parsedData = typeof reg.data_json === 'string' ? JSON.parse(reg.data_json) : (reg.data_json || {});

            // ── DETAILS TAB CONTENT ──
            const p = parsedData.personalInfo || {};
            const sf = parsedData.spouseFamily || {};
            const addr = p.address || {};
            const photoSrc = p.photo || b.avatar_url || null;
            
            let html = `
                <div class="mao-review-header" style="grid-template-columns: 120px 1fr 1fr; align-items: center;">
                    <div class="photo-section">
                        <div style="width: 100px; height: 100px; border-radius: 12px; border: 2px solid #e2e8f0; background: #f1f5f9; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${photoSrc ? `<img src="${photoSrc}" style="width: 100%; height: 100%; object-fit: cover;">` : '<i class="fas fa-user-tie" style="font-size: 3rem; color: #cbd5e1;"></i>'}
                        </div>
                    </div>
                    <div class="info-main" style="grid-column: span 2; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div class="detail-group">
                            <label style="display:block; color: #64748b; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Beneficiary Name</label>
                            <div style="font-weight: 800; color: #1e293b; font-size: 1.25rem; line-height: 1.2;">
                                ${b.full_name || (p.firstName ? p.firstName + ' ' + p.surname : 'N/A')}
                            </div>
                        </div>
                        <div class="detail-group">
                            <label style="display:block; color: #64748b; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">RSBSA ID / Reference</label>
                            <div>
                                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #3b82f6;">${b.rsbsa_id || 'REGISTERING'}</span>
                                <span style="font-size: 0.75rem; color: #94a3b8; margin-left: 8px;">#${reg.reference_number || '---'}</span>
                            </div>
                        </div>
                        <div class="detail-group" style="grid-column: span 2;">
                            <label style="display:block; color: #64748b; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Residency Address</label>
                            <div style="color: #475569; font-weight: 600; font-size: 0.9rem;">
                                <i class="fas fa-map-marker-alt" style="color: #ef4444; margin-right: 4px;"></i>
                                ${addr.houseNo ? addr.houseNo + ', ' : ''} ${addr.street ? addr.street + ', ' : ''} 
                                ${addr.barangay || b.barangay || 'N/A'}, ${addr.municipality || 'Mabitac'}, ${addr.province || 'Laguna'}
                            </div>
                        </div>
                        <div class="detail-group">
                            <label style="display:block; color: #64748b; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Contact Information</label>
                            <div style="color: #475569; font-weight: 600; font-size: 0.85rem;">
                                <div><i class="fas fa-phone" style="width: 16px;"></i> ${p.mobileNumber || b.mobile_number || 'No Mobile'}</div>
                                ${p.landlineNumber ? `<div style="font-size: 0.8rem; opacity: 0.8;"><i class="fas fa-tty" style="width: 16px;"></i> ${p.landlineNumber}</div>` : ''}
                            </div>
                        </div>
                        <div class="detail-group">
                            <label style="display:block; color: #64748b; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Status</label>
                            <div><span class="status-badge ${reg.status}">${formatStatus(reg.status)}</span></div>
                        </div>
                    </div>
                </div>

                <div class="mao-data-section">
                    <h4 class="mao-section-title">
                        <i class="fas fa-layer-group" style="color: #10b981;"></i> Farm Parcel Inventory
                    </h4>
                    <div style="box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-radius: 12px; overflow: hidden;">
                        <table class="review-inventory-table">
                            <thead>
                                <tr>
                                    <th style="padding: 1rem;">#</th>
                                    <th>Location (Brgy)</th>
                                    <th style="text-align: center;">Area (ha)</th>
                                    <th>Commodities</th>
                                    <th>Ownership / GPS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${parsedData.parcels?.map((par, i) => `
                                    <tr>
                                        <td style="font-weight: 700; color: #64748b;">${i+1}</td>
                                        <td>
                                            <div style="font-weight: 700; color: #1e293b;">${par.barangay || 'N/A'}</div>
                                            <div style="font-size: 0.7rem; color: #94a3b8;">Parcel ID: ${par.parcelId || 'N/A'}</div>
                                        </td>
                                        <td style="text-align: center; font-weight: 700; color: #10b981;">${par.area || '0.00'}</td>
                                        <td>
                                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                                ${par.crops?.map(c => `<span class="commodity-tag">${c.commodity} ${c.variety ? '| ' + c.variety : ''}</span>`).join('') || '<span style="color: #94a3b8;">None</span>'}
                                            </div>
                                        </td>
                                        <td>
                                            <div style="font-size: 0.75rem; font-weight: 600; color: #475569;">${par.ownershipType || 'N/A'}</div>
                                            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #94a3b8;">
                                                ${par.latitude ? `${par.latitude}, ${par.longitude}` : 'No GPS Encoded'}
                                            </div>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="5" style="padding: 3rem; text-align: center; color: #94a3b8;"><i class="fas fa-ghost fa-2x" style="display:block; margin-bottom: 1rem; opacity: 0.3;"></i>No parcel details available.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="mao-data-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <h4 class="mao-section-title">
                            <i class="fas fa-id-card" style="color: #3b82f6;"></i> Personal Profile
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; background: #f1f5f9; padding: 1rem; border-radius: 12px; font-size: 0.85rem;">
                            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Sex:</span> <span style="font-weight: 600;">${p.sex || 'N/A'}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Birthdate:</span> <span style="font-weight: 600;">${p.dateOfBirth || 'N/A'}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Place of Birth:</span> <span style="font-weight: 600;">${p.placeOfBirth || 'N/A'}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Religion:</span> <span style="font-weight: 600;">${p.religion || 'N/A'}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #64748b;">Civil Status:</span> <span style="font-weight: 600;">${p.civilStatus || 'N/A'}</span></div>
                        </div>
                    </div>
                    <div>
                        <h4 class="mao-section-title">
                            <i class="fas fa-seedling" style="color: #f59e0b;"></i> Livelihood Profile
                        </h4>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            ${parsedData.farmProfile?.livelihood?.map(l => `
                                <span class="badge-livelihood">
                                    <i class="fas fa-check-circle"></i> ${l}
                                </span>
                            `).join('') || '<span style="color: #94a3b8;">No profile details</span>'}
                        </div>
                        <div style="margin-top: 1rem; padding: 1.25rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <div style="font-size: 0.7rem; color: #92400e; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Annual Farming Income</div>
                                <div style="font-size: 1.1rem; font-weight: 800; color: #b45309;">
                                    ${parsedData.farmProfile?.farmingIncome ? '₱' + Number(parsedData.farmProfile.farmingIncome).toLocaleString() : '<span style="color: #d97706; font-style: italic; font-weight: 400; font-size: 0.85rem;">Not Specified</span>'}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #4b5563; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Non-Farming Income</div>
                                <div style="font-size: 1.1rem; font-weight: 800; color: #1f2937;">
                                    ${parsedData.farmProfile?.nonFarmingIncome ? '₱' + Number(parsedData.farmProfile.nonFarmingIncome).toLocaleString() : '<span style="color: #9ca3af; font-style: italic; font-weight: 400; font-size: 0.85rem;">None</span>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            if (content) content.innerHTML = html;

            // ── FORM VIEW TAB ──
            loadFormPdf(reg);

            // ── MAP VIEW TAB ──
            initReviewMap(reg.geo_data, parsedData.gis);
        })
        .catch(err => {
            console.error('Error fetching registration:', err);
            if (content) content.innerHTML = '<p class="error">An error occurred while loading details.</p>';
        });
};

let currentPdfUrl = null;

function loadFormPdf(reg) {
    const iframe = document.getElementById('reviewPdfFrame');
    if (!iframe) return;

    // Cleanup previous PDF URL
    if (currentPdfUrl) {
        URL.revokeObjectURL(currentPdfUrl);
        currentPdfUrl = null;
    }

    iframe.src = 'about:blank';
    
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const type = reg.form_type || 'rsbsa';
    
    let parsedData = reg.data_json;
    if (typeof parsedData === 'string') {
        try {
            parsedData = JSON.parse(parsedData);
        } catch (e) {
            console.error("JSON parse error for data_json", e);
            parsedData = {};
        }
    }

    // Determine PDF endpoint
    const endpoint = type === 'fish' ? '/forms/download/fish-registration'
                   : type === 'boat' ? '/forms/download/boat-registration'
                   : type === 'ncfrs' ? '/forms/download/ncfrs'
                   : '/forms/download/rsba-enrollment';

    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(parsedData)
    })
    .then(res => {
        if (!res.ok) throw new Error('PDF production failed');
        return res.blob();
    })
    .then(blob => {
        currentPdfUrl = URL.createObjectURL(blob);
        iframe.src = `${currentPdfUrl}#toolbar=0&navpanes=0&scrollbar=1`;
    })
    .catch(err => {
        console.error('PDF error:', err);
        if (iframe.contentDocument) {
            iframe.contentDocument.body.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:white; font-family:sans-serif; background: #525659; text-align: center; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size:3rem; margin-bottom:1rem; color: #fbbf24;"></i>
                    <h3 style="margin: 0 0 0.5rem 0;">Preview Unavailable</h3>
                    <p style="opacity: 0.8; max-width: 300px;">We couldn't generate the PDF preview for this registration.</p>
                </div>`;
        }
    });
}

function initReviewMap(geoData, gisInfo) {
    const container = document.getElementById('reviewMapContainer');
    if (!container) return;

    if (reviewMap) {
        reviewMap.remove();
        reviewMap = null;
    }

    // Initialize map
    reviewMap = L.map('reviewMapContainer', {
        zoomControl: false, // Cleaner look
        dragging: true,
        scrollWheelZoom: true
    }).setView([14.4335, 121.4333], 15);
    
    // Add professional light tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(reviewMap);

    // Re-add zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(reviewMap);

    reviewDrawnItems = new L.FeatureGroup().addTo(reviewMap);

    // Update overlay info
    const infoContent = document.getElementById('mapInfoContent');
    if (infoContent) {
        let gisHtml = '';
        if (gisInfo) {
            gisHtml = `
                <div style="margin-bottom: 0.6rem;"><strong><i class="fas fa-location-arrow"></i> Latitude:</strong> <span style="float:right;">${gisInfo.latitude || 'N/A'}</span></div>
                <div style="margin-bottom: 0.6rem;"><strong><i class="fas fa-location-arrow"></i> Longitude:</strong> <span style="float:right;">${gisInfo.longitude || 'N/A'}</span></div>
                <div style="margin-bottom: 0.6rem;"><strong><i class="fas fa-satellite"></i> Source:</strong> <span style="float:right;">${gisInfo.source || 'Manual Entry'}</span></div>
            `;
        }

        if (geoData) {
            try {
                const geo = typeof geoData === 'string' ? JSON.parse(geoData) : geoData;
                
                // MULTI-PARCEL HANDLER
                if (geo && typeof geo === 'object' && !geo.type) {
                    // Iterate through the index-to-geojson map
                    Object.values(geo).forEach((parcelGeo, idx) => {
                        if (!parcelGeo) return;
                        L.geoJSON(parcelGeo, {
                            style: {
                                color: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][idx % 5], // Unique colors
                                weight: 4,
                                opacity: 0.9,
                                fillOpacity: 0.25,
                                dashArray: '5, 5'
                            }
                        }).addTo(reviewDrawnItems);
                    });
                } else {
                    // Legacy single polygon fallback
                    L.geoJSON(geo, {
                        style: {
                            color: '#10b981',
                            weight: 4,
                            opacity: 0.9,
                            fillOpacity: 0.25,
                            dashArray: '5, 5'
                        }
                    }).addTo(reviewDrawnItems);
                }
                
                if (reviewDrawnItems.getLayers().length > 0) {
                    reviewMap.fitBounds(reviewDrawnItems.getBounds(), { padding: [50, 50] });
                }
                
                gisHtml += `
                    <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; color: #10b981; font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-check-circle"></i> ${Object.keys(geo || {}).length} Parcel Boundaries Loaded
                    </div>`;
            } catch (e) {
                console.error("Map parse error", e);
                gisHtml += `<div style="color: #ef4444; margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 0.5rem;">Error loading boundary data</div>`;
            }
        } else {
            gisHtml += `<div style="color: #94a3b8; font-style: italic; margin-top: 1rem; border-top: 1px solid #e2e8f0; padding-top: 0.5rem; text-align: center;">No parcel boundary coordinates.</div>`;
        }
        
        infoContent.innerHTML = gisHtml;
    }
}

// ── Global Cleanup for Modals ──
const originalCloseModal = window.closeModal;
window.closeModal = function(id) {
    if (id === 'reviewModal') {
        if (currentPdfUrl) {
            URL.revokeObjectURL(currentPdfUrl);
            currentPdfUrl = null;
        }
        const iframe = document.getElementById('reviewPdfFrame');
        if (iframe) iframe.src = 'about:blank';
        
        if (reviewMap) {
            reviewMap.remove();
            reviewMap = null;
        }
    }
    originalCloseModal(id);
};

function formatStatus(status) {
    if (!status) return 'Unknown';
    const s = status.toLowerCase();
    switch(s) {
        case 'pending':
        case 'pending_verification': 
            return 'Pending (Review Required)';
        case 'verified': return 'Verified (Awaiting MAO)';
        case 'approved': return 'Approved ✓';
        case 'rejected': return 'Rejected ✗';
        default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
}

window.printRegistration = function (id) {
    const csrfToken = getCSRFToken();
    showFlashMessage('Preparing document for printing...', 'info');

    // 1. Fetch metadata to get form type
    fetch(`/mao/api/registrations/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) throw new Error('Failed to load registration');
            const reg = data.registration;
            const type = reg.form_type;
            const parsed = typeof reg.data_json === 'string' ? JSON.parse(reg.data_json) : (reg.data_json || {});

            const downloadUrl = type === 'fish' ? '/forms/download/fish-registration'
                : type === 'boat' ? '/forms/download/boat-registration'
                    : type === 'ncfrs' ? '/forms/download/ncfrs'
                        : '/forms/download/rsba-enrollment';

            // 2. Fetch PDF blob
            return fetch(downloadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(parsed),
            });
        })
        .then(res => {
            if (!res.ok) throw new Error('PDF generation failed');
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            
            // 3. Create a hidden iframe for printing
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = url;
            document.body.appendChild(iframe);

            iframe.onload = function() {
                setTimeout(() => {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                    // Optional: remove iframe after a delay
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                        URL.revokeObjectURL(url);
                    }, 1000);
                }, 500);
            };
        })
        .catch(err => {
            console.error(err);
            showFlashMessage('Print failed: ' + err.message, 'error');
        });
};

window.downloadRegistrationPdf = function (id, formType, fileName) {
    const csrfToken = getCSRFToken();

    // Fetch full data again or pass it
    fetch(`/mao/api/registrations/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            const reg = data.registration;
            const parsed = typeof reg.data_json === 'string' ? JSON.parse(reg.data_json) : (reg.data_json || {});

            const downloadUrl = formType === 'fish' ? '/forms/download/fish-registration'
                : formType === 'boat' ? '/forms/download/boat-registration'
                    : formType === 'ncfrs' ? '/forms/download/ncfrs'
                        : '/forms/download/rsba-enrollment';

            return fetch(downloadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(parsed),
            });
        })
        .then(res => {
            if (!res || !res.ok) throw new Error('PDF generation failed');
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `${formType.toUpperCase()}_Registration_${id}_${safeName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        })
        .catch(err => alert('PDF download failed: ' + err.message));
};

// ── Export Report ──
window.exportReport = async function () {
    const btn = document.querySelector('button[onclick="exportReport()"]');
    const originalHtml = btn.innerHTML;
    const search = document.getElementById('searchRegistrations')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const formType = document.getElementById('filterType')?.value || '';

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
        
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (formType) params.append('form_type', formType);
        
        const response = await fetch(`/mao/api/registrations/export?${params.toString()}`);
        if (!response.ok) throw new Error('Export failed');
        
        // Use the same download handler as verifier (helper below)
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `mao_export_${new Date().toISOString().slice(0,10)}.csv`;
        if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
        }
        
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showToast('Report exported successfully!', 'success');
    } catch (e) {
        console.error(e);
        showToast('Export failed', 'error');
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }, 500);
    }
};

// Helper for toast (fallback if not defined)
function showToast(msg, type) {
    if (window.showFlashMessage) {
        window.showFlashMessage(msg, type);
    } else {
        alert(msg);
    }
}

// ═══════════════════════════════════════════════════════
// System Settings — Profile, Password, Account Deletion
// ═══════════════════════════════════════════════════════


// ── Trash Bin Functions ─────────────────────────────────────────────────────

const TRASH_API_BASE_M = '/mao';

window.softDeleteRegistration = async function(id) {
    const result = await Swal.fire({
        title: 'Move to Trash?',
        text: 'You can restore it later from the Trash Bin.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e3342f',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, move it'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`${TRASH_API_BASE_M}/api/registrations/${id}/soft-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Registration moved to trash', 'success');
            loadRegistrations();
            loadStats();
            loadTrashCount();
        } else {
            showFlashMessage(data.message || 'Failed to delete', 'error');
        }
    } catch (e) {
        showFlashMessage('Network error', 'error');
    }
};

window.openTrashBin = async function() {
    document.getElementById('trashModalOverlay').classList.add('active');
    document.getElementById('trashModalBody').innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i></div>';
    try {
        const res = await fetch(`${TRASH_API_BASE_M}/api/trash`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) renderTrashItemsM(data.items);
    } catch (e) {
        document.getElementById('trashModalBody').innerHTML = '<div class="trash-empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load</h4><p>Please try again</p></div>';
    }
};

window.closeTrashBin = function(e) {
    if (e && e.target && !e.target.classList.contains('trash-modal-overlay')) return;
    document.getElementById('trashModalOverlay').classList.remove('active');
};

function renderTrashItemsM(items) {
    const body = document.getElementById('trashModalBody');
    if (!items || items.length === 0) {
        body.innerHTML = '<div class="trash-empty-state"><i class="fas fa-recycle"></i><h4>Trash is empty</h4><p>Deleted registrations will appear here</p></div>';
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
                    <span><i class="fas fa-trash"></i> Deleted ${deletedAt}</span>
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
        const res = await fetch(`${TRASH_API_BASE_M}/api/trash/${id}/restore`, {
            method: 'POST', headers: { 'X-CSRFToken': getCSRFToken() }, credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Registration restored', 'success');
            openTrashBin(); loadRegistrations(); loadStats(); loadTrashCount();
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
        const res = await fetch(`${TRASH_API_BASE_M}/api/trash/${id}/permanent`, {
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
        const res = await fetch(`${TRASH_API_BASE_M}/api/trash/count`, { credentials: 'include' });
        const data = await res.json();
        const badge = document.getElementById('trashBadge');
        if (badge && data.success) {
            if (data.count > 0) { badge.textContent = data.count; badge.style.display = 'flex'; }
            else badge.style.display = 'none';
        }
    } catch (e) { /* silent */ }
}

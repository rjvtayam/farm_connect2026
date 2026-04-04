/**
 * MAO Dashboard Functionality
 * Handles: stats, analytics charts, registrations table, search & filter
 */

let allRegistrations = [];
let allBeneficiaries = [];

// ── Pagination State ──
let regPage = 1;
let regPageSize = 25;
let benPage = 1;
let benPageSize = 25;
let currentFilteredRegs = [];
let currentFilteredBens = [];

// ── Sort State ──
let regSortCol = null;  // 'name' | 'type' | 'status' | 'date'
let regSortDir = 'asc'; // 'asc' | 'desc'

// Track custom dropdown state
let _brgyState = {
    brgyDropdownRegistrations: '',
    brgyDropdownBeneficiaries: ''
};

// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadAnalytics();
    loadRegistrations();
    loadBeneficiaries();
    setupSearchAndFilters();
    loadTrashCount();
    initMAOSockets();
    initSortHeaders();
    initSelectAll();

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.brgy-dropdown')) {
            document.querySelectorAll('.brgy-dropdown.open').forEach(el => el.classList.remove('open'));
        }
    });

    // Pre-seed barangay dropdowns with Mabitac official barangays immediately
    populateBarangayDropdown('brgyDropdownRegistrations');
    populateBarangayDropdown('brgyDropdownBeneficiaries');

    // ── Real-time polling: refresh data every 15 seconds ──
    setInterval(() => {
        loadStats(true);
        loadRegistrations(true);
        loadBeneficiaries(true);
    }, 15000);
});

/**
 * MAO Specific Socket Events
 */
function initMAOSockets() {
    const socket = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!socket) return;

    socket.on('new_submission', (data) => {
        loadStats(true);
        loadRegistrations(true);
    });

    socket.on('status_updated', (data) => {
        loadStats(true);
        loadRegistrations(true);
        loadBeneficiaries(true);
    });
}

/**
 * Helper to convert strings to Title Case
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

const MABITAC_BARANGAYS = [
    'Amuyong', 'Antonio', 'Bayanihan', 'Cagalitan', 'Calumpang',
    'Laguan', 'Laguio', 'Libis ng Nayon', 'Lucong', 'Mabitac',
    'Masikap', 'Matalatala', 'Nanguma', 'Paagahan', 'Pag-asa',
    'Pagalanggang', 'San Roque', 'Sinagtala', 'Maligaya', 'Other'
];

/**
 * Populate a custom barangay dropdown list.
 */
function populateBarangayDropdown(dropdownId) {
    const listEl = document.querySelector(`#${dropdownId} .brgy-list`);
    if (!listEl) return;

    const currentValue = _brgyState[dropdownId] || '';

    let html = `
        <div class="brgy-list-item ${!currentValue ? 'selected' : ''}" 
             onclick="selectBrgy('${dropdownId}', '', 'All Barangays')">
             All Barangays
        </div>
    `;

    MABITAC_BARANGAYS.forEach(b => {
        const val = b.toLowerCase();
        html += `
            <div class="brgy-list-item ${currentValue === val ? 'selected' : ''}" 
                 onclick="selectBrgy('${dropdownId}', '${val}', '${b}')">
                 ${b}
            </div>
        `;
    });

    listEl.innerHTML = html;
}

// ── Custom Dropdown Actions ──

window.toggleBrgyDropdown = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.classList.contains('open');

    document.querySelectorAll('.brgy-dropdown.open').forEach(d => {
        if (d.id !== id) d.classList.remove('open');
    });

    el.classList.toggle('open');

    if (!isOpen) {
        setTimeout(() => {
            el.querySelector('.brgy-search-wrap input')?.focus();
        }, 50);
    }
};

window.filterBrgyList = function (dropdownId, term) {
    const listEl = document.querySelector(`#${dropdownId} .brgy-list`);
    const items = listEl?.querySelectorAll('.brgy-list-item');
    if (!items) return;
    const cleanTerm = term.toLowerCase().trim();
    let count = 0;

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(cleanTerm)) {
            item.style.display = 'flex';
            count++;
        } else {
            item.style.display = 'none';
        }
    });

    let noRes = listEl.querySelector('.brgy-no-results');
    if (count === 0) {
        if (!noRes) {
            noRes = document.createElement('div');
            noRes.className = 'brgy-no-results';
            noRes.textContent = 'No matching barangays';
            listEl.appendChild(noRes);
        }
    } else if (noRes) {
        noRes.remove();
    }
};

window.selectBrgy = function (dropdownId, value, label) {
    _brgyState[dropdownId] = value;

    const labelId = dropdownId.replace('Dropdown', 'Label');
    const labelEl = document.getElementById(labelId);
    if (labelEl) labelEl.textContent = label;

    populateBarangayDropdown(dropdownId);
    document.getElementById(dropdownId)?.classList.remove('open');

    if (dropdownId === 'brgyDropdownRegistrations') {
        const specify = document.getElementById('specifyOtherRegistrations');
        if (specify) {
            specify.style.display = value === 'other' ? 'inline-block' : 'none';
            if (value !== 'other') specify.value = '';
        }
        applyFilters();
    } else {
        const specifyBen = document.getElementById('specifyOtherBeneficiaries');
        if (specifyBen) {
            specifyBen.style.display = value === 'other' ? 'inline-block' : 'none';
            if (value !== 'other') specifyBen.value = '';
        }
        applyBeneficiaryFilters();
    }
};

function setupSearchAndFilters() {
    const searchInput = document.getElementById('searchRegistrations');
    const statusFilter = document.getElementById('filterStatus');
    const typeFilter = document.getElementById('filterType');
    const specifyOtherReg = document.getElementById('specifyOtherRegistrations');

    const searchBen = document.getElementById('searchBeneficiaries');
    const specifyOtherBen = document.getElementById('specifyOtherBeneficiaries');

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (specifyOtherReg) specifyOtherReg.addEventListener('input', applyFilters);

    if (searchBen) searchBen.addEventListener('input', applyBeneficiaryFilters);
    if (specifyOtherBen) specifyOtherBen.addEventListener('input', applyBeneficiaryFilters);
}

function applyFilters() {
    const term = (document.getElementById('searchRegistrations')?.value || '').toLowerCase();
    const status = (document.getElementById('filterStatus')?.value || '').toLowerCase();
    const type = (document.getElementById('filterType')?.value || '').toLowerCase();
    const barangay = (_brgyState.brgyDropdownRegistrations || '').toLowerCase();
    const specify = (document.getElementById('specifyOtherRegistrations')?.value || '').toLowerCase().trim();

    const officialBrgysLower = MABITAC_BARANGAYS.filter(b => b !== 'Other').map(b => b.toLowerCase());

    const filtered = allRegistrations.filter(r => {
        const matchesTerm = (r.beneficiary_name || '').toLowerCase().includes(term) ||
            (r.barangay || '').toLowerCase().includes(term) ||
            (r.rsbsa_id || '').toLowerCase().includes(term);

        let rStatus = (r.status || '').toLowerCase();
        if (rStatus === 'pending_verification') rStatus = 'pending';

        const matchesStatus = status === '' || rStatus === status;
        const matchesType = type === '' || (r.form_type || '').toLowerCase() === type;

        let matchesBarangay = true;
        if (barangay !== '') {
            const rBrgy = (r.barangay || '').toLowerCase();
            if (barangay === 'other') {
                const isOutside = !officialBrgysLower.includes(rBrgy);
                matchesBarangay = specify ? isOutside && rBrgy.includes(specify) : isOutside;
            } else {
                matchesBarangay = rBrgy === barangay;
            }
        }

        return matchesTerm && matchesStatus && matchesType && matchesBarangay;
    });

    // Apply current sort
    currentFilteredRegs = applySortToRegs(filtered);
    regPage = 1; // Reset to first page on any filter change
    renderRegistrationPage();
}

function applyBeneficiaryFilters() {
    const term = (document.getElementById('searchBeneficiaries')?.value || '').toLowerCase();
    const barangay = (_brgyState.brgyDropdownBeneficiaries || '').toLowerCase();
    const specify = (document.getElementById('specifyOtherBeneficiaries')?.value || '').toLowerCase().trim();
    const officialBrgysLower = MABITAC_BARANGAYS.filter(b => b !== 'Other').map(b => b.toLowerCase());

    const filtered = allBeneficiaries.filter(b => {
        const addr = b.address || {};
        const bBarangay = (addr.barangay || b.barangay || '').toLowerCase();
        const matchesTerm = (b.full_name || '').toLowerCase().includes(term) ||
            (b.rsbsa_id || '').toLowerCase().includes(term);

        let matchesBarangay = true;
        if (barangay !== '') {
            if (barangay === 'other') {
                const isOutside = !officialBrgysLower.includes(bBarangay);
                matchesBarangay = specify ? isOutside && bBarangay.includes(specify) : isOutside;
            } else {
                matchesBarangay = bBarangay === barangay;
            }
        }

        return matchesTerm && matchesBarangay;
    });

    currentFilteredBens = filtered;
    benPage = 1; // Reset to page 1 on filter change
    renderBeneficiaryPage();
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

// Fixed semantic colors: status key → color (never positional)
const STATUS_COLOR_MAP = {
    'approved': { bg: '#10b981', light: 'rgba(16,185,129,0.12)', label: 'Approved' },
    'rejected': { bg: '#ef4444', light: 'rgba(239,68,68,0.12)', label: 'Rejected' },
    'pending': { bg: '#f59e0b', light: 'rgba(245,158,11,0.12)', label: 'Pending' },
    'verified': { bg: '#3b82f6', light: 'rgba(59,130,246,0.12)', label: 'Pending' }, /* Verified by verifier, pending MAO */
    'returned': { bg: '#8b5cf6', light: 'rgba(139,92,246,0.12)', label: 'Returned' },
    'pending_verification': { bg: '#f59e0b', light: 'rgba(245,158,11,0.12)', label: 'Pending' },
};

// Curated multi-color palette for form types
const TYPE_COLOR_MAP = {
    'rsbsa': '#3b82f6',
    'fish': '#06b6d4',
    'boat': '#8b5cf6',
    'ncfrs': '#f59e0b',
};

// 14-color palette for barangay bars (Mabitac-themed, vibrant but harmonious)
const BRGY_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#a855f7', '#eab308', '#22d3ee', '#fb923c'
];

function loadAnalytics() {
    fetch('/mao/api/analytics', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.analytics) {
                const newDataStr = JSON.stringify(data.analytics);

                // Prevent destroying and re-rendering charts if data hasn't changed
                if (window._lastMaoAnalyticsStr !== newDataStr) {
                    window._lastMaoAnalyticsStr = newDataStr;
                    renderCharts(data.analytics);
                    populateAnalyticsKPIs(data.analytics);
                }

                // Update "Last Updated" timestamp
                const lastUpdatedEl = document.getElementById('analyticsLastUpdated');
                if (lastUpdatedEl) {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    lastUpdatedEl.textContent = `Updated ${timeStr}`;
                    lastUpdatedEl.title = `Data last fetched at ${now.toLocaleString()}`;
                }
            }
        })
        .catch(error => console.error('Error loading analytics:', error));
}

/**
 * Populate the KPI chips in the analytics controls bar from status data.
 */
function populateAnalyticsKPIs(analytics) {
    const statusData = analytics.status || {};

    const approved = statusData['approved'] || 0;
    const rejected = statusData['rejected'] || 0;
    const pending = (statusData['pending'] || 0) + (statusData['pending_verification'] || 0);
    const verified = statusData['verified'] || 0;

    const kpiApproved = document.getElementById('kpiApproved');
    const kpiPending = document.getElementById('kpiPending');
    const kpiRejected = document.getElementById('kpiRejected');
    const kpiVerified = document.getElementById('kpiVerified');
    const kpiRate = document.getElementById('maoKpiRate');

    if (kpiApproved) kpiApproved.textContent = approved.toLocaleString();
    if (kpiPending) kpiPending.textContent = pending.toLocaleString();
    if (kpiRejected) kpiRejected.textContent = rejected.toLocaleString();
    if (kpiVerified) kpiVerified.textContent = verified.toLocaleString();
    
    if (kpiRate) {
        const total = Object.values(statusData).reduce((s, v) => s + v, 0);
        const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
        kpiRate.textContent = `${rate}%`;
    }

    // Update year badge
    const growth = analytics.growth || {};
    const yearLabel = document.getElementById('analyticsYearLabel');
    if (yearLabel && growth.current_year) {
        yearLabel.textContent = `${growth.last_year} vs ${growth.current_year}`;
    }
}

/**
 * Shared custom tooltip style factory for Chart.js
 */
function makeTooltip(extraCallbacks) {
    return {
        enabled: false,
        external: function (context) {
            let tooltipEl = document.getElementById('mao-chart-tooltip');
            if (!tooltipEl) {
                tooltipEl = document.createElement('div');
                tooltipEl.id = 'mao-chart-tooltip';
                tooltipEl.style.cssText = [
                    'position:absolute', 'background:rgba(15,23,42,0.93)', 'color:#f1f5f9',
                    'border-radius:10px', 'padding:10px 14px', 'font-size:0.8rem', 'pointer-events:none',
                    'box-shadow:0 8px 24px rgba(0,0,0,0.25)', 'z-index:9999', 'white-space:nowrap',
                    'font-family:Inter,sans-serif', 'transition:opacity 0.15s', 'line-height:1.6'
                ].join(';');
                document.body.appendChild(tooltipEl);
            }

            const model = context.tooltip;
            if (model.opacity === 0) {
                tooltipEl.style.opacity = '0';
                return;
            }

            // Build HTML
            let html = '';
            if (model.title?.length) {
                html += `<div style="font-weight:700;margin-bottom:4px;color:#e2e8f0">${model.title[0]}</div>`;
            }
            model.body?.forEach((b, i) => {
                const color = model.labelColors?.[i]?.backgroundColor || '#94a3b8';
                const colorStr = typeof color === 'string' ? color : '#94a3b8';
                html += `<div style="display:flex;align-items:center;gap:6px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colorStr};flex-shrink:0"></span>
                    <span>${b.lines?.join('') || ''}</span>
                </div>`;
            });

            if (extraCallbacks?.afterBody) {
                html += extraCallbacks.afterBody(model);
            }

            tooltipEl.innerHTML = html;
            tooltipEl.style.opacity = '1';

            const pos = context.chart.canvas.getBoundingClientRect();
            tooltipEl.style.left = (pos.left + window.scrollX + model.caretX + 12) + 'px';
            tooltipEl.style.top = (pos.top + window.scrollY + model.caretY - 10) + 'px';
        }
    };
}

function renderCharts(analytics) {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';
    Chart.defaults.animation = { duration: 800, easing: 'easeInOutQuart' };

    // Destroy all old chart instances before re-creating
    if (window.maoCharts) {
        Object.values(window.maoCharts).forEach(c => { try { c.destroy(); } catch (e) { } });
    }
    window.maoCharts = {};

    const isDark = document.documentElement.dataset.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    // ─────────────────────────────────────────────────────────────
    // 1. MONTHLY YEAR-OVER-YEAR COMPARISON (Line — Full Width)
    // ─────────────────────────────────────────────────────────────
    const monthlyCtx = document.getElementById('monthlyComparisonChart')?.getContext('2d');
    if (monthlyCtx) {
        const growth = analytics.growth || {};
        const monthLabels = growth.month_labels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentData = growth.current_data || new Array(12).fill(0);
        const lastData = growth.last_data || new Array(12).fill(0);
        const currentYear = growth.current_year || String(new Date().getFullYear());
        const lastYear = growth.last_year || String(new Date().getFullYear() - 1);

        // Gradient fill for current year
        const gradCurrent = monthlyCtx.createLinearGradient(0, 0, 0, 400);
        gradCurrent.addColorStop(0, 'rgba(59,130,246,0.25)');
        gradCurrent.addColorStop(1, 'rgba(59,130,246,0)');

        const gradLast = monthlyCtx.createLinearGradient(0, 0, 0, 400);
        gradLast.addColorStop(0, 'rgba(148,163,184,0.18)');
        gradLast.addColorStop(1, 'rgba(148,163,184,0)');

        window.maoCharts.monthly = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: monthLabels,
                datasets: [
                    {
                        label: currentYear,
                        data: currentData,
                        borderColor: '#3b82f6',
                        backgroundColor: gradCurrent,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#3b82f6',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointHoverBackgroundColor: '#3b82f6',
                    },
                    {
                        label: lastYear,
                        data: lastData,
                        borderColor: '#94a3b8',
                        backgroundColor: gradLast,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#94a3b8',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#94a3b8',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.93)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 10,
                        boxPadding: 5,
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} registrations`,
                            afterBody: items => {
                                const a = items[0]?.parsed.y || 0;
                                const b = items[1]?.parsed.y || 0;
                                if (b === 0) return a > 0 ? [`\n  ↑ New this year`] : [];
                                const diff = a - b;
                                const pct = Math.round((diff / b) * 100);
                                const arrow = diff >= 0 ? '↑' : '↓';
                                const color = diff >= 0 ? '#10b981' : '#ef4444';
                                return [`\n  ${arrow} ${Math.abs(pct)}% vs last year`];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { color: tickColor, stepSize: 1, precision: 0 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor }
                    }
                }
            }
        });

        // Render the inline legend in the card header
        const legendEl = document.getElementById('monthlyLegend');
        if (legendEl) {
            legendEl.innerHTML = `
                <span class="inline-legend-item">
                    <span class="inline-legend-dot" style="background:#3b82f6"></span>
                    ${currentYear}
                </span>
                <span class="inline-legend-item">
                    <span class="inline-legend-dot" style="background:#94a3b8;border-style:dashed"></span>
                    ${lastYear}
                </span>`;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. REGISTRATION BY FORM TYPE (Bar — distinct colors per type)
    // ─────────────────────────────────────────────────────────────
    const typeCtx = document.getElementById('registrationTypeChart')?.getContext('2d');
    if (typeCtx) {
        const typesData = analytics.types || {};
        const typeLabels = Object.keys(typesData).map(k => k.toUpperCase());
        const typeValues = Object.values(typesData);
        const typeBgColors = Object.keys(typesData).map(k => TYPE_COLOR_MAP[k.toLowerCase()] || '#6366f1');

        window.maoCharts.type = new Chart(typeCtx, {
            type: 'bar',
            data: {
                labels: typeLabels,
                datasets: [{
                    label: 'Registrations',
                    data: typeValues,
                    backgroundColor: typeBgColors,
                    borderRadius: 8,
                    barThickness: 40,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.93)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 10,
                        boxPadding: 5,
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y.toLocaleString()} registrations`
                        }
                    },
                    datalabels: false
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { color: tickColor, precision: 0 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor }
                    }
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. STATUS DISTRIBUTION (Doughnut — fixed semantic colors)
    // ─────────────────────────────────────────────────────────────
    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        const rawStatus = analytics.status || {};
        const total = Object.values(rawStatus).reduce((s, v) => s + v, 0);

        // Map each status key to its semantic color — never rely on order
        const statusKeys = Object.keys(rawStatus);
        const statusValues = statusKeys.map(k => rawStatus[k]);
        const statusColors = statusKeys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).bg);
        const statusLabels = statusKeys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).label);

        window.maoCharts.status = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusValues,
                    backgroundColor: statusColors,
                    borderWidth: 3,
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                    hoverOffset: 10,
                    hoverBorderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.93)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 10,
                        boxPadding: 5,
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ${val.toLocaleString()} records (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Render the custom status legend list with counts and percentages
        const legendListEl = document.getElementById('statusLegendList');
        if (legendListEl) {
            legendListEl.innerHTML = statusKeys.map((k, i) => {
                const cfg = STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending'];
                const count = rawStatus[k];
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return `
                    <div class="status-legend-item">
                        <span class="status-legend-dot" style="background:${cfg.bg}"></span>
                        <span class="status-legend-name">${cfg.label}</span>
                        <span class="status-legend-count">${count.toLocaleString()}</span>
                        <span class="status-legend-pct">${pct}%</span>
                    </div>`;
            }).join('') + `
                <div class="status-legend-total">
                    <span>Total</span>
                    <span>${total.toLocaleString()}</span>
                </div>`;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. BARANGAY DISTRIBUTION (Horizontal Bar — unique color per bar)
    // ─────────────────────────────────────────────────────────────
    const brgyCtx = document.getElementById('barangayChart')?.getContext('2d');
    if (brgyCtx) {
        const brgyData = analytics.barangays || {};
        const brgyLabels = Object.keys(brgyData).map(b => b ? b.charAt(0).toUpperCase() + b.slice(1) : '—');
        const brgyValues = Object.values(brgyData);
        const brgyColors = brgyLabels.map((_, i) => BRGY_PALETTE[i % BRGY_PALETTE.length]);

        window.maoCharts.brgy = new Chart(brgyCtx, {
            type: 'bar',
            data: {
                labels: brgyLabels,
                datasets: [{
                    label: 'Registrations',
                    data: brgyValues,
                    backgroundColor: brgyColors,
                    borderRadius: { topRight: 6, bottomRight: 6 },
                    borderSkipped: 'left',
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.93)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 10,
                        boxPadding: 5,
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.x.toLocaleString()} registrations`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { color: tickColor, precision: 0 }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: tickColor, font: { weight: '600' } }
                    }
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. DEMOGRAPHIC PROFILE (Radar — real data)
    // ─────────────────────────────────────────────────────────────
    const radarCtx = document.getElementById('demographicRadarChart')?.getContext('2d');
    if (radarCtx) {
        const demo = analytics.demographics || {};
        const sexData = demo.sex || {};

        // Normalize sex keys (API may return 'Male', 'male', 'M', etc.)
        const maleCount = sexData['Male'] || sexData['male'] || sexData['M'] || 0;
        const femaleCount = sexData['Female'] || sexData['female'] || sexData['F'] || 0;
        const pwdCount = demo.pwd || 0;
        const fourPsCount = demo.four_ps || 0;
        const ipCount = demo.ip || 0;

        const radarLabels = ['Male', 'Female', 'PWD', '4Ps Member', 'IP'];
        const radarValues = [maleCount, femaleCount, pwdCount, fourPsCount, ipCount];

        window.maoCharts.radar = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: radarLabels,
                datasets: [{
                    label: 'Beneficiaries',
                    data: radarValues,
                    backgroundColor: 'rgba(139,92,246,0.18)',
                    borderColor: '#8b5cf6',
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 2.5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.93)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 10,
                        boxPadding: 5,
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.r.toLocaleString()} beneficiaries`
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        angleLines: { color: gridColor },
                        pointLabels: {
                            color: tickColor,
                            font: { size: 12, weight: '600' }
                        },
                        ticks: { display: false, stepSize: 1 }
                    }
                }
            }
        });

        // Render the demographic breakdown sidebar
        const breakdownEl = document.getElementById('demographicBreakdown');
        if (breakdownEl) {
            const total = maleCount + femaleCount;
            const malePct = total > 0 ? Math.round((maleCount / total) * 100) : 0;
            const femalePct = total > 0 ? 100 - malePct : 0;

            breakdownEl.innerHTML = `
                <div class="demo-section-title">Sex Distribution</div>
                <div class="demo-bar-row">
                    <span class="demo-bar-label"><i class="fas fa-mars" style="color:#3b82f6"></i> Male</span>
                    <div class="demo-progress-bar">
                        <div class="demo-progress-fill" style="width:${malePct}%;background:#3b82f6"></div>
                    </div>
                    <span class="demo-bar-count">${maleCount.toLocaleString()} <span class="demo-bar-pct">${malePct}%</span></span>
                </div>
                <div class="demo-bar-row">
                    <span class="demo-bar-label"><i class="fas fa-venus" style="color:#ec4899"></i> Female</span>
                    <div class="demo-progress-bar">
                        <div class="demo-progress-fill" style="width:${femalePct}%;background:#ec4899"></div>
                    </div>
                    <span class="demo-bar-count">${femaleCount.toLocaleString()} <span class="demo-bar-pct">${femalePct}%</span></span>
                </div>
                <div class="demo-section-title" style="margin-top:1.25rem">Special Categories</div>
                <div class="demo-chip-grid">
                    <div class="demo-chip" style="border-color:#8b5cf6;background:rgba(139,92,246,0.08)">
                        <span class="demo-chip-icon" style="color:#8b5cf6"><i class="fas fa-wheelchair"></i></span>
                        <span class="demo-chip-value">${pwdCount.toLocaleString()}</span>
                        <span class="demo-chip-label">PWD</span>
                    </div>
                    <div class="demo-chip" style="border-color:#f59e0b;background:rgba(245,158,11,0.08)">
                        <span class="demo-chip-icon" style="color:#f59e0b"><i class="fas fa-hand-holding-heart"></i></span>
                        <span class="demo-chip-value">${fourPsCount.toLocaleString()}</span>
                        <span class="demo-chip-label">4Ps</span>
                    </div>
                    <div class="demo-chip" style="border-color:#10b981;background:rgba(16,185,129,0.08)">
                        <span class="demo-chip-icon" style="color:#10b981"><i class="fas fa-leaf"></i></span>
                        <span class="demo-chip-value">${ipCount.toLocaleString()}</span>
                        <span class="demo-chip-label">IP</span>
                    </div>
                </div>`;
        }
    }
}



// ── Beneficiary Management ──
function loadBeneficiaries(isBackground = false) {
    const tbody = document.getElementById('beneficiariesTableBody');
    if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/mao/api/beneficiaries', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allBeneficiaries = data.beneficiaries;
                populateBarangayDropdown('brgyDropdownBeneficiaries');
                applyBeneficiaryFilters();
            }
        })
        .catch(error => {
            console.error('Error loading beneficiaries:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load beneficiaries</td></tr>';
        });
}



/**
 * Renders beneficiaries page slice and updates count badge.
 */
function renderBeneficiaries(list) {
    const tbody = document.getElementById('beneficiariesTableBody');
    if (!tbody) return;

    // Update count badge
    const countBadge = document.getElementById('benResultCount');
    if (countBadge) {
        countBadge.textContent = list.length !== allBeneficiaries.length
            ? `${list.length} of ${allBeneficiaries.length}`
            : `${list.length}`;
    }

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
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="viewBeneficiary(${b.id})" title="View Details">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-secondary btn-sm" style="background:#0f172a; color:white; border:none;" onclick="generatePrintableId(${b.id})" title="Print Digital ID">
                            <i class="fas fa-id-badge"></i> Print ID
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Renders the current page of beneficiaries (paginated slice of currentFilteredBens).
 */
function renderBeneficiaryPage() {
    const total = currentFilteredBens.length;
    const totalPages = Math.max(1, Math.ceil(total / benPageSize));
    benPage = Math.min(benPage, totalPages);

    const start = (benPage - 1) * benPageSize;
    const pageSlice = currentFilteredBens.slice(start, start + benPageSize);
    renderBeneficiaries(pageSlice);

    // Build pagination bar (placed after the table container)
    const tableContainer = document.getElementById('beneficiariesTableBody')?.closest('.table-container');
    if (tableContainer) {
        let bar = tableContainer.parentElement.querySelector('.pagination-bar.ben-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'pagination-bar ben-bar';
            tableContainer.parentElement.appendChild(bar);
        }
        bar.innerHTML = buildPaginationHTML(benPage, totalPages, total, benPageSize, start,
            (p) => { benPage = p; renderBeneficiaryPage(); },
            (sz) => { benPageSize = sz; benPage = 1; renderBeneficiaryPage(); },
            'ben'
        );
    }
}

/**
 * Export currently filtered/visible beneficiaries as CSV.
 * Uses the currently rendered rows in the table (respects active filters).
 */
window.exportBeneficiariesCSV = function () {
    const term = (document.getElementById('searchBeneficiaries')?.value || '').toLowerCase();
    const barangay = (_brgyState.brgyDropdownBeneficiaries || '').toLowerCase();
    const specify = (document.getElementById('specifyOtherBeneficiaries')?.value || '').toLowerCase().trim();
    const officialBrgysLower = MABITAC_BARANGAYS.filter(b => b !== 'Other').map(b => b.toLowerCase());

    const list = allBeneficiaries.filter(b => {
        const addr = b.address || {};
        const bBarangay = (addr.barangay || b.barangay || '').toLowerCase();
        const matchesTerm = (b.full_name || '').toLowerCase().includes(term) ||
            (b.rsbsa_id || '').toLowerCase().includes(term);

        let matchesBarangay = true;
        if (barangay !== '') {
            if (barangay === 'other') {
                const isOutside = !officialBrgysLower.includes(bBarangay);
                matchesBarangay = specify ? isOutside && bBarangay.includes(specify) : isOutside;
            } else {
                matchesBarangay = bBarangay === barangay;
            }
        }

        return matchesTerm && matchesBarangay;
    });

    if (!list.length) {
        showToast('No beneficiaries to export.', 'warning');
        return;
    }

    const headers = ['RSBSA ID', 'Full Name', 'Barangay', 'Municipality', 'Mobile', 'Date Created'];
    const rows = list.map(b => {
        const addr = b.address || {};
        return [
            b.rsbsa_id || '',
            b.full_name || '',
            addr.barangay || b.barangay || '',
            addr.municipality || b.municipality || '',
            b.mobile_number || '',
            b.created_at ? new Date(b.created_at).toLocaleDateString() : ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `beneficiaries_export_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${list.length} beneficiaries to CSV.`, 'success');
};

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

/**
 * Opens a new window with the Print-Ready Digital ID blueprint.
 */
window.generatePrintableId = function (id) {
    if (!id) return;
    const url = `/mao/beneficiary/${id}/id-card`;
    window.open(url, '_blank', 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no');
};

// ── Registrations Table ──
function loadRegistrations(isBackground = false) {
    const tbody = document.getElementById('registrationsTableBody');
    if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="7"><div class="loading-spinner"></div></td></tr>';

    fetch('/mao/api/registrations', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allRegistrations = data.registrations;
                populateBarangayDropdown('brgyDropdownRegistrations');
                applyFilters(); // Re-apply current filters seamlessly
            }
        })
        .catch(error => {
            console.error('Error loading registrations:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load registrations</td></tr>';
        });
}

/**
 * Renders a page slice of the registrations list.
 * Includes: checkbox column (verified rows), always-visible View button,
 * Print button for approved rows, result count badge, and pagination bar.
 */
function renderRegistrations(list) {
    const tbody = document.getElementById('registrationsTableBody');
    if (!tbody) return;

    // Update result count badge
    const countBadge = document.getElementById('regResultCount');
    if (countBadge) {
        countBadge.textContent = list.length !== allRegistrations.length
            ? `${list.length} of ${allRegistrations.length}`
            : `${list.length}`;
    }

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>No registrations found</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => {
        // Checkbox: only for 'verified' rows (ready for MAO review + bulk approve)
        const checkboxCell = r.status === 'verified'
            ? `<td class="col-select"><input type="checkbox" class="reg-row-checkbox" data-id="${r.id}" onchange="updateBulkApproveBtn()"></td>`
            : `<td class="col-select"></td>`;

        // View button: always present for all rows
        const viewBtn = `<button class="btn btn-primary btn-sm" onclick="viewRegistration(${r.id})" title="View Details">
                <i class="fas fa-eye"></i>
            </button>`;

        // Print button: only for approved rows
        const printBtn = r.status === 'approved'
            ? `<button class="btn btn-secondary btn-sm print-btn" onclick="printRegistration(${r.id})" title="Print Form">
                <i class="fas fa-print"></i>
            </button>`
            : '';

        const deleteBtn = `<button class="btn btn-danger btn-sm" onclick="softDeleteRegistration(${r.id})" title="Move to Trash">
            <i class="fas fa-trash-alt"></i>
        </button>`;

        return `
            <tr data-id="${r.id}" class="${r.status === 'verified' ? 'highlight-row' : ''}">
                ${checkboxCell}
                <td>
                    <div style="font-weight: 600; color: var(--text-dark); margin-bottom: 2px;">${r.beneficiary_name}</div>
                </td>
                <td><span class="badge badge-type">${r.form_type.toUpperCase()}</span></td>
                <td>${r.barangay}</td>
                <td><span class="status-badge ${r.status}">${formatStatus(r.status)}</span></td>
                <td style="color:var(--text-light);font-size:0.85rem">${formatDate(r.created_at)}</td>
                <td>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        ${viewBtn}
                        ${printBtn}
                        ${deleteBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Reset select-all checkbox state after re-render
    const selectAll = document.getElementById('selectAllRegs');
    if (selectAll) selectAll.checked = false;
    updateBulkApproveBtn();
}

/**
 * Renders the current page of registrations (paginated slice of currentFilteredRegs).
 */
function renderRegistrationPage() {
    const total = currentFilteredRegs.length;
    const totalPages = Math.max(1, Math.ceil(total / regPageSize));
    regPage = Math.min(regPage, totalPages);

    const start = (regPage - 1) * regPageSize;
    const pageSlice = currentFilteredRegs.slice(start, start + regPageSize);
    renderRegistrations(pageSlice);

    // Build pagination bar
    const tableContainer = document.getElementById('registrationsTableBody')?.closest('.table-container');
    if (tableContainer) {
        let bar = tableContainer.parentElement.querySelector('.pagination-bar.reg-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'pagination-bar reg-bar';
            tableContainer.parentElement.appendChild(bar);
        }
        bar.innerHTML = buildPaginationHTML(regPage, totalPages, total, regPageSize, start,
            (p) => { regPage = p; renderRegistrationPage(); },
            (sz) => { regPageSize = sz; regPage = 1; renderRegistrationPage(); },
            'reg'
        );
    }
}

/**
 * Builds the pagination bar HTML.
 * @param {number} page - current page (1-indexed)
 * @param {number} totalPages
 * @param {number} total - total items in filtered set
 * @param {number} pageSize - current rows per page
 * @param {number} start - start index of current slice
 * @param {Function} onPage - called with new page number
 * @param {Function} onSize - called with new page size
 * @param {string} prefix - 'reg' or 'ben' to namespace event handlers
 */
function buildPaginationHTML(page, totalPages, total, pageSize, start, onPage, onSize, prefix) {
    window[`_pagOnPage_${prefix}`] = onPage;
    window[`_pagOnSize_${prefix}`] = onSize;

    const end = Math.min(start + pageSize, total);
    const infoText = total === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${total}`;

    // Page buttons: show at most 5 around current page
    let pageButtons = '';
    const maxVisible = 5;
    let rangeStart = Math.max(1, page - Math.floor(maxVisible / 2));
    let rangeEnd = Math.min(totalPages, rangeStart + maxVisible - 1);
    if (rangeEnd - rangeStart < maxVisible - 1) rangeStart = Math.max(1, rangeEnd - maxVisible + 1);

    for (let p = rangeStart; p <= rangeEnd; p++) {
        pageButtons += `<button class="pagination-btn${p === page ? ' active' : ''}" onclick="window['_pagOnPage_${prefix}'](${p})">${p}</button>`;
    }

    return `
        <div class="pagination-info">${infoText}</div>
        <div class="pagination-controls">
            <select class="pagination-size-select" onchange="window['_pagOnSize_${prefix}'](parseInt(this.value))" title="Rows per page">
                ${[25, 50, 100].map(sz => `<option value="${sz}"${sz === pageSize ? ' selected' : ''}>${sz} / page</option>`).join('')}
            </select>
            <button class="pagination-btn" onclick="window['_pagOnPage_${prefix}'](${page - 1})" ${page <= 1 ? 'disabled' : ''} title="Previous page">
                <i class="fas fa-chevron-left"></i>
            </button>
            ${pageButtons}
            <button class="pagination-btn" onclick="window['_pagOnPage_${prefix}'](${page + 1})" ${page >= totalPages ? 'disabled' : ''} title="Next page">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

// ════════════════════════════════════════════════════
// Column Sort — Registrations Table
// ════════════════════════════════════════════════════

/**
 * Returns the 'value' string used for sorting a registration by a given column.
 */
function getSortValue(r, col) {
    switch (col) {
        case 'name':   return (r.beneficiary_name || '').toLowerCase();
        case 'type':   return (r.form_type || '').toLowerCase();
        case 'status': return (r.status || '').toLowerCase();
        case 'date':   return r.created_at || '';
        default:       return '';
    }
}

/**
 * Sorts an array of registrations by the current global sort state.
 */
function applySortToRegs(list) {
    if (!regSortCol) return list;
    return [...list].sort((a, b) => {
        const va = getSortValue(a, regSortCol);
        const vb = getSortValue(b, regSortCol);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return regSortDir === 'asc' ? cmp : -cmp;
    });
}

/**
 * Attaches click listeners to sortable <th> elements.
 * Updates arrow icons and re-renders the current page.
 */
function initSortHeaders() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (regSortCol === col) {
                regSortDir = regSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                regSortCol = col;
                regSortDir = 'asc';
            }

            // Update all sort icons
            document.querySelectorAll('th.sortable').forEach(t => {
                t.classList.remove('asc', 'desc');
                const icon = t.querySelector('.sort-icon');
                if (icon) icon.className = 'fas fa-sort sort-icon';
            });

            th.classList.add(regSortDir);
            const icon = th.querySelector('.sort-icon');
            if (icon) icon.className = `fas fa-sort-${regSortDir === 'asc' ? 'up' : 'down'} sort-icon`;

            // Re-sort and re-render
            currentFilteredRegs = applySortToRegs(currentFilteredRegs);
            renderRegistrationPage();
        });
    });
}

// ════════════════════════════════════════════════════
// Bulk Select — Checkbox Logic
// ════════════════════════════════════════════════════

/**
 * Wires up the "Select All" header checkbox.
 */
function initSelectAll() {
    const selectAll = document.getElementById('selectAllRegs');
    if (!selectAll) return;
    selectAll.addEventListener('change', function () {
        document.querySelectorAll('.reg-row-checkbox').forEach(cb => {
            cb.checked = this.checked;
        });
        updateBulkApproveBtn();
    });
}

/**
 * Shows/hides the bulk approve button based on checkbox selection count.
 */
function updateBulkApproveBtn() {
    const count = document.querySelectorAll('.reg-row-checkbox:checked').length;
    const btn = document.getElementById('bulkApproveBtn');
    if (btn) {
        btn.style.display = count > 0 ? '' : 'none';
        if (count > 0) btn.innerHTML = `<i class="fas fa-check-double"></i> Approve ${count} Selected`;
    }
    // Also update the select-all indeterminate state
    const selectAll = document.getElementById('selectAllRegs');
    if (selectAll) {
        const total = document.querySelectorAll('.reg-row-checkbox').length;
        selectAll.indeterminate = count > 0 && count < total;
        selectAll.checked = total > 0 && count === total;
    }
}

/**
 * Collects all checked verified-row IDs and POSTs a bulk-review request.
 * Called by the "Approve Selected" button in the HTML.
 */
window.bulkMAOAction = async function (status) {
    const ids = [...document.querySelectorAll('.reg-row-checkbox:checked')]
        .map(cb => parseInt(cb.dataset.id))
        .filter(id => !isNaN(id));

    if (!ids.length) {
        showToast('No registrations selected.', 'warning');
        return;
    }

    const actionLabel = status === 'approved' ? 'approve' : 'reject';
    const result = await Swal.fire({
        title: `Bulk ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}?`,
        html: `You are about to <strong>${actionLabel}</strong> <strong>${ids.length}</strong> registration(s). This action cannot be easily undone.`,
        icon: status === 'approved' ? 'question' : 'warning',
        showCancelButton: true,
        confirmButtonColor: status === 'approved' ? '#10b981' : '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `Yes, ${actionLabel} all`,
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    const btn = document.getElementById('bulkApproveBtn');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    try {
        const response = await fetch('/mao/api/registrations/bulk-review', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ ids, status, remarks: 'Bulk action by MAO' })
        });
        const data = await response.json();
        if (data.success) {
            showToast(`${ids.length} registration(s) ${status} successfully.`, 'success');
            loadStats();
            loadRegistrations();
        } else {
            showToast(data.message || 'Bulk action failed.', 'error');
        }
    } catch (err) {
        console.error('Bulk review error:', err);
        showToast('Network error during bulk action.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
};

// ── Enhanced Review Modal Tabs & Logic ──
let reviewMap = null;
let reviewDrawnItems = null;

window.switchReviewTab = function (tabName, btn) {
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

window.proceedMAOSubmission = function () {
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
                                        <td style="font-weight: 700; color: #64748b;">${i + 1}</td>
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
window.closeModal = function (id) {
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
    switch (s) {
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

            iframe.onload = function () {
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
    const barangay = _brgyState.brgyDropdownRegistrations || '';

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (formType) params.append('form_type', formType);
        if (barangay) params.append('barangay', barangay);

        const response = await fetch(`/mao/api/registrations/export?${params.toString()}`);
        if (!response.ok) throw new Error('Export failed');

        // Use the same download handler as verifier (helper below)
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `mao_export_${new Date().toISOString().slice(0, 10)}.csv`;
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

window.softDeleteRegistration = async function (id) {
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

window.openTrashBin = async function () {
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

window.closeTrashBin = function (e) {
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

window.restoreFromTrash = async function (id) {
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

window.permanentDeleteFromTrash = async function (id) {
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

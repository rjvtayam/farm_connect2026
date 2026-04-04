/**
 * Verifier Dashboard Functionality
 * Handles: stats, pending table, reviewed history, review modal with canvas drawing
 */

let documentCanvas;
// ── Global Variables ──
let currentSubmissionId = null;
let landMap = null;
let drawnItems = null;
let currentGeoJSON = null;
let canvasCtx;
let locateHighlight = null;
let parcelGeoMap = {};
let activeParcelIndex = -1;
let allPendingSubmissions = [];
let allReviewedSubmissions = [];

// ── Verifier Pagination State ──
let pendingPage = 1;
let pendingPageSize = 25;
let currentFilteredPending = [];
let reviewedPage = 1;
let reviewedPageSize = 25;
let currentFilteredReviewed = [];

// ── Verifier Sort State ──
let pendingSortCol = null;
let pendingSortDir = 'asc';
let reviewedSortCol = null;
let reviewedSortDir = 'asc';

// ── Read-only modal mode flag ──
let isReadOnlyReview = false;

function updateMapAddressLabel(bgy, muni) {
    const header = document.querySelector('.pane-right h4.info-section-title');
    if (header) {
        header.innerHTML = `<i class="fas fa-map-marked-alt" style="color:#10b981;"></i> GIS: <span style="color:#4f46e5">${bgy}</span>, <span style="font-size:0.8rem; color:#64748b;">${muni}</span>`;
    }
}


// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadPendingSubmissions();
    loadReviewedSubmissions();
    loadActivityFeed();
    setupSearchAndFilters();
    initCanvas();
    loadTrashCount();
    initVerifierSortHeaders();
    loadAnalytics();

    // ── Real-time polling: refresh data every 15 seconds ──
    setInterval(() => {
        loadStats();
        loadPendingSubmissions(true);   // background refresh — preserve filters & page
        loadReviewedSubmissions(true);  // background refresh — preserve filters & page
        loadActivityFeed();
        loadAnalytics();
    }, 15000);

    initGlobalMap();
    initVerifierSockets();

    // ── Handle Tab Clicks for Analytics Deferred Rendering ──
    // This solves the Chart.js 0-dimension bug when refreshing in the background
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
        link.addEventListener('click', function() {
            if (this.getAttribute('href') === '#analytics') {
                // Short timeout to wait for section to become display:block
                setTimeout(() => {
                    if (window.pendingVerifierAnalytics) {
                        console.log('Rendering deferred verifier analytics...');
                        renderVerifierCharts(window.pendingVerifierAnalytics);
                        window.pendingVerifierAnalytics = null;
                    }
                }, 100);
            }
        });
    });
});

/**
 * Verifier Specific Socket Events
 */
function initVerifierSockets() {
    const socket = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!socket) return;

    socket.on('new_submission', (data) => {
        // Refresh all verifier data when a new submission arrives
        loadStats();
        loadPendingSubmissions();
    });

    socket.on('record_locked', (data) => {
        const row = document.querySelector(`tr[data-id="${data.submission_id}"]`);
        if (row) {
            row.classList.add('locked-row');
            const actionCell = row.querySelector('td:last-child');
            if (actionCell) {
                actionCell.innerHTML = `
                    <span class="lock-indicator" title="Locked by ${data.user_name}">
                        <i class="fas fa-lock"></i> ${data.user_name}
                    </span>
                `;
            }
        }
    });

    socket.on('record_unlocked', (data) => {
        const row = document.querySelector(`tr[data-id="${data.submission_id}"]`);
        if (row) {
            row.classList.remove('locked-row');
            // Re-render the actions for this row by refreshing or just manually
            loadPendingSubmissions();
        }
    });

    socket.on('status_updated', (data) => {
        if (currentSubmissionId === data.id) {
            showFlashMessage(`Warning: This submission status was just updated to "${data.status}" by ${data.verifier}`, 'warning');
        }
        loadStats();
        loadPendingSubmissions();
        loadReviewedSubmissions();
    });
}

let globalMap = null;

function initGlobalMap() {
    const mapDiv = document.getElementById('globalParcelMap');
    if (!mapDiv) return;

    // Center on municipality (assuming a general center if unknown)
    globalMap = L.map('globalParcelMap').setView([14.165, 121.24], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(globalMap);

    loadGlobalParcels();
}

function loadGlobalParcels() {
    fetch('/verifier/api/gis/global', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                renderGlobalParcels(data.parcels);
            }
        });
}

function renderGlobalParcels(parcels) {
    if (!globalMap) return;

    const group = L.featureGroup().addTo(globalMap);

    parcels.forEach(p => {
        if (p.geo_json) {
            try {
                const layer = L.geoJSON(JSON.parse(p.geo_json), {
                    style: {
                        color: p.status === 'approved' ? '#10b981' : '#3b82f6',
                        weight: 2,
                        opacity: 0.8,
                        fillOpacity: 0.35
                    }
                }).addTo(group);

                layer.bindPopup(`
                    <div style="font-family:'Inter',sans-serif;">
                        <strong style="color:var(--primary);">${p.beneficiary_name}</strong><br>
                        <span style="font-size:0.75rem;color:#64748b;">${p.form_type.toUpperCase()} | ${p.barangay}</span><br>
                        <span class="status-badge ${p.status}" style="font-size:0.65rem;margin-top:4px;">${p.status}</span>
                    </div>
                `);
            } catch (e) {
                console.error("Error parsing geo_json for parcel", p.id, e);
            }
        }
    });

    if (parcels.length > 0) {
        globalMap.fitBounds(group.getBounds());
    }
}

// ── Search & Filter ──
function setupSearchAndFilters() {
    const searchPending = document.getElementById('searchPending');
    const filterFormType = document.getElementById('filterFormType');
    const filterBrgyPending = document.getElementById('filterBrgyPending');
    const searchReviewed = document.getElementById('searchReviewed');
    const filterStatus = document.getElementById('filterStatus');
    const filterType = document.getElementById('filterType');

    if (searchPending) searchPending.addEventListener('input', applyPendingFilters);
    if (filterFormType) filterFormType.addEventListener('change', applyPendingFilters);
    if (filterBrgyPending) filterBrgyPending.addEventListener('change', applyPendingFilters);
    if (searchReviewed) searchReviewed.addEventListener('input', applyReviewedFilters);
    if (filterStatus) filterStatus.addEventListener('change', applyReviewedFilters);
    if (filterType) filterType.addEventListener('change', applyReviewedFilters);
}

function applyPendingFilters(resetPage = true) {
    const term = (document.getElementById('searchPending')?.value || '').toLowerCase();
    const type = (document.getElementById('filterFormType')?.value || '').toLowerCase();
    const brgy = (document.getElementById('filterBrgyPending')?.value || '').toLowerCase();

    let filtered = allPendingSubmissions.filter(s => {
        const matchesTerm = (s.beneficiary_name || '').toLowerCase().includes(term) ||
            (s.barangay || '').toLowerCase().includes(term) ||
            (s.encoder_name || '').toLowerCase().includes(term);
        const matchesType = type === '' || (s.form_type || '').toLowerCase() === type;
        const matchesBrgy = brgy === '' || (s.barangay || '').toLowerCase() === brgy;
        return matchesTerm && matchesType && matchesBrgy;
    });

    filtered = applyVerifierSort(filtered, pendingSortCol, pendingSortDir);
    currentFilteredPending = filtered;
    if (resetPage) pendingPage = 1;
    // Clamp page if current page exceeds total pages after filter
    const totalPages = Math.max(1, Math.ceil(filtered.length / pendingPageSize));
    if (pendingPage > totalPages) pendingPage = totalPages;
    renderPendingPage();
}

function applyReviewedFilters(resetPage = true) {
    const term = (document.getElementById('searchReviewed')?.value || '').toLowerCase();
    const status = (document.getElementById('filterStatus')?.value || '').toLowerCase();
    const type = (document.getElementById('filterType')?.value || '').toLowerCase();

    let filtered = allReviewedSubmissions.filter(s => {
        const matchesTerm = (s.beneficiary_name || '').toLowerCase().includes(term) ||
            (s.barangay || '').toLowerCase().includes(term) ||
            (s.encoder_name || '').toLowerCase().includes(term);
        const matchesStatus = status === '' || (s.status || '').toLowerCase() === status;
        const matchesType = type === '' || (s.form_type || '').toLowerCase() === type;
        return matchesTerm && matchesStatus && matchesType;
    });

    filtered = applyVerifierSort(filtered, reviewedSortCol, reviewedSortDir);
    currentFilteredReviewed = filtered;
    if (resetPage) reviewedPage = 1;
    // Clamp page if current page exceeds total pages after filter
    const totalPages = Math.max(1, Math.ceil(filtered.length / reviewedPageSize));
    if (reviewedPage > totalPages) reviewedPage = totalPages;
    renderReviewedPage();
}

// ── Canvas Drawing for Document Review ──
function initCanvas() {
    const canvas = document.getElementById('documentCanvas');
    if (!canvas) return;

    documentCanvas = canvas;
    canvasCtx = canvas.getContext('2d');

    const container = canvas.parentElement;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight || 300;

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        [lastX, lastY] = getPos(e);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        canvasCtx.strokeStyle = '#ef4444';
        canvasCtx.lineWidth = 2;
        canvasCtx.lineCap = 'round';
        canvasCtx.beginPath();
        canvasCtx.moveTo(lastX, lastY);
        const [x, y] = getPos(e);
        canvasCtx.lineTo(x, y);
        canvasCtx.stroke();
        [lastX, lastY] = [x, y];
    });

    canvas.addEventListener('mouseup', () => { isDrawing = false; });
    canvas.addEventListener('mouseout', () => { isDrawing = false; });
}

window.clearCanvas = function () {
    if (canvasCtx && documentCanvas) {
        canvasCtx.clearRect(0, 0, documentCanvas.width, documentCanvas.height);
    }
};

// ── Stats ──
function loadStats() {
    fetch('/verifier/api/stats', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                animateCount('pendingReview', data.stats.pending || 0);
                animateCount('approvedToday', data.stats.verified || 0); // Repurpose "Approved Today" to show Verified items
                animateCount('totalReviewed', data.stats.reviewed_today || 0);
                animateCount('totalApproved', data.stats.approved || 0);
                animateCount('rejectedCount', data.stats.rejected || 0);

                if (data.trends) {
                    updateTrendBadge('pendingReviewTrend', data.trends.pending);
                    updateTrendBadge('approvedTodayTrend', data.trends.verified);
                    updateTrendBadge('totalReviewedTrend', data.trends.reviewed_today);
                    updateTrendBadge('totalApprovedTrend', data.trends.approved);
                    updateTrendBadge('rejectedCountTrend', data.trends.rejected);
                }
            }
        })
        .catch(error => console.error('Error loading stats:', error));
}

// updateTrendBadge() and animateCount() are provided by dashboard-common.js



// ── Pending Submissions ──
function loadPendingSubmissions(isBackground = false) {
    const tbody = document.getElementById('pendingTableBody');
    if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/verifier/api/submissions?status=pending', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allPendingSubmissions = data.submissions;
                populateVerifierBrgyFilter();
                applyPendingFilters(!isBackground); // preserve page on background refresh
            }
        })
        .catch(error => {
            console.error('Error loading pending:', error);
            if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load submissions</td></tr>';
        });
}

function renderPendingTable(list, filteredCount, totalCount) {
    const tbody = document.getElementById('pendingTableBody');
    if (!tbody) return;

    // Update result count badge
    const badge = document.getElementById('pendingResultCount');
    if (badge) {
        const total = totalCount !== undefined ? totalCount : allPendingSubmissions.length;
        const shown = filteredCount !== undefined ? filteredCount : list.length;
        badge.textContent = shown < total ? `${shown} of ${total}` : `${total}`;
        badge.style.display = shown > 0 ? '' : 'none';
    }

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-check-double"></i>
                    <p>All submissions have been reviewed — great job!</p>
                </div>
            </td></tr>`;
        const pb = document.getElementById('pendingPaginationBar');
        if (pb) pb.innerHTML = '';
        return;
    }

    tbody.innerHTML = list.map(s => {
        const isLockedByOther = s.locked_by && s.locked_by_id !== parseInt(document.body.dataset.userId);
        const lockHtml = s.locked_by ? `
            <span class="lock-indicator" title="Locked by ${s.locked_by.full_name}">
                <i class="fas fa-lock"></i> ${s.locked_by.full_name}
            </span>` : '';

        return `
            <tr data-id="${s.id}" class="${s.locked_by ? 'locked-row' : ''}">
                <td><span style="font-weight:600;color:var(--text-dark)">${s.beneficiary_name}</span></td>
                <td><span class="badge badge-type">${s.form_type.toUpperCase()}</span></td>
                <td>${s.encoder_name}</td>
                <td>${s.barangay}</td>
                <td style="color:var(--text-light);font-size:0.85rem">${formatDate(s.created_at)}</td>
                <td>
                    ${isLockedByOther ? lockHtml : `
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <button class="btn btn-primary btn-sm" onclick="viewSubmission(${s.id})" title="Review Submission">
                                <i class="fas fa-search"></i>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="softDeleteSubmission(${s.id})" title="Move to Trash">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

// Bulk Actions removed — verifiers must review submissions individually

// ── Verifier Activity Feed ─────────────────────────────────────────────────────

// ── Barangay Filter Population ─────────────────────────────────────────────────
function populateVerifierBrgyFilter() {
    const sel = document.getElementById('filterBrgyPending');
    if (!sel) return;
    const barangays = [...new Set(allPendingSubmissions.map(s => s.barangay).filter(Boolean))].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="">All Barangays</option>' +
        barangays.map(b => `<option value="${b}" ${b === current ? 'selected' : ''}>${b}</option>`).join('');
}

// ── Verifier Sort ──────────────────────────────────────────────────────────────
function applyVerifierSort(list, col, dir) {
    if (!col) return list;
    return [...list].sort((a, b) => {
        let av = '', bv = '';
        if (col === 'name')   { av = (a.beneficiary_name || '').toLowerCase(); bv = (b.beneficiary_name || '').toLowerCase(); }
        else if (col === 'type')   { av = (a.form_type || '').toLowerCase(); bv = (b.form_type || '').toLowerCase(); }
        else if (col === 'status') { av = (a.status || '').toLowerCase(); bv = (b.status || '').toLowerCase(); }
        else if (col === 'date')   { av = a.created_at || ''; bv = b.created_at || ''; }
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

function initVerifierSortHeaders() {
    document.querySelectorAll('th.sortable[data-table]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            const table = th.dataset.table;
            if (table === 'pending') {
                if (pendingSortCol === col) pendingSortDir = pendingSortDir === 'asc' ? 'desc' : 'asc';
                else { pendingSortCol = col; pendingSortDir = 'asc'; }
                document.querySelectorAll('th.sortable[data-table="pending"] .sort-icon').forEach(i => i.className = 'fas fa-sort sort-icon');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.className = `fas fa-sort-${pendingSortDir === 'asc' ? 'up' : 'down'} sort-icon active`;
                applyPendingFilters();
            } else if (table === 'reviewed') {
                if (reviewedSortCol === col) reviewedSortDir = reviewedSortDir === 'asc' ? 'desc' : 'asc';
                else { reviewedSortCol = col; reviewedSortDir = 'asc'; }
                document.querySelectorAll('th.sortable[data-table="reviewed"] .sort-icon').forEach(i => i.className = 'fas fa-sort sort-icon');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.className = `fas fa-sort-${reviewedSortDir === 'asc' ? 'up' : 'down'} sort-icon active`;
                applyReviewedFilters();
            }
        });
    });
}

// ── Pagination ─────────────────────────────────────────────────────────────────
function buildVerifierPaginationHTML(page, pageSize, total, goFn, changeFn) {
    if (total === 0) return '';
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== totalPages) continue;
        pages += `<button class="pagination-btn${i === page ? ' active' : ''}" onclick="${goFn}(${i})">${i}</button>`;
    }
    return `
    <div class="pagination-bar">
        <span class="pagination-info">Showing ${start}–${end} of ${total}</span>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="${goFn}(${page - 1})" ${page === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            ${pages}
            <button class="pagination-btn" onclick="${goFn}(${page + 1})" ${page === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <select class="pagination-size-select" onchange="${changeFn}(this.value)">
            ${[25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} / page</option>`).join('')}
        </select>
    </div>`;
}

function renderPendingPage() {
    const total = currentFilteredPending.length;
    const all = allPendingSubmissions.length;
    const start = (pendingPage - 1) * pendingPageSize;
    const slice = currentFilteredPending.slice(start, start + pendingPageSize);
    renderPendingTable(slice, total, all);

    let pb = document.getElementById('pendingPaginationBar');
    if (!pb) {
        const tc = document.getElementById('pendingTableBody')?.closest('.table-container');
        if (tc) { pb = document.createElement('div'); pb.id = 'pendingPaginationBar'; tc.insertAdjacentElement('afterend', pb); }
    }
    if (pb) pb.innerHTML = buildVerifierPaginationHTML(pendingPage, pendingPageSize, total, 'goToPendingPage', 'changePendingPageSize');
}

function renderReviewedPage() {
    const total = currentFilteredReviewed.length;
    const all = allReviewedSubmissions.length;
    const start = (reviewedPage - 1) * reviewedPageSize;
    const slice = currentFilteredReviewed.slice(start, start + reviewedPageSize);
    renderReviewedTable(slice, total, all);

    let pb = document.getElementById('reviewedPaginationBar');
    if (!pb) {
        const tc = document.getElementById('reviewedTableBody')?.closest('.table-container');
        if (tc) { pb = document.createElement('div'); pb.id = 'reviewedPaginationBar'; tc.insertAdjacentElement('afterend', pb); }
    }
    if (pb) pb.innerHTML = buildVerifierPaginationHTML(reviewedPage, reviewedPageSize, total, 'goToReviewedPage', 'changeReviewedPageSize');
}

window.goToPendingPage = function(p) { pendingPage = p; renderPendingPage(); };
window.changePendingPageSize = function(s) { pendingPageSize = parseInt(s); pendingPage = 1; renderPendingPage(); };
window.goToReviewedPage = function(p) { reviewedPage = p; renderReviewedPage(); };
window.changeReviewedPageSize = function(s) { reviewedPageSize = parseInt(s); reviewedPage = 1; renderReviewedPage(); };

// ── Read-Only Reviewed Submission View ─────────────────────────────────────────
window.viewReviewedSubmission = function(id) {
    isReadOnlyReview = true;

    fetch(`/verifier/api/submissions/${id}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showFlashMessage('Failed to load submission details', 'error');
                isReadOnlyReview = false;
                return;
            }
            const sub = data.submission;

            // Label the modal as read-only
            const idEl = document.getElementById('reviewSubmissionId');
            if (idEl) idEl.textContent = `#${id}`;

            populateReviewModal(sub);
            clearCanvas();
            switchReviewTab('rsbsa');

            // Hide action footer
            const footer = document.querySelector('.modal-footer-premium');
            if (footer) footer.style.display = 'none';

            // Inject a status banner in place of the footer
            const existingBanner = document.getElementById('readOnlyBanner');
            if (existingBanner) existingBanner.remove();
            const banner = document.createElement('div');
            banner.id = 'readOnlyBanner';
            banner.style.cssText = 'padding:0.85rem 1.5rem;background:#f0fdf4;border-top:2px solid #bbf7d0;color:#166534;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.75rem;flex-shrink:0;';
            banner.innerHTML = `<i class="fas fa-lock-open" style="font-size:1rem;"></i> View Only &mdash; <span class="status-badge ${sub.status}" style="font-size:0.75rem;">${sub.status}</span><span style="margin-left:auto;font-weight:400;color:#64748b;font-size:0.8rem;">Close when done reviewing history</span>`;

            const modalContent = document.querySelector('#reviewModal .premium-modal');
            if (modalContent) modalContent.appendChild(banner);

            openModal('reviewModal');

            setTimeout(() => {
                initReviewMap(sub.geo_data);
            }, 300);
        })
        .catch(err => {
            console.error('Error viewing reviewed submission:', err);
            showFlashMessage('Failed to load submission', 'error');
            isReadOnlyReview = false;
        });
};


window.exportPendingSubmissions = async function () {
    const btn = document.querySelector('button[onclick="exportPendingSubmissions()"]');
    const originalHtml = btn.innerHTML;
    const search = document.getElementById('searchPending')?.value || '';
    const formType = document.getElementById('filterFormType')?.value || '';

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

        const params = new URLSearchParams();
        params.append('status', 'pending_verification');
        if (search) params.append('search', search);
        if (formType) params.append('form_type', formType);

        const response = await fetch(`/verifier/api/submissions/export?${params.toString()}`);
        if (!response.ok) throw new Error('Export failed');

        await handleFileDownload(response);
        showToast('Pending Submissions exported!', 'success');
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

window.exportReviewedSubmissions = async function () {
    const btn = document.querySelector('button[onclick="exportReviewedSubmissions()"]');
    const originalHtml = btn.innerHTML;
    const search = document.getElementById('searchReviewed')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

        const params = new URLSearchParams();
        params.append('status', status || 'reviewed');
        if (search) params.append('search', search);

        const response = await fetch(`/verifier/api/submissions/export?${params.toString()}`);
        if (!response.ok) throw new Error('Export failed');

        await handleFileDownload(response);
        showToast('Reviewed Submissions exported!', 'success');
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

async function handleFileDownload(response) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'submissions_export.csv';
    if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
    }

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

// ── Reviewed Submissions (History) ──
function loadReviewedSubmissions(isBackground = false) {
    const tbody = document.getElementById('reviewedTableBody');
    if (!tbody) return;
    if (!isBackground) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    // Fetch verified + approved + rejected
    Promise.all([
        fetch('/verifier/api/submissions?status=verified', { credentials: 'include' }).then(r => r.json()),
        fetch('/verifier/api/submissions?status=approved', { credentials: 'include' }).then(r => r.json()),
        fetch('/verifier/api/submissions?status=rejected', { credentials: 'include' }).then(r => r.json())
    ])
        .then(([verifiedData, approvedData, rejectedData]) => {
            allReviewedSubmissions = [
                ...(verifiedData.success ? verifiedData.submissions : []),
                ...(approvedData.success ? approvedData.submissions : []),
                ...(rejectedData.success ? rejectedData.submissions : [])
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            applyReviewedFilters(!isBackground); // preserve page on background refresh
        })
        .catch(error => {
            console.error('Error loading reviewed:', error);
            if (!isBackground) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load history</td></tr>';
        });
}

function renderReviewedTable(list, filteredCount, totalCount) {
    const tbody = document.getElementById('reviewedTableBody');
    if (!tbody) return;

    // Update result count badge
    const badge = document.getElementById('reviewedResultCount');
    if (badge) {
        const total = totalCount !== undefined ? totalCount : allReviewedSubmissions.length;
        const shown = filteredCount !== undefined ? filteredCount : list.length;
        badge.textContent = shown < total ? `${shown} of ${total}` : `${total}`;
        badge.style.display = shown > 0 ? '' : 'none';
    }

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="7">
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No reviewed submissions yet</p>
                </div>
            </td></tr>`;
        const pb = document.getElementById('reviewedPaginationBar');
        if (pb) pb.innerHTML = '';
        return;
    }

    tbody.innerHTML = list.map(s => `
        <tr>
            <td><span style="font-weight:600;color:var(--text-dark)">${s.beneficiary_name}</span></td>
            <td><span class="badge badge-type">${s.form_type.toUpperCase()}</span></td>
            <td>${s.encoder_name || '—'}</td>
            <td>${s.barangay || '—'}</td>
            <td><span class="status-badge ${s.status}">${s.status}</span></td>
            <td style="color:var(--text-light);font-size:0.85rem">${formatDate(s.created_at)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="viewReviewedSubmission(${s.id})" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ── Review Modal ──
window.viewSubmission = function (id) {
    // Attempt to lock first
    fetch(`/verifier/api/submissions/${id}/lock`, {
        method: 'PUT',
        headers: { 'X-CSRFToken': getCSRFToken() },
        credentials: 'include'
    })
        .then(r => r.json())
        .then(lockData => {
            if (!lockData.success) {
                showFlashMessage(lockData.message || 'Could not lock record', 'error');
                return;
            }

            currentSubmissionId = id;
            const idEl = document.getElementById('reviewSubmissionId');
            if (idEl) idEl.textContent = `#${id}`;

            fetch(`/verifier/api/submissions/${id}`, { credentials: 'include' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        populateReviewModal(data.submission);
                        clearCanvas();
                        switchReviewTab('rsbsa'); // Reset to default tab
                        openModal('reviewModal');

                        if (socket) socket.emit('join_submission', { submission_id: id });

                        // Initialize Map after modal is open
                        setTimeout(() => {
                            initReviewMap(data.submission.geo_data);
                        }, 300);
                    } else {
                        showFlashMessage('Error loading submission details', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error loading details:', error);
                    showFlashMessage('Failed to load submission', 'error');
                });
        });
};

window.unlockSubmission = function (id) {
    if (!id) return;
    fetch(`/verifier/api/submissions/${id}/unlock`, {
        method: 'PUT',
        headers: { 'X-CSRFToken': getCSRFToken() },
        credentials: 'include'
    }).then(() => {
        if (socket) socket.emit('leave_submission', { submission_id: id });
    });
};

// Override closeModal to handle unlocking and read-only cleanup
const originalCloseModal = window.closeModal;
window.closeModal = function (modalId) {
    if (modalId === 'reviewModal') {
        if (isReadOnlyReview) {
            // Restore footer and remove read-only banner
            isReadOnlyReview = false;
            const footer = document.querySelector('.modal-footer-premium');
            if (footer) footer.style.display = '';
            const banner = document.getElementById('readOnlyBanner');
            if (banner) banner.remove();
        } else if (currentSubmissionId) {
            unlockSubmission(currentSubmissionId);
            currentSubmissionId = null;
        }
    }
    originalCloseModal(modalId);
};

// Handle window unload to release locks
window.addEventListener('beforeunload', () => {
    if (currentSubmissionId) {
        // Use sendBeacon for more reliability on exit
        const formData = new FormData();
        formData.append('csrf_token', getCSRFToken());
        navigator.sendBeacon(`/verifier/api/submissions/${currentSubmissionId}/unlock`, formData);
    }
});

function initReviewMap(existingGeoData) {
    const container = document.getElementById('landMapContainer');
    if (!container) return;

    // Reset GIS State in sync with Map life-cycle
    activeParcelIndex = -1;
    parcelGeoMap = {};

    // Initial Parse of GeoData
    if (existingGeoData) {
        try {
            const parsedGeo = (typeof existingGeoData === 'string') ? JSON.parse(existingGeoData) : existingGeoData;
            // Handle Multi-Parcel Map vs Legacy Single-Polygon
            if (parsedGeo && typeof parsedGeo === 'object' && !parsedGeo.type) {
                parcelGeoMap = parsedGeo;
            } else {
                parcelGeoMap["0"] = parsedGeo; // Legacy fallback
            }
        } catch (e) { console.error("Error loading GIS state:", e); }
    }

    // Reset container
    container.innerHTML = '';

    if (landMap) {
        landMap.remove();
    }

    // Default to Mabitac, Laguna coordinates
    const defaultLat = 14.4333;
    const defaultLng = 121.4333;

    landMap = L.map('landMapContainer').setView([defaultLat, defaultLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(landMap);

    drawnItems = new L.FeatureGroup();
    landMap.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: {
                allowIntersection: false,
                showArea: true,
                drawError: { color: '#b00b00', timeout: 1000 },
                shapeOptions: { color: '#3b82f6' }
            },
            polyline: false,
            rectangle: false,
            circle: false,
            marker: true,
            circlemarker: false
        }
    });

    landMap.addControl(drawControl);

    // Load existing data if any
    if (existingGeoData) {
        try {
            const data = typeof existingGeoData === 'string' ? JSON.parse(existingGeoData) : existingGeoData;
            if (data && typeof data === 'object' && !data.type) {
                Object.values(data).forEach(feat => {
                    if (feat) {
                        try {
                            const l = L.geoJSON(feat);
                            l.eachLayer(layer => drawnItems.addLayer(layer));
                        } catch (err) {}
                    }
                });
            } else if (data) {
                const l = L.geoJSON(data);
                l.eachLayer(layer => drawnItems.addLayer(layer));
            }

            if (drawnItems.getLayers().length > 0) {
                landMap.fitBounds(drawnItems.getBounds(), { padding: [30, 30] });
            }
            currentGeoJSON = JSON.stringify(data);
        } catch (e) { console.error("Error loading GeoData:", e); }
    }

    landMap.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        drawnItems.clearLayers(); // Only one parcel for now
        drawnItems.addLayer(layer);

        const geo = layer.toGeoJSON();
        currentGeoJSON = JSON.stringify(geo);

        // SYNC WITH MULTI-PARCEL CACHE
        if (activeParcelIndex !== -1) {
            parcelGeoMap[activeParcelIndex] = geo;
        }

        // Auto-fill lat/lng if marker
        if (event.layerType === 'marker') {
            const latlng = layer.getLatLng();
            document.getElementById('reviewGisLat').value = latlng.lat.toFixed(6);
            document.getElementById('reviewGisLng').value = latlng.lng.toFixed(6);
            document.getElementById('reviewGisSource').value = 'Google Maps';
        }
    });

    landMap.on(L.Draw.Event.EDITED, function (event) {
        const layers = event.layers;
        layers.eachLayer(layer => {
            const geo = layer.toGeoJSON();
            currentGeoJSON = JSON.stringify(geo);
            if (activeParcelIndex !== -1) {
                parcelGeoMap[activeParcelIndex] = geo;
            }
        });
    });

    landMap.on(L.Draw.Event.DELETED, function () {
        currentGeoJSON = null;
        if (activeParcelIndex !== -1) {
            delete parcelGeoMap[activeParcelIndex];
        }
    });
}

function populateReviewModal(data) {
    const b = data.beneficiary || {};
    // Backend sends parsed data in 'data' key
    const parsedData = data.data || {};
    const pi = parsedData.personalInfo || b;

    document.getElementById('reviewFirstName').value = pi.firstName || b.first_name || '';
    document.getElementById('reviewLastName').value = pi.surname || b.last_name || '';
    document.getElementById('reviewMiddleName').value = pi.middleName || b.middle_name || '';
    document.getElementById('reviewExtensionName').value = pi.extensionName || b.extension_name || '';
    document.getElementById('reviewSex').value = pi.sex || b.sex || '';
    document.getElementById('reviewDOB').value = pi.dateOfBirth || b.date_of_birth || '';
    document.getElementById('reviewCivilStatus').value = pi.civilStatus || b.civil_status || '';
    document.getElementById('reviewBarangay').value = pi.address?.barangay || b.barangay || '';
    document.getElementById('reviewMobile').value = pi.mobileNumber || b.mobile_number || '';

    // Store type and data for logic
    const modal = document.getElementById('reviewModal');
    modal.dataset.formType = data.form_type || 'rsbsa';
    modal.dataset.formData = JSON.stringify(parsedData);

    // Store doc data for viewer
    modal.dataset.landDoc = pi.photo || pi.land_doc || '';
    modal.dataset.gpxData = pi.gpx_data || '';

    // GIS Fields
    const gis = parsedData.gis || {};
    const latEl = document.getElementById('reviewGisLat');
    const lngEl = document.getElementById('reviewGisLng');
    const eleEl = document.getElementById('reviewGisElevation');
    const srcEl = document.getElementById('reviewGisSource');

    if (latEl) latEl.value = gis.latitude || '';
    if (lngEl) lngEl.value = gis.longitude || '';
    if (eleEl) eleEl.value = gis.elevation || gis.notes || '';
    if (srcEl) {
        srcEl.value = gis.source || 'Estimated';
        const gisSection = srcEl.closest('.gis-entry-section');
        if (gisSection) {
            gisSection.style.display = (data.form_type === 'rsba') ? 'block' : 'none';
        }
    }

    // Reset confirmation checkbox
    const confirmCheck = document.getElementById('confirmVerification');
    if (confirmCheck) confirmCheck.checked = false;

    // Render Encoded Parcels
    renderEncodedParcels(parsedData.parcels);

    // Render Ownership Checklist (All Forms Tab)
    renderOwnershipChecklist(parsedData.attachedDocs, parsedData.parcels);

    // Show/Hide Attachment Buttons
    const landBtn = document.getElementById('landDocPreviewBtn');
    const gpxBtn = document.getElementById('gpxDataBtn');

    if (landBtn) landBtn.style.display = (pi.photo || pi.land_doc) ? 'block' : 'none';
    if (gpxBtn) {
        gpxBtn.style.display = pi.gpx_data ? 'block' : 'none';

        // PROFESSIONAL: Auto-plot GPX if it exists
        if (pi.gpx_data) {
            setTimeout(() => {
                showFlashMessage('Existing GIS track found. Auto-plotting...', 'info');
                processGpx(pi.gpx_data);
            }, 800);
        }
    }
}

function renderEncodedParcels(parcels) {
    const list = document.getElementById('encodedParcelList');
    if (!list) return;

    if (!parcels || parcels.length === 0) {
        list.innerHTML = '<div style="padding: 2rem; color: #64748b; text-align: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; margin-top: 1rem;">No parcel data available for this beneficiary</div>';
        return;
    }

    let html = '<div class="parcel-cards-container" style="display: flex; flex-direction: column; gap: 1.5rem; margin-top: 1rem;">';

    parcels.forEach((p, i) => {
        // Clean up crops display
        let cropRows = '';
        if (p.crops && p.crops.length > 0) {
            p.crops.forEach(c => {
                cropRows += `
                    <tr>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${c.commodity || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${c.size || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9;">${c.farmType || '-'}</td>
                    </tr>
                `;
            });
        }

        html += `
            <div class="parcel-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.25rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); position: relative; transition: transform 0.2s, box-shadow 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.75rem;">
                    <div>
                        <span style="background: #10b981; color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem; display: inline-block;">Parcel #${i + 1}</span>
                        <h4 style="margin: 0; color: #1e293b; font-size: 1.1rem; font-weight: 700;">${p.barangay || 'Unknown Barangay'}</h4>
                        <p style="margin: 2px 0 0 0; color: #64748b; font-size: 0.8rem;"><i class="fas fa-city" style="width: 16px;"></i> ${p.municipality || 'Mabitac'}, ${p.province || ((p.municipality || '').toLowerCase() === 'infanta' ? 'Quezon' : 'Laguna')}</p>
                        ${p.latitude && p.longitude ? `<p style="margin: 2px 0 0 0; color: #10b981; font-size: 0.75rem; font-weight: 600;"><i class="fas fa-crosshairs" style="width: 16px;"></i> GPS: ${p.latitude}, ${p.longitude}</p>` : ''}
                    </div>
                    <button type="button" class="btn-locate-parcel" data-parcel-index="${i}" onclick="locateParcel('${p.barangay}', '${p.municipality || 'Mabitac'}', '${p.province || ''}', ${i}, '${p.latitude || ''}', '${p.longitude || ''}')" style="background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE; padding: 0.5rem 0.85rem; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s;">
                        <i class="fas fa-map-marker-alt"></i> LOCATE
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
                    <div style="background: #f8fafc; padding: 0.75rem; border-radius: 10px;">
                        <span style="display: block; font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Ownership Info</span>
                        <p style="margin: 0; font-size: 0.85rem; color: #1e293b; font-weight: 600;">${p.ownershipType || 'N/A'}</p>
                        <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #94a3b8;">Doc: ${p.ownershipDoc || 'None'}</p>
                    </div>
                    <div style="background: #f8fafc; padding: 0.75rem; border-radius: 10px;">
                        <span style="display: block; font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Total Area</span>
                        <p style="margin: 0; font-size: 1rem; color: #10b981; font-weight: 800;">${p.area || '0.00'} <span style="font-size: 0.75rem; font-weight: 500;">ha</span></p>
                    </div>
                </div>

                <div style="display: flex; gap: 0.75rem; margin-bottom: 1.25rem;">
                    <span style="font-size: 0.7rem; color: #cf841d; background: #fffbeb; border: 1px solid #fef3c7; padding: 0.25rem 0.6rem; border-radius: 6px; font-weight: 600;">
                        <i class="fas fa-id-card"></i> ARB: ${p.arb === 'yes' ? 'YES' : 'NO'}
                    </span>
                    <span style="font-size: 0.7rem; color: #a855f7; background: #f5f3ff; border: 1px solid #ede9fe; padding: 0.25rem 0.6rem; border-radius: 6px; font-weight: 600;">
                        <i class="fas fa-mountain"></i> Ancestral: ${p.ancestral === 'yes' ? 'YES' : 'NO'}
                    </span>
                </div>

                ${cropRows ? `
                <div style="margin-top: 1rem;">
                    <h5 style="font-size: 0.75rem; color: #475569; text-transform: uppercase; font-weight: 700; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-seedling" style="color: #16a34a;"></i> Crops & Commodities
                    </h5>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
                        <thead style="background: #fbfcfd; color: #64748b;">
                            <tr>
                                <th style="text-align: left; padding: 0.5rem; font-weight: 600;">Commodity</th>
                                <th style="text-align: left; padding: 0.5rem; font-weight: 600;">Area/Head</th>
                                <th style="text-align: left; padding: 0.5rem; font-weight: 600;">System</th>
                            </tr>
                        </thead>
                        <tbody>${cropRows}</tbody>
                    </table>
                </div>
                ` : '<p style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">No specific commodities listed</p>'}
            </div>
        `;
    });

    html += '</div>';
    list.innerHTML = html;
}

function renderOwnershipChecklist(docs, parcels) {
    const container = document.getElementById('ownershipChecklist');
    if (!container) return;

    let checkedDocs = (docs && docs.documents) ? [...docs.documents] : [];
    const otherText = (docs && docs.other) ? docs.other : '';

    // FALLBACK: If primary attachedDocs is missing/empty, sweep parcel remarks
    // This handles cases where data was saved only in the remarks dropdown
    if (checkedDocs.length === 0 && parcels) {
        parcels.forEach(p => {
            if (p.crops) {
                p.crops.forEach(c => {
                    if (c.remarks) {
                        // Split "1, 2, 12" and capture individual IDs
                        const ids = c.remarks.split(',').map(v => v.trim()).filter(v => v);
                        ids.forEach(id => {
                            if (!checkedDocs.includes(id)) checkedDocs.push(id);
                        });
                    }
                });
            }
        });
    }

    const docLabels = {
        '1': 'Certificate of Land Transfer',
        '2': 'Emancipation Patent',
        '3': 'Individual Certificate of Land Ownership Award (CLOA)',
        '4': 'Collective CLOA',
        '5': 'Co-ownership CLOA',
        '6': 'Agricultural Sales Patent',
        '7': 'Homestead Patent',
        '8': 'Free Patent',
        '9': 'Certificate of Title or Regular Title',
        '10': 'Certificate of Ancestral Domain Title',
        '11': 'Certificate of Ancestral Land Title',
        '12': 'Tax Declaration',
        '13': `Others: ${otherText || '(None specified)'}`
    };

    let html = '<div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem;">';

    Object.keys(docLabels).forEach(key => {
        const isChecked = checkedDocs.includes(key);
        html += `
            <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-radius: 10px; background: ${isChecked ? '#f0fdf4' : '#f8fafc'}; border: 1px solid ${isChecked ? '#bbf7d0' : '#e2e8f0'}; transition: all 0.2s;">
                <div style="width: 22px; height: 22px; border-radius: 6px; border: 2px solid ${isChecked ? '#10b981' : '#cbd5e1'}; background: ${isChecked ? '#10b981' : 'white'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.75rem;">
                    ${isChecked ? '<i class="fas fa-check"></i>' : ''}
                </div>
                <span style="font-size: 0.85rem; font-weight: ${isChecked ? '600' : '500'}; color: ${isChecked ? '#166534' : '#475569'};">
                    ${docLabels[key]}
                </span>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

window.locateParcel = async function (barangay, municipality, province, index, pLat = '', pLng = '') {
    try {
        if (!landMap) {
             showFlashMessage('Map engine not ready.', 'error');
             return;
        }

        const bgy = (barangay || '').trim();
        const muni = (municipality || 'Mabitac').trim();
        const prov = (province || 'Laguna').trim();
        const key = bgy.toLowerCase();
        
        showFlashMessage(`Searching for ${bgy}...`, 'info');
        if (typeof updateMapAddressLabel === 'function') updateMapAddressLabel(bgy, muni);

        // 1. Save current state
        if (activeParcelIndex !== -1 && activeParcelIndex !== index) {
            if (drawnItems && drawnItems.getLayers().length > 0) {
                parcelGeoMap[activeParcelIndex] = drawnItems.toGeoJSON();
            }
        }

        // 2. CHECK CACHE (Saved drawings)
        if (parcelGeoMap[index]) {
            const geo = parcelGeoMap[index];
            const layer = L.geoJSON(geo);
            if (layer.getBounds().isValid()) {
                drawnItems.clearLayers();
                layer.eachLayer(l => drawnItems.addLayer(l));
                activeParcelIndex = index;
                landMap.fitBounds(layer.getBounds(), { padding: [50, 50] });
                showFlashMessage(`Restored drawing for parcel #${index + 1}`, 'success');
                return;
            }
        }

        // 3. INTERNAL MABITAC OPTIMIZATION (Speed)
        const localMap = {
            'amuyong': [14.4428, 121.3840],
            'bagong silang': [14.4172, 121.4328],
            'mabitac': [14.4333, 121.4333],
            'famy': [14.4357, 121.4489]
        };

        // 4. PARCEL-SPECIFIC COORDINATES (Laser Precision)
        const parcelLat = parseFloat(pLat);
        const parcelLng = parseFloat(pLng);
        if (!isNaN(parcelLat) && !isNaN(parcelLng) && parcelLat !== 0) {
            const c = [parcelLat, parcelLng];
            drawnItems.clearLayers();
            activeParcelIndex = index;
            // High zoom for specific fields
            landMap.setView(c, 18);
            if (locateHighlight) landMap.removeLayer(locateHighlight);
            locateHighlight = L.circle(c, { radius: 50, color: '#10b981', fillOpacity: 0.2 }).addTo(landMap);
            showFlashMessage(`Precision Match: Parcel #${index + 1} located.`, 'success');
            return;
        }

        if (localMap[key]) {
            const c = localMap[key];
            drawnItems.clearLayers();
            activeParcelIndex = index;
            landMap.setView(c, 17);
            if (locateHighlight) landMap.removeLayer(locateHighlight);
            locateHighlight = L.circle(c, { radius: 100, color: '#10b981', fillOpacity: 0.15 }).addTo(landMap);
            showFlashMessage(`Located ${bgy} (Instant Match)`, 'success');
            return;
        }

        // 4. CHECK FORM-LEVEL COORDINATES (If encoder provided them)
        const latVal = parseFloat(document.getElementById('reviewGisLat')?.value);
        const lngVal = parseFloat(document.getElementById('reviewGisLng')?.value);
        if (!isNaN(latVal) && !isNaN(lngVal) && latVal !== 0) {
            const c = [latVal, lngVal];
            drawnItems.clearLayers();
            activeParcelIndex = index;
            landMap.setView(c, 18);
            if (locateHighlight) landMap.removeLayer(locateHighlight);
            locateHighlight = L.circle(c, { radius: 50, color: '#4f46e5', fillOpacity: 0.1 }).addTo(landMap);
            showFlashMessage(`Centering on Encoded Coordinates`, 'success');
            return;
        }

        // 5. GLOBAL SEARCH (Multi-Stage Fallback)
        showFlashMessage('Querying Global GIS Database...', 'info');
        
        const queries = [
            `${bgy}, ${muni}, ${prov}, Philippines`,
            `${bgy}, ${muni}, Philippines`,
            `${muni}, ${prov}, Philippines`
        ];

        let foundC = null;
        let foundZoom = 17;
        let foundMsg = '';

        for (let q of queries) {
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, {
                    headers: { 'User-Agent': 'FarmConnectVerifier/1.1' }
                });
                const data = await resp.json();
                if (data && data.length > 0) {
                    foundC = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                    foundZoom = q.includes(bgy) ? 17 : 14;
                    foundMsg = `Located via: ${q}`;
                    break;
                }
            } catch (e) { continue; }
        }

        if (foundC) {
            drawnItems.clearLayers();
            activeParcelIndex = index;
            landMap.setView(foundC, foundZoom);
            if (locateHighlight) landMap.removeLayer(locateHighlight);
            locateHighlight = L.circle(foundC, { radius: 100, color: '#10b981', fillOpacity: 0.15 }).addTo(landMap);
            showFlashMessage(foundMsg, 'success');
        } else {
            showFlashMessage(`Could not find specific location. Please use manual zoom.`, 'warning');
        }

    } catch (err) {
        console.error("GIS Global Fail:", err);
        showFlashMessage("Localization service error.", "error");
    }
};

window.viewAttachment = function (type) {
    const data = document.getElementById('reviewModal').dataset[type === 'land_doc' ? 'landDoc' : 'gpxData'];
    if (!data) return;

    if (data.startsWith('data:image')) {
        const win = window.open();
        win.document.write(`<img src="${data}" style="max-width:100%;">`);
    } else {
        // For PDF or GPX (text)
        const win = window.open();
        win.document.write(`<pre style="word-wrap: break-word; white-space: pre-wrap;">${data}</pre>`);
    }
}

window.useGpxData = function () {
    const gpx = document.getElementById('reviewModal').dataset.gpxData;
    if (!gpx) {
        showFlashMessage('No GPX data attached to this submission.', 'warning');
        return;
    }

    showFlashMessage('Processing attached GPX data...', 'info');
    processGpx(gpx);
}

window.handleGisImport = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        const extension = file.name.split('.').pop().toLowerCase();

        try {
            if (extension === 'json' || extension === 'geojson') {
                const geojson = JSON.parse(content);
                processGeoJson(geojson);
            } else if (extension === 'gpx') {
                processGpx(content);
            } else if (extension === 'kml') {
                processKml(content);
            } else {
                showFlashMessage('Unsupported file format', 'error');
            }
        } catch (err) {
            console.error('Import error:', err);
            showFlashMessage('Failed to parse GIS file', 'error');
        }
        // Clear input for next use
        event.target.value = '';
    };
    reader.readAsText(file);
};

function processGeoJson(data) {
    if (!landMap || !drawnItems) return;
    drawnItems.clearLayers();

    L.geoJSON(data, {
        onEachFeature: (feature, layer) => {
            if (layer.getBounds) {
                drawnItems.addLayer(layer);
            }
        }
    });

    if (drawnItems.getLayers().length > 0) {
        const bounds = drawnItems.getBounds();
        landMap.fitBounds(bounds);
        const center = bounds.getCenter();
        updateGisFields(center.lat, center.lng);

        // Sync with global state for submission
        currentGeoJSON = JSON.stringify(data);
        
        // CRITICAL: Update parcelGeoMap so it's actually saved to DB
        const idx = activeParcelIndex !== -1 ? activeParcelIndex : 0;
        parcelGeoMap[idx] = data;
        
        showFlashMessage('GeoJSON data imported & plotted.', 'success');
    }
}

function processGpx(xmlString) {
    const latRegex = /lat="([-+]?([0-9]*[.])?[0-9]+)"/g;
    const lonRegex = /lon="([-+]?([0-9]*[.])?[0-9]+)"/g;

    let latMatch, lonMatch;
    const points = [];

    while ((latMatch = latRegex.exec(xmlString)) !== null && (lonMatch = lonRegex.exec(xmlString)) !== null) {
        points.push([parseFloat(latMatch[1]), parseFloat(lonMatch[1])]);
    }

    if (points.length > 0) {
        drawnItems.clearLayers();
        const poly = L.polygon(points, { color: '#10b981', weight: 3, fillOpacity: 0.2 }).addTo(drawnItems);
        landMap.fitBounds(poly.getBounds());
        const center = poly.getBounds().getCenter();
        updateGisFields(center.lat, center.lng);

        // Sync with global state
        const geo = poly.toGeoJSON();
        currentGeoJSON = JSON.stringify(geo);
        
        // CRITICAL: Update parcelGeoMap so it's actually saved to DB
        const idx = activeParcelIndex !== -1 ? activeParcelIndex : 0;
        parcelGeoMap[idx] = geo;

        showFlashMessage(`Imported ${points.length} points from GPX.`, 'success');
    } else {
        showFlashMessage('No coordinates found in GPX file.', 'warning');
    }
}

function processKml(xmlString) {
    // Basic KML <coordinates> extraction
    const coordMatch = xmlString.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
    if (coordMatch) {
        const raw = coordMatch[1].trim();
        const pairs = raw.split(/\s+/);
        const points = pairs.map(p => {
            const parts = p.split(',');
            return [parseFloat(parts[1]), parseFloat(parts[0])]; // KML is lon,lat
        }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));

        if (points.length > 0) {
            drawnItems.clearLayers();
            const poly = L.polygon(points, { color: '#3b82f6', weight: 3 }).addTo(drawnItems);
            landMap.fitBounds(poly.getBounds());
            const center = poly.getBounds().getCenter();
            updateGisFields(center.lat, center.lng);

            // Sync with global state
            const geo = poly.toGeoJSON();
            currentGeoJSON = JSON.stringify(geo);

            // CRITICAL: Update parcelGeoMap so it's actually saved to DB
            const idx = activeParcelIndex !== -1 ? activeParcelIndex : 0;
            parcelGeoMap[idx] = geo;

            showFlashMessage('KML coordinates imported.', 'success');
            return;
        }
    }
    showFlashMessage('Could not parse KML coordinates.', 'warning');
}

function updateGisFields(lat, lng) {
    const latEl = document.getElementById('reviewGisLat');
    const lngEl = document.getElementById('reviewGisLng');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);

    // Also move map to center just in case
    if (landMap) landMap.panTo([lat, lng]);
}

window.downloadReviewPdf = function () {
    showFlashMessage('PDF Download is currently disabled for this review mode.', 'info');
};

let pendingSubmissionAction = null; // 'verified' or 'rejected'

window.promptConfirmModal = function (status) {
    if (!currentSubmissionId) return;

    const confirmCheck = document.getElementById('confirmVerification');
    if (status === 'verified' && confirmCheck && !confirmCheck.checked) {
        showFlashMessage('Please confirm that you have verified all details using the checkbox', 'warning');
        return;
    }

    pendingSubmissionAction = status;

    // Reset modal fields
    const remarksField = document.getElementById('reviewRemarks');
    remarksField.value = '';
    remarksField.classList.remove('error');
    document.getElementById('remarksError').style.display = 'none';

    // Configure Modal UI based on action
    const header = document.getElementById('confirmModalHeader');
    const title = document.getElementById('confirmModalTitle');
    const message = document.getElementById('confirmModalMessage');
    const label = document.getElementById('reviewRemarksLabel');
    const btn = document.getElementById('confirmActionBtn');

    if (status === 'verified') {
        header.style.background = '#10b981';
        title.innerHTML = '<i class="fas fa-check-circle"></i> Approve Submission';
        message.innerHTML = 'You are about to <strong>Approve</strong> this submission. It will be sent to the Municipal Agriculturist Office (MAO).';
        label.innerText = 'Remarks (Optional)';
        btn.style.background = '#10b981';
        btn.style.borderColor = '#10b981';
        btn.innerText = 'Complete Verification';
    } else {
        header.style.background = '#ef4444';
        title.innerHTML = '<i class="fas fa-times-circle"></i> Reject Submission';
        message.innerHTML = 'You are about to <strong>Reject</strong> this submission. It will be returned to the Encoder.';
        label.innerHTML = 'Reason for Rejection <span style="color: #ef4444;">*</span>';
        btn.style.background = '#ef4444';
        btn.style.borderColor = '#ef4444';
        btn.innerText = 'Reject & Return';
    }

    openModal('confirmReviewModal');
};

window.proceedSubmission = function () {
    if (!pendingSubmissionAction || !currentSubmissionId) return;

    const status = pendingSubmissionAction;
    const remarksField = document.getElementById('reviewRemarks');
    let remarks = remarksField.value.trim();

    // Rejection validation
    if (status === 'rejected' && remarks === '') {
        remarksField.style.borderColor = '#ef4444';
        document.getElementById('remarksError').style.display = 'block';
        remarksField.focus();
        showFlashMessage('Rejection reason is required', 'warning');
        return;
    }

    const formType = document.getElementById('reviewModal').dataset.formType;
    let gisData = null;

    if (formType === 'rsba' && status === 'verified') {
        gisData = {
            latitude: document.getElementById('reviewGisLat')?.value || '',
            longitude: document.getElementById('reviewGisLng')?.value || '',
            elevation: document.getElementById('reviewGisElevation')?.value || '',
            source: document.getElementById('reviewGisSource')?.value || ''
        };
    }

    const payload = {
        status: status,
        beneficiary_updates: {
            first_name: document.getElementById('reviewFirstName')?.value,
            last_name: document.getElementById('reviewLastName')?.value,
            barangay: document.getElementById('reviewBarangay')?.value,
            mobile_number: document.getElementById('reviewMobile')?.value
        },
        gis_data: gisData,
        geo_data: JSON.stringify(parcelGeoMap), // Send multi-parcel map
        remarks: remarks
    };

    // Disable buttons during submit - fixed selectors to match modal trigger
    const actionBtn = document.getElementById('confirmActionBtn');
    const approveBtn = document.querySelector('[onclick="promptConfirmModal(\'verified\')"]');
    const rejectBtn = document.querySelector('[onclick="promptConfirmModal(\'rejected\')"]');

    if (actionBtn) { actionBtn.disabled = true; actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    fetch(`/verifier/api/submissions/${currentSubmissionId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeModal('confirmReviewModal');
                closeModal('reviewModal');
                loadStats();
                loadPendingSubmissions();
                loadReviewedSubmissions();
                showFlashMessage(`Submission ${status === 'verified' ? 'verified' : 'rejected'} successfully`, 'success');

            } else {
                showFlashMessage('Error: ' + data.message, 'error');
                // Reset buttons on error
                if (actionBtn) {
                    actionBtn.disabled = false;
                    actionBtn.innerText = 'Confirm'; // Assuming 'Confirm' is the default text
                }
                if (approveBtn) approveBtn.disabled = false;
                if (rejectBtn) rejectBtn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error submitting review:', error);
            showFlashMessage('Failed to submit review. Server error.', 'error');
            // Reset buttons on error
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = 'Confirm'; // Assuming 'Confirm' is the default text
            }
            if (approveBtn) approveBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
        })
        .finally(() => {
            // This finally block will ensure buttons are re-enabled even if the above error handling
            // didn't explicitly catch it or if there's a network issue before the .then/.catch.
            // However, the specific text reset for actionBtn is handled in the .catch and .then(else)
            // to allow for specific messages if needed.
            if (approveBtn) approveBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
        });
};

// ═══════════════════════════════════════════════════════
// System Settings — Profile, Password, Account Deletion
// ═══════════════════════════════════════════════════════



/* ── Review Modal Tab Logic ── */
window.switchReviewTab = function (tabName) {
    // Hide all contents
    document.querySelectorAll('.tab-content-area').forEach(tab => {
        tab.style.display = 'none';
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected content
    const contentId = 'tabContent' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const content = document.getElementById(contentId);
    if (content) content.style.display = 'block';

    // Activate selected button
    const btnId = 'tabBtn' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
};

// ── Trash Bin Functions ─────────────────────────────────────────────────────

const TRASH_API_BASE_V = '/verifier';

window.softDeleteSubmission = window.softDeleteSubmission || async function(id) {
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
        const res = await fetch(`${TRASH_API_BASE_V}/api/submissions/${id}/soft-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Submission moved to trash', 'success');
            loadPendingSubmissions();
            loadReviewedSubmissions();
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
        const res = await fetch(`${TRASH_API_BASE_V}/api/trash`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) renderTrashItemsV(data.items);
    } catch (e) {
        document.getElementById('trashModalBody').innerHTML = '<div class="trash-empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load</h4><p>Please try again</p></div>';
    }
};

window.closeTrashBin = function(e) {
    if (e && e.target && !e.target.classList.contains('trash-modal-overlay')) return;
    document.getElementById('trashModalOverlay').classList.remove('active');
};

function renderTrashItemsV(items) {
    const body = document.getElementById('trashModalBody');
    if (!items || items.length === 0) {
        body.innerHTML = '<div class="trash-empty-state"><i class="fas fa-recycle"></i><h4>Trash is empty</h4><p>Deleted submissions will appear here</p></div>';
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
        const res = await fetch(`${TRASH_API_BASE_V}/api/trash/${id}/restore`, {
            method: 'POST', headers: { 'X-CSRFToken': getCSRFToken() }, credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Submission restored', 'success');
            openTrashBin(); loadPendingSubmissions(); loadStats(); loadTrashCount();
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
        const res = await fetch(`${TRASH_API_BASE_V}/api/trash/${id}/permanent`, {
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
        const res = await fetch(`${TRASH_API_BASE_V}/api/trash/count`, { credentials: 'include' });
        const data = await res.json();
        const badge = document.getElementById('trashBadge');
        if (badge && data.success) {
            if (data.count > 0) { badge.textContent = data.count; badge.style.display = 'flex'; }
            else badge.style.display = 'none';
        }
    } catch (e) { /* silent */ }
}

// ── Analytics Module ──
// Fixed semantic colors: status key → color (never positional)
const STATUS_COLOR_MAP = {
    'approved': { bg: '#10b981', light: 'rgba(16,185,129,0.12)', label: 'Approved' },
    'rejected': { bg: '#ef4444', light: 'rgba(239,68,68,0.12)', label: 'Rejected' },
    'pending': { bg: '#f59e0b', light: 'rgba(245,158,11,0.12)', label: 'Pending' },
    'verified': { bg: '#3b82f6', light: 'rgba(59,130,246,0.12)', label: 'Verified' },
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

// 14-color palette for barangay bars (Mabitac-themed)
const BRGY_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#a855f7', '#eab308', '#22d3ee', '#fb923c'
];

function loadAnalytics() {
    fetch('/verifier/api/analytics', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderVerifierCharts(data.analytics);
                populateVerifierKPIs(data.analytics);

                // Update "Last Updated" timestamp
                const lastUpdatedEl = document.getElementById('verifierAnalyticsLastUpdated');
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
function populateVerifierKPIs(analytics) {
    const kpi = analytics.kpi || {};
    
    // Elements from verifier-panel.html
    const elTotal = document.getElementById('verKpiTotal');
    const elPending = document.getElementById('verKpiPending');
    const elVerified = document.getElementById('verKpiVerified');
    const elApproved = document.getElementById('verKpiApproved');
    const elRejected = document.getElementById('verKpiRejected');

    if (elTotal) elTotal.textContent = (kpi.total_muni || 0).toLocaleString();
    if (elPending) elPending.textContent = (kpi.pending || 0).toLocaleString();
    if (elVerified) elVerified.textContent = (kpi.verified || 0).toLocaleString();
    if (elApproved) elApproved.textContent = (kpi.approved || 0).toLocaleString();
    if (elRejected) elRejected.textContent = (kpi.rejected || 0).toLocaleString();

    // Update Year Label
    const monthly = analytics.monthly || {};
    const yearLabel = document.getElementById('verifierAnalyticsYearLabel');
    if (yearLabel && monthly.current_year) {
        yearLabel.textContent = `${monthly.last_year} vs ${monthly.current_year}`;
    }

    // Update Subtitle
    const subtitle = document.getElementById('verifierAnalyticsSubtitle');
    if (subtitle) {
        subtitle.textContent = 'Municipality-wide pipeline & review performance';
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

function renderVerifierCharts(analytics) {
    // Only render if the analytics section is actually visible to prevent Chart.js 0-dimension bugs
    const analyticsSection = document.getElementById('analytics');
    if (!analyticsSection || analyticsSection.style.display === 'none') {
        // Store data for deferred rendering when tab is clicked
        window.pendingVerifierAnalytics = analytics;
        return;
    }

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748b';
    Chart.defaults.animation = { duration: 800, easing: 'easeInOutQuart' };

    if (!window.verifierCharts) window.verifierCharts = {};
    Object.values(window.verifierCharts).forEach(c => { try { c.destroy(); } catch (e) { } });
    window.verifierCharts = {};

    const isDark = document.documentElement.dataset.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    // 1. MONTHLY REVIEW THROUGHPUT (Line)
    const monthlyCtx = document.getElementById('verifierMonthlyChart')?.getContext('2d');
    if (monthlyCtx) {
        const monthly = analytics.monthly || {};
        const monthLabels = monthly.month_labels || [];
        const currentData = monthly.current_data || [];
        const lastData = monthly.last_data || [];
        const currentYear = monthly.current_year || '';
        const lastYear = monthly.last_year || '';

        const gradCurrent = monthlyCtx.createLinearGradient(0, 0, 0, 400);
        gradCurrent.addColorStop(0, 'rgba(139,92,246,0.25)'); // purple for verifier
        gradCurrent.addColorStop(1, 'rgba(139,92,246,0)');

        window.verifierCharts.monthly = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: monthLabels,
                datasets: [
                    {
                        label: currentYear,
                        data: currentData,
                        borderColor: '#8b5cf6',
                        backgroundColor: gradCurrent,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#8b5cf6',
                        pointRadius: 5,
                    },
                    {
                        label: lastYear,
                        data: lastData,
                        borderColor: '#94a3b8',
                        borderDash: [6, 4],
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#94a3b8',
                        pointRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: makeTooltip({
                        afterBody: items => {
                            const a = items[0]?.parsed.y || 0;
                            const b = items[1]?.parsed.y || 0;
                            if (b === 0) return a > 0 ? [`\n  ↑ New this year`] : [];
                            const diff = a - b;
                            const pct = Math.round((diff / b) * 100);
                            const arrow = diff >= 0 ? '↑' : '↓';
                            return [`\n  ${arrow} ${Math.abs(pct)}% vs last year`];
                        }
                    })
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
                    x: { grid: { display: false }, ticks: { color: tickColor } }
                }
            }
        });

        const legendEl = document.getElementById('verifierMonthlyLegend');
        if (legendEl) {
            legendEl.innerHTML = `
                <span class="inline-legend-item"><span class="inline-legend-dot" style="background:#8b5cf6"></span> ${currentYear}</span>
                <span class="inline-legend-item"><span class="inline-legend-dot" style="background:#94a3b8;border-style:dashed"></span> ${lastYear}</span>`;
        }
    }

    // 2. BACKLOG BY FORM TYPE (Bar)
    const typeCtx = document.getElementById('verifierTypeChart')?.getContext('2d');
    if (typeCtx) {
        const typesData = analytics.pending_by_type || {};
        const labels = Object.keys(typesData).map(k => k.toUpperCase());
        const values = Object.values(typesData);
        const colors = Object.keys(typesData).map(k => TYPE_COLOR_MAP[k.toLowerCase()] || '#6366f1');

        window.verifierCharts.type = new Chart(typeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ data: values, backgroundColor: colors, borderRadius: 8, barThickness: 40 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: makeTooltip() },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
                    x: { grid: { display: false }, ticks: { color: tickColor } }
                }
            }
        });
    }

    // 3. MUNICIPALITY STATUS DISTRIBUTION (Doughnut)
    const statusCtx = document.getElementById('verifierStatusChart')?.getContext('2d');
    if (statusCtx) {
        const pipeline = analytics.pipeline || {};
        const total = Object.values(pipeline).reduce((s, v) => s + v, 0);
        const keys = Object.keys(pipeline);
        const values = Object.values(pipeline);
        const colors = keys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).bg);
        const labels = keys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).label);

        window.verifierCharts.status = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 3,
                    borderColor: isDark ? '#1e293b' : '#fff',
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: makeTooltip({
                        afterBody: model => {
                            const val = model.dataPoints[0].raw;
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return `\n  Share: ${pct}%`;
                        }
                    })
                }
            }
        });

        const legendListEl = document.getElementById('verifierStatusLegendList');
        if (legendListEl) {
            legendListEl.innerHTML = keys.map(k => {
                const cfg = STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending'];
                const count = pipeline[k];
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return `<div class="status-legend-item">
                    <span class="status-legend-dot" style="background:${cfg.bg}"></span>
                    <span class="status-legend-name">${cfg.label}</span>
                    <span class="status-legend-count">${count.toLocaleString()}</span>
                    <span class="status-legend-pct">${pct}%</span>
                </div>`;
            }).join('') + `<div class="status-legend-total"><span>Total</span><span>${total.toLocaleString()}</span></div>`;
        }
    }

    // 4. PENDING BACKLOG BY BARANGAY (Horizontal Bar)
    const brgyCtx = document.getElementById('verifierBarangayChart')?.getContext('2d');
    if (brgyCtx) {
        const brgyData = analytics.pending_by_barangay || {};
        const labels = Object.keys(brgyData).map(b => b ? b.charAt(0).toUpperCase() + b.slice(1) : '—');
        const values = Object.values(brgyData);
        const colors = labels.map((_, i) => BRGY_PALETTE[i % BRGY_PALETTE.length]);

        window.verifierCharts.brgy = new Chart(brgyCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ data: values, backgroundColor: colors, borderRadius: { topRight: 6, bottomRight: 6 }, borderSkipped: 'left' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: makeTooltip() },
                scales: {
                    x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
                    y: { grid: { display: false }, ticks: { color: tickColor, font: { weight: '600' } } }
                }
            }
        });
    }

    // 5. DEMOGRAPHIC PROFILE (Radar)
    const radarCtx = document.getElementById('demographicRadarChart')?.getContext('2d');
    if (radarCtx) {
        const demo = analytics.demographics || {};
        const sexData = demo.sex || {};

        const maleCount = sexData['Male'] || sexData['male'] || sexData['M'] || 0;
        const femaleCount = sexData['Female'] || sexData['female'] || sexData['F'] || 0;
        const pwdCount = demo.pwd || 0;
        const fourPsCount = demo.four_ps || 0;
        const ipCount = demo.ip || 0;

        const radarLabels = ['Male', 'Female', 'PWD', '4Ps Member', 'IP'];
        const radarValues = [maleCount, femaleCount, pwdCount, fourPsCount, ipCount];

        window.verifierCharts.radar = new Chart(radarCtx, {
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
                        pointLabels: { color: tickColor, font: { size: 12, weight: '600' } },
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
                    <div class="demo-progress-bar"><div class="demo-progress-fill" style="width:${malePct}%;background:#3b82f6"></div></div>
                    <span class="demo-bar-count">${maleCount.toLocaleString()} <span class="demo-bar-pct">${malePct}%</span></span>
                </div>
                <div class="demo-bar-row">
                    <span class="demo-bar-label"><i class="fas fa-venus" style="color:#ec4899"></i> Female</span>
                    <div class="demo-progress-bar"><div class="demo-progress-fill" style="width:${femalePct}%;background:#ec4899"></div></div>
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

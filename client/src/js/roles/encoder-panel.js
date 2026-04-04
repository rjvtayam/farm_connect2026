/**
 * Encoder Dashboard Functionality
 * Handles: stats, submissions table, search & filter, new registration form
 */

let currentSubmissions = [];
let editingSubmissionId = null;
let pendingPopulateData = null;

// ── Pagination State ──
let subPage = 1;
let subPageSize = 25;
let currentFilteredSubs = [];

// ── Sort State ──
let subSortCol = null;
let subSortDir = 'asc';

// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadSubmissions();
    setupSearchAndFilters();
    loadTrashCount();
    loadActivityFeed();
    loadAnalytics();
    initEncoderSockets();
    initEncoderSortHeaders();

    // Populate barangay filter
    populateEncoderBrgyFilter();

    // Listen for messages from form iframes
    window.addEventListener('message', (event) => {
        if (event.data.type === 'SUBMISSION_UPDATED') {
            showFlashMessage('Submission updated successfully', 'success');
            closeForm();
            loadStats();
            loadSubmissions();
            editingSubmissionId = null;
        } else if (event.data.type === 'FORM_READY') {
            if (pendingPopulateData) {
                const frame = document.getElementById('formFrame');
                if (frame && frame.contentWindow) {
                    frame.contentWindow.postMessage(pendingPopulateData, '*');
                }
                pendingPopulateData = null;
            }
        }
    });

    // ── Real-time polling: refresh data every 15 seconds ──
    setInterval(() => {
        loadStats();
        loadAnalytics();
        loadSubmissions(true); // background refresh — preserve filters & page
    }, 15000);
});

/**
 * Encoder Specific Socket Events
 */
function initEncoderSockets() {
    const socket = window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!socket) return;

    socket.on('new_submission', (data) => {
        loadStats();
        loadSubmissions();
    });

    socket.on('status_updated', (data) => {
        loadStats();
        loadSubmissions();
    });
}

// ── Search & Filter ──
function setupSearchAndFilters() {
    const searchInput = document.getElementById('searchSubmissions');
    const statusFilter = document.getElementById('filterStatus');
    const typeFilter = document.getElementById('filterType');
    const brgyFilter = document.getElementById('filterBarangay');

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    if (typeFilter) {
        typeFilter.addEventListener('change', applyFilters);
    }
    if (brgyFilter) {
        brgyFilter.addEventListener('change', applyFilters);
    }

    // Professional touch: Click search icon to focus
    const searchIcon = document.querySelector('.search-box i');
    if (searchIcon && searchInput) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', () => searchInput.focus());
    }
}

/**
 * Export filtered submissions to CSV
 */
async function exportSubmissions() {
    const btn = document.querySelector('button[onclick="exportSubmissions()"]');
    const originalHtml = btn.innerHTML;
    const search = document.getElementById('searchSubmissions')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const type = document.getElementById('filterType')?.value || '';
    const barangay = document.getElementById('filterBarangay')?.value || '';

    try {
        // Professional UI feedback
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';

        // Construct query parameters
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (type) params.append('form_type', type);
        if (barangay) params.append('barangay', barangay);

        const url = `/encoder/api/submissions/export?${params.toString()}`;

        // Trigger download
        const response = await fetch(url);
        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Get filename from header if possible
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'submissions_export.csv';
        if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
        }

        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();

        showToast('CSV Exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Failed to export CSV. Please try again.', 'error');
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }, 500);
    }
}
function applyFilters(resetPage = true) {
    const term = (document.getElementById('searchSubmissions')?.value || '').toLowerCase().trim();
    const status = (document.getElementById('filterStatus')?.value || '').toLowerCase();
    const type = (document.getElementById('filterType')?.value || '').toLowerCase();
    const barangay = (document.getElementById('filterBarangay')?.value || '').toLowerCase();

    let filtered = currentSubmissions.filter(s => {
        const b = s.beneficiary || {};
        const firstName = b.first_name || '';
        const lastName = b.last_name || '';
        const fullName = `${firstName} ${lastName}`.toLowerCase();
        const brgy = (b.barangay || (b.address && b.address.barangay) || '').toLowerCase();

        const matchesTerm = fullName.includes(term) ||
            (s.form_type || '').toLowerCase().includes(term) ||
            brgy.includes(term) ||
            (b.rsbsa_id || '').toLowerCase().includes(term);

        let currentStatus = (s.status || 'pending').toLowerCase();
        if (currentStatus === 'pending_verification') currentStatus = 'pending';

        const matchesStatus = status === '' || currentStatus === status;
        const matchesType = type === '' || (s.form_type || '').toLowerCase() === type;
        const matchesBrgy = barangay === '' || brgy === barangay;

        return matchesTerm && matchesStatus && matchesType && matchesBrgy;
    });

    // Apply sort
    filtered = applyEncoderSort(filtered);

    currentFilteredSubs = filtered;
    if (resetPage) subPage = 1;
    // Clamp page if current page exceeds total pages after filter
    const totalPages = Math.max(1, Math.ceil(filtered.length / subPageSize));
    if (subPage > totalPages) subPage = totalPages;
    renderSubmissionsPage();
}

// ── Stats ──
function loadStats() {
    fetch('/encoder/api/stats', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                animateCount('mySubmissions', data.stats.total || 0);
                animateCount('approvedCount', data.stats.approved || 0);
                animateCount('verifiedCount', data.stats.verified || 0);
                animateCount('pendingCount', data.stats.pending || 0);
                animateCount('rejectedCount', data.stats.rejected || 0);

                if (data.trends) {
                    updateTrendBadge('mySubmissionsTrend', data.trends.total);
                    updateTrendBadge('approvedCountTrend', data.trends.approved);
                    updateTrendBadge('verifiedCountTrend', data.trends.verified);
                    updateTrendBadge('pendingCountTrend', data.trends.pending);
                    updateTrendBadge('rejectedCountTrend', data.trends.rejected);
                }
            }
        })
        .catch(error => console.error('Error loading stats:', error));
}

// updateTrendBadge() and animateCount() are provided by dashboard-common.js



// ── Submissions Table ──
function loadSubmissions(isBackground = false) {
    const tbody = document.getElementById('submissionsTableBody');
    if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="6"><div class="loading-spinner"></div></td></tr>';

    fetch('/encoder/api/submissions', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentSubmissions = data.submissions;
                // Re-apply current filters (preserve page on background refresh)
                applyFilters(!isBackground);
            }
        })
        .catch(error => {
            console.error('Error loading submissions:', error);
            if (tbody && !isBackground) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load submissions</td></tr>';
        });
}

function renderSubmissionsPage() {
    const total = currentFilteredSubs.length;
    const all = currentSubmissions.length;
    const start = (subPage - 1) * subPageSize;
    const slice = currentFilteredSubs.slice(start, start + subPageSize);

    renderSubmissions(slice, total, all);

    // Render pagination bar
    const container = document.getElementById('submissionsPaginationBar');
    if (container) {
        container.innerHTML = buildEncoderPaginationHTML(subPage, subPageSize, total, 'subPage', 'subPageSize', 'renderSubmissionsPage');
    }
}

window.goToSubPage = function(p) { subPage = p; renderSubmissionsPage(); };
window.changeSubPageSize = function(s) { subPageSize = parseInt(s); subPage = 1; renderSubmissionsPage(); };

function buildEncoderPaginationHTML(page, pageSize, total, pageVar, sizeVar, renderFn) {
    if (total === 0) return '';
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== totalPages) continue;
        pages += `<button class="pagination-btn${i === page ? ' active' : ''}" onclick="goToSubPage(${i})">${i}</button>`;
    }

    return `
    <div class="pagination-bar">
        <span class="pagination-info">Showing ${start}–${end} of ${total}</span>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="goToSubPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            ${pages}
            <button class="pagination-btn" onclick="goToSubPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <select class="pagination-size-select" onchange="changeSubPageSize(this.value)">
            ${[25, 50, 100].map(n => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n} / page</option>`).join('')}
        </select>
    </div>`;
}

function applyEncoderSort(list) {
    if (!subSortCol) return list;
    return [...list].sort((a, b) => {
        let av = '', bv = '';
        const ba = a.beneficiary || {};
        const bb = b.beneficiary || {};
        if (subSortCol === 'name') {
            av = `${ba.last_name || ''} ${ba.first_name || ''}`.toLowerCase();
            bv = `${bb.last_name || ''} ${bb.first_name || ''}`.toLowerCase();
        } else if (subSortCol === 'type') {
            av = (a.form_type || '').toLowerCase();
            bv = (b.form_type || '').toLowerCase();
        } else if (subSortCol === 'status') {
            av = (a.status || '').toLowerCase();
            bv = (b.status || '').toLowerCase();
        } else if (subSortCol === 'date') {
            av = a.submission_date || a.created_at || '';
            bv = b.submission_date || b.created_at || '';
        }
        if (av < bv) return subSortDir === 'asc' ? -1 : 1;
        if (av > bv) return subSortDir === 'asc' ? 1 : -1;
        return 0;
    });
}

function initEncoderSortHeaders() {
    document.querySelectorAll('#submissionsTableBody').forEach(() => {});
    document.querySelectorAll('th.sortable[data-sort]').forEach(th => {
        if (th.closest('#my-submissions')) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (subSortCol === col) {
                    subSortDir = subSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    subSortCol = col;
                    subSortDir = 'asc';
                }
                document.querySelectorAll('#my-submissions th.sortable .sort-icon').forEach(i => {
                    i.className = 'fas fa-sort sort-icon';
                });
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.className = `fas fa-sort-${subSortDir === 'asc' ? 'up' : 'down'} sort-icon active`;
                applyFilters();
            });
        }
    });
}

function populateEncoderBrgyFilter() {
    // Populate the Barangay filter dropdown dynamically from available submissions
    const filterSelect = document.getElementById('filterBarangay');
    if (!filterSelect) return;

    const barangays = [...new Set(currentSubmissions.map(s => {
        const b = s.beneficiary || {};
        return b.barangay || (b.address && b.address.barangay);
    }).filter(Boolean))].sort();

    const currentVal = filterSelect.value;
    let html = '<option value="">All Barangays</option>';
    barangays.forEach(b => {
        html += `<option value="${b.toLowerCase()}" ${currentVal === b.toLowerCase() ? 'selected' : ''}>${b}</option>`;
    });
    filterSelect.innerHTML = html;
}

function renderSubmissions(list, filteredCount, totalCount) {
    const tbody = document.getElementById('submissionsTableBody');
    if (!tbody) return;

    // Update result count badge
    const badge = document.getElementById('submissionResultCount');
    if (badge) {
        const total = totalCount !== undefined ? totalCount : currentSubmissions.length;
        const shown = filteredCount !== undefined ? filteredCount : list.length;
        badge.textContent = shown < total ? `${shown} of ${total}` : `${total}`;
        badge.style.display = shown > 0 ? '' : 'none';
    }

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>No submissions yet. Start by creating a new registration.</p>
                </div>
            </td></tr>`;
        // Render empty pagination
        const pb = document.getElementById('submissionsPaginationBar');
        if (pb) pb.innerHTML = '';
        return;
    }

    tbody.innerHTML = list.map(s => {
        const b = s.beneficiary || {};
        const name = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'Unknown';
        const type = s.form_type || 'rsbsa';
        const barangay = b.barangay || (b.address && b.address.barangay) || '—';

        let status = s.status || 'pending';
        let statusClass = status.toLowerCase();
        let statusLabel = status;

        if (statusClass === 'pending_verification' || statusClass === 'pending') {
            statusClass = 'pending';
            statusLabel = 'Pending';
        } else if (statusClass === 'approved') {
            statusLabel = 'Approved';
        } else if (statusClass === 'verified') {
            statusLabel = 'Verified';
        } else if (statusClass === 'rejected') {
            statusLabel = 'Rejected';
        }

        const date = s.submission_date || s.created_at;
        const isEditable = (statusClass === 'pending' || statusClass === 'rejected');
        const isApproved = statusClass === 'approved';

        // Rejection remarks tooltip
        const remarksAttr = (statusClass === 'rejected' && s.remarks)
            ? ` title="Verifier Remarks: ${s.remarks.replace(/"/g, '&quot;')}"` : '';
        const remarksIcon = (statusClass === 'rejected' && s.remarks)
            ? ` <i class="fas fa-exclamation-circle" style="color:#ef4444;font-size:0.75rem;cursor:help;" title="${s.remarks.replace(/"/g, '&quot;')}"></i>` : '';

        return `
        <tr${remarksAttr}>
            <td><span style="font-weight:600;color:var(--text-dark)">${name}</span></td>
            <td><span class="badge badge-type">${type.toUpperCase()}</span></td>
            <td style="color:var(--text-light);font-size:0.85rem">${barangay}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span>${remarksIcon}</td>
            <td style="color:var(--text-light);font-size:0.85rem">${formatDate(date)}</td>
            <td>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-primary btn-sm" onclick="viewSubmission(${s.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isEditable ? `<button class="btn btn-warning btn-sm" onclick="editSubmission(${s.id})" title="Edit Submission"><i class="fas fa-edit"></i></button>` : ''}
                    ${isApproved ? `<button class="btn btn-success btn-sm" onclick="downloadSubmissionPdf(${s.id}, '${type}')" title="Download PDF"><i class="fas fa-download"></i></button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="softDeleteSubmission(${s.id})" title="Move to Trash">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Always render pagination bar after table
    let pb = document.getElementById('submissionsPaginationBar');
    if (!pb) {
        const tableContainer = document.getElementById('submissionsTableBody').closest('.table-container');
        if (tableContainer) {
            pb = document.createElement('div');
            pb.id = 'submissionsPaginationBar';
            tableContainer.insertAdjacentElement('afterend', pb);
        }
    }
}

window.viewSubmission = function (id) {
    const csrfToken = getCSRFToken();

    fetch(`/encoder/api/submissions/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) throw new Error('Failed to load submission details');

            const sub = data.submission;
            const type = sub.form_type || 'rsbsa';

            // For non-RSBSA forms, show a structured detail card modal
            if (type !== 'rsbsa') {
                const b = sub.beneficiary || {};
                const name = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'Unknown';
                const statusClass = sub.status || 'pending';
                const remarksHtml = sub.remarks
                    ? `<div style="margin-top:1rem;padding:0.75rem 1rem;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;color:#e11d48;font-size:0.875rem;">
                        <i class="fas fa-exclamation-circle"></i> <strong>Verifier Remarks:</strong> ${sub.remarks}
                       </div>` : '';

                const modalHtml = `
                <div id="detailCardOverlay_${id}" class="modal" style="display:flex;z-index:10000;">
                    <div class="modal-overlay" onclick="this.closest('.modal').remove()" style="position:fixed;top:0;left:0;width:100%;height:100%;"></div>
                    <div class="modal-content" style="max-width:520px;width:95%;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);position:relative;margin:auto;overflow:hidden;">
                        <div class="modal-header" style="padding:1rem 1.5rem;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;">
                            <h3 style="margin:0;font-size:1.05rem;font-weight:700;color:#334155;display:flex;align-items:center;gap:0.5rem;">
                                <i class="fas fa-file-alt" style="color:var(--primary);"></i> Submission Details
                            </h3>
                            <button onclick="this.closest('.modal').remove()" style="background:#e2e8f0;color:#475569;border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;">&times;</button>
                        </div>
                        <div class="modal-body" style="padding:1.5rem;">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                                <div style="background:#f8fafc;padding:0.75rem;border-radius:10px;border:1px solid #e2e8f0;">
                                    <span style="font-size:0.65rem;color:#64748b;text-transform:uppercase;font-weight:700;">Beneficiary</span>
                                    <p style="margin:4px 0 0 0;font-weight:700;color:#1e293b;font-size:0.95rem;">${name}</p>
                                </div>
                                <div style="background:#f8fafc;padding:0.75rem;border-radius:10px;border:1px solid #e2e8f0;">
                                    <span style="font-size:0.65rem;color:#64748b;text-transform:uppercase;font-weight:700;">Form Type</span>
                                    <p style="margin:4px 0 0 0;"><span class="badge badge-type">${type.toUpperCase()}</span></p>
                                </div>
                                <div style="background:#f8fafc;padding:0.75rem;border-radius:10px;border:1px solid #e2e8f0;">
                                    <span style="font-size:0.65rem;color:#64748b;text-transform:uppercase;font-weight:700;">Status</span>
                                    <p style="margin:4px 0 0 0;"><span class="status-badge ${statusClass}">${statusClass}</span></p>
                                </div>
                                <div style="background:#f8fafc;padding:0.75rem;border-radius:10px;border:1px solid #e2e8f0;">
                                    <span style="font-size:0.65rem;color:#64748b;text-transform:uppercase;font-weight:700;">Barangay</span>
                                    <p style="margin:4px 0 0 0;font-size:0.875rem;color:#1e293b;">${b.barangay || '—'}</p>
                                </div>
                            </div>
                            <div style="background:#f0fdf4;padding:0.75rem 1rem;border-radius:10px;border:1px solid #bbf7d0;font-size:0.8rem;color:#166534;">
                                <i class="fas fa-info-circle"></i> Full PDF document viewer for <strong>${type.toUpperCase()}</strong> forms is coming soon.
                            </div>
                            ${remarksHtml}
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                return;
            }

            // RSBSA: Show PDF viewer
            showFlashMessage('Preparing PDF document for viewing...', 'info');

            const parsed = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : (sub.data_json || {});

            return fetch('/forms/download/rsba-enrollment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(parsed),
            }).then(res => {
                if (!res.ok) throw new Error('PDF generation failed on server');
                return { blob: res.blob(), sub: sub };
            }).then(result => result.blob.then(blobData => ({ blob: blobData, sub: result.sub })))
            .then(result => {
                const url = URL.createObjectURL(result.blob);
                const modalHtml = `
                <div id="viewPdfOverlay_${result.sub.id}" class="modal premium-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-overlay" onclick="closePdfViewer('viewPdfOverlay_${result.sub.id}', '${url}')" style="position:fixed; top:0; left:0; width:100%; height:100%;"></div>
                    <div class="modal-content premium-modal-content" style="max-width:1000px; width:95%; height:90vh; background:white; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); position:relative; margin:auto; overflow:hidden; display:flex; flex-direction:column;">
                        <div class="modal-header" style="padding:1rem 1.5rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                            <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:#334155; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fas fa-file-pdf" style="color:#ef4444;"></i> Document Viewer: RSBSA Form
                            </h3>
                            ${result.sub.remarks ? `
                            <div style="margin-left: 2rem; padding: 0.4rem 1rem; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 20px; color: #e11d48; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-exclamation-circle"></i> Feedback: ${result.sub.remarks}
                            </div>` : ''}
                            <div style="display:flex; gap:0.5rem;">
                                <button onclick="printPdfIframe('pdfViewerFrame_${result.sub.id}')" style="background:#3b82f6; color:white; border:none; padding:0.5rem 1rem; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.85rem;">
                                    <i class="fas fa-print"></i> Print
                                </button>
                                <button onclick="closePdfViewer('viewPdfOverlay_${result.sub.id}', '${url}')" style="background:#e2e8f0; color:#475569; border:none; width:34px; height:34px; border-radius:8px; cursor:pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="modal-body" style="padding:0; flex-grow:1; background:#525659; position:relative;">
                            <iframe id="pdfViewerFrame_${result.sub.id}" src="${url}#toolbar=0&navpanes=0&scrollbar=1" style="width:100%; height:100%; border:none;" title="PDF Viewer"></iframe>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            });
        })
        .catch(err => {
            console.error('Error viewing submission:', err);
            showFlashMessage(err.message || 'Failed to load viewer', 'error');
        });
};



window.downloadSubmissionPdf = function (id, type) {
    if (type !== 'rsbsa') {
        showFlashMessage('PDF download is currently only supported for RSBSA forms.', 'warn');
        return;
    }

    const csrfToken = getCSRFToken();
    showFlashMessage('Generating PDF, please wait...', 'info');

    // 1. Fetch the submission data
    fetch(`/encoder/api/submissions/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) throw new Error('Failed to fetch submission data');

            const sub = data.submission;
            const parsed = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : (sub.data_json || {});

            // 2. Send data to PDF generator endpoint
            return fetch('/forms/download/rsba-enrollment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(parsed),
            });
        })
        .then(res => {
            if (!res.ok) throw new Error('PDF generation failed on server');
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RSBSA_Enrollment_Form_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showFlashMessage('PDF downloaded successfully!', 'success');
        })
        .catch(err => {
            console.error('Download error:', err);
            showFlashMessage('Failed to generate PDF: ' + err.message, 'error');
        });
};

window.editSubmission = function (id) {
    const csrfToken = getCSRFToken();

    fetch(`/encoder/api/submissions/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showFlashMessage(data.message || 'Error loading submission', 'error');
                return;
            }

            const sub = data.submission;
            editingSubmissionId = id;

            // Open the appropriate form
            const type = sub.form_type || 'rsbsa';

            // Wait for iframe to be ready, then send population data
            const parsed = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : (sub.data_json || {});
            pendingPopulateData = {
                type: 'POPULATE_FORM',
                data: parsed,
                submissionId: id,
                isViewOnly: false
            };

            openForm(type, true); // force open to guarantee reload and FORM_READY event
        })
        .catch(err => {
            console.error('Error editing submission:', err);
            showFlashMessage('Failed to load submission for editing', 'error');
        });
};

// ── Encoder Activity Feed ─────────────────────────────────────────────────────


// ── Form Viewer (inline iframe) ─────────────────────────────────────────────

const FORM_MAP = {
    rsbsa: { url: '/forms/rsba-enrollment', title: 'RSBSA Enrollment Form' },
    fish: { url: '/forms/fish-registration', title: 'Fisherfolk Registration Form' },
    boat: { url: '/forms/boat-registration', title: 'Boat Registration Form' },
    ncfrs: { url: '/forms/ncfrs', title: 'NCFRS Enrollment Form' },
};

let currentForm = null;

window.openForm = function (type, forceOpen = false) {
    const entry = FORM_MAP[type];
    if (!entry) return;

    // Toggle: if clicking the same button that's already active, close it
    // Unless forceOpen is true, which forces a reload regardless
    if (currentForm === type && !forceOpen) {
        closeForm();
        return;
    }
    currentForm = type;

    // Highlight the active action card
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('active'));
    const activeCard = document.querySelector(`.action-card[data-form="${type}"]`);
    if (activeCard) activeCard.classList.add('active');

    // Set title + iframe src
    const titleEl = document.getElementById('formViewerTitle');
    if (titleEl) titleEl.textContent = entry.title;

    // Force reload by setting src to blank then URL
    const frame = document.getElementById('formFrame');
    if (frame) {
        if (forceOpen && frame.src.includes(entry.url)) {
            frame.src = 'about:blank';
            setTimeout(() => { frame.src = entry.url; }, 10);
        } else {
            frame.src = entry.url;
        }
    }

    // Hide dashboard container, show form viewer
    const dashContainer = document.querySelector('.dashboard-container');
    const formViewer = document.getElementById('form-viewer');
    if (dashContainer) dashContainer.style.display = 'none';
    if (formViewer) formViewer.style.display = 'flex';
};

window.closeForm = function () {
    currentForm = null;

    // Remove active from all cards
    document.querySelectorAll('.action-card').forEach(c => c.classList.remove('active'));

    // Clear iframe
    const frame = document.getElementById('formFrame');
    if (frame) frame.src = '';

    // Show dashboard container, hide form viewer
    const dashContainer = document.querySelector('.dashboard-container');
    const formViewer = document.getElementById('form-viewer');
    if (dashContainer) dashContainer.style.display = '';
    if (formViewer) formViewer.style.display = 'none';
};

// ═══════════════════════════════════════════════════════
// System Settings — Profile, Password, Account Deletion
// ═══════════════════════════════════════════════════════


// ==========================================
// MASS IMPORT LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const importForm = document.getElementById('massImportForm');
    const dropZone = document.getElementById('massImportDropZone');
    const fileInput = document.getElementById('massImportFile');
    const fileNameDisplay = document.getElementById('massImportFileName');
    const submitBtn = document.getElementById('massImportBtn');

    if (!importForm || !dropZone || !fileInput) return;

    // Handle Drag & Drop styles
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
    }

    function unhighlight(e) {
        dropZone.style.borderColor = '#cbd5e1';
        dropZone.style.backgroundColor = 'transparent';
    }

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            fileInput.files = files;
            updateFileName();
        }
    }

    // Handle click/select files
    fileInput.addEventListener('change', updateFileName);

    function updateFileName() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];

            // Validate file type
            const validTypes = ['.csv', '.xlsx', '.xls'];
            const isValid = validTypes.some(ext => file.name.toLowerCase().endsWith(ext));

            if (!isValid) {
                showToast('Invalid file format. Please upload a .csv or .xlsx file.', 'error');
                fileInput.value = '';
                fileNameDisplay.style.display = 'none';
                return;
            }

            const fileNameSpan = fileNameDisplay.querySelector('.name-text');
            fileNameSpan.textContent = file.name;
            fileNameDisplay.style.display = 'inline-flex';

            // Change color based on type
            if (file.name.toLowerCase().endsWith('.csv')) {
                fileNameDisplay.innerHTML = '<i class="fas fa-file-csv"></i> <span class="name-text">' + file.name + '</span>';
            } else {
                fileNameDisplay.innerHTML = '<i class="fas fa-file-excel"></i> <span class="name-text">' + file.name + '</span>';
            }
        } else {
            fileNameDisplay.style.display = 'none';
        }
    }

    // Handle Form Submission
    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        const formType = document.getElementById('massImportFormType').value;

        if (!file) {
            showToast('Please select a file to import.', 'error');
            return;
        }

        if (!formType) {
            showToast('Please select a target form type.', 'error');
            return;
        }

        // Setup UI for loading
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('import_file', file);
        formData.append('form_type', formType);

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
            const response = await fetch('/forms/import/mass', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken
                },
                body: formData
            });

            // We implemented it at /api/forms/import/mass but checking the python file, 
            // it's registered under @forms_bp.route('/import/mass') which mounts to /api/forms/import/mass based on standard setup

            const result = await response.json();

            if (response.ok && result.success) {
                showToast(result.message, 'success');

                // Show errors if parsing partially failed
                if (result.error_count > 0) {
                    setTimeout(() => {
                        showToast(`Encountered ${result.error_count} errors. Check console.`, 'warning');
                        console.error("Mass Import Errors:", result.errors);
                    }, 500);
                }

                // Reset form
                importForm.reset();
                fileNameDisplay.style.display = 'none';

                // Refresh encoder lists
                if (typeof loadSubmissions === 'function') loadSubmissions();
                if (typeof updateStats === 'function') updateStats();

                // Switch back to submissions tab automatically
                document.querySelector('a[href="#my-submissions"]').click();
            } else {
                showToast(result.message || 'Error processing import.', 'error');
            }
        } catch (error) {
            console.error('Mass import error:', error);
            showToast('A network or server error occurred during import.', 'error');
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
});

// ── Trash Bin Functions ─────────────────────────────────────────────────────

const TRASH_API_BASE = '/encoder';

window.softDeleteSubmission = async function(id) {
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
        const res = await fetch(`${TRASH_API_BASE}/api/submissions/${id}/soft-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Submission moved to trash', 'success');
            loadSubmissions();
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
        const res = await fetch(`${TRASH_API_BASE}/api/trash`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            renderTrashItems(data.items);
        }
    } catch (e) {
        document.getElementById('trashModalBody').innerHTML = '<div class="trash-empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Failed to load</h4><p>Please try again</p></div>';
    }
};

window.closeTrashBin = function(e) {
    if (e && e.target && !e.target.classList.contains('trash-modal-overlay')) return;
    document.getElementById('trashModalOverlay').classList.remove('active');
};

function renderTrashItems(items) {
    const body = document.getElementById('trashModalBody');
    if (!items || items.length === 0) {
        body.innerHTML = '<div class="trash-empty-state"><i class="fas fa-recycle"></i><h4>Trash is empty</h4><p>Deleted submissions will appear here</p></div>';
        return;
    }
    body.innerHTML = items.map(item => {
        const b = item.beneficiary || {};
        const name = b.full_name || item.beneficiary_name || 'Unknown';
        const type = item.form_type || 'rsbsa';
        const deletedAt = item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
        return `
        <div class="trash-item">
            <div class="trash-item-info">
                <div class="trash-item-name">${name}</div>
                <div class="trash-item-meta">
                    <span><i class="fas fa-file-alt"></i> ${type.toUpperCase()}</span>
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
        const res = await fetch(`${TRASH_API_BASE}/api/trash/${id}/restore`, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCSRFToken() },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Submission restored successfully', 'success');
            openTrashBin();
            loadSubmissions();
            loadStats();
            loadTrashCount();
        } else {
            showFlashMessage(data.message || 'Restore failed', 'error');
        }
    } catch (e) {
        showFlashMessage('Network error', 'error');
    }
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
        const res = await fetch(`${TRASH_API_BASE}/api/trash/${id}/permanent`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCSRFToken() },
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            showFlashMessage('Permanently deleted', 'success');
            openTrashBin();
            loadTrashCount();
        } else {
            showFlashMessage(data.message || 'Delete failed', 'error');
        }
    } catch (e) {
        showFlashMessage('Network error', 'error');
    }
};

async function loadTrashCount() {
    try {
        const res = await fetch(`${TRASH_API_BASE}/api/trash/count`, { credentials: 'include' });
        const data = await res.json();
        const badge = document.getElementById('trashBadge');
        if (badge && data.success) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) { /* silent */ }
}

// ── Analytics Module ──
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
    fetch('/encoder/api/analytics', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.analytics) {
                const newDataStr = JSON.stringify(data.analytics);

                // Prevent destroying and re-rendering charts if data hasn't changed
                if (window._lastEncoderAnalyticsStr !== newDataStr) {
                    window._lastEncoderAnalyticsStr = newDataStr;
                    renderCharts(data.analytics);
                    populateAnalyticsKPIs(data.analytics);
                }

                // Update "Last Updated" timestamp
                const lastUpdatedEl = document.getElementById('encoderAnalyticsLastUpdated');
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
    const total = Object.values(statusData).reduce((s, v) => s + v, 0);

    const kpiTotal = document.getElementById('encKpiTotal');
    const kpiApproved = document.getElementById('encKpiApproved');
    const kpiPending = document.getElementById('encKpiPending');
    const kpiRejected = document.getElementById('encKpiRejected');
    const kpiRate = document.getElementById('encKpiRate');

    if (kpiTotal) kpiTotal.textContent = total.toLocaleString();
    if (kpiApproved) kpiApproved.textContent = approved.toLocaleString();
    if (kpiPending) kpiPending.textContent = pending.toLocaleString();
    if (kpiRejected) kpiRejected.textContent = rejected.toLocaleString();
    
    if (kpiRate) {
        const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
        kpiRate.textContent = `${rate}%`;
    }

    // Update year badge
    const growth = analytics.growth || {};
    const yearLabel = document.getElementById('encoderAnalyticsYearLabel');
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
    if (window.encoderCharts) {
        Object.values(window.encoderCharts).forEach(c => { try { c.destroy(); } catch (e) { } });
    }
    window.encoderCharts = {};

    const isDark = document.documentElement.dataset.theme === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    // ─────────────────────────────────────────────────────────────
    // 1. MONTHLY YEAR-OVER-YEAR COMPARISON (Line — Full Width)
    // ─────────────────────────────────────────────────────────────
    const monthlyCtx = document.getElementById('encoderMonthlyChart')?.getContext('2d');
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

        window.encoderCharts.monthly = new Chart(monthlyCtx, {
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
        const legendEl = document.getElementById('encoderMonthlyLegend');
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
    const typeCtx = document.getElementById('encoderTypeChart')?.getContext('2d');
    if (typeCtx) {
        const typesData = analytics.types || {};
        const typeLabels = Object.keys(typesData).map(k => k.toUpperCase());
        const typeValues = Object.values(typesData);
        const typeBgColors = Object.keys(typesData).map(k => TYPE_COLOR_MAP[k.toLowerCase()] || '#6366f1');

        window.encoderCharts.type = new Chart(typeCtx, {
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
    const statusCtx = document.getElementById('encoderStatusChart')?.getContext('2d');
    if (statusCtx) {
        const rawStatus = analytics.status || {};
        const total = Object.values(rawStatus).reduce((s, v) => s + v, 0);

        // Map each status key to its semantic color — never rely on order
        const statusKeys = Object.keys(rawStatus);
        const statusValues = statusKeys.map(k => rawStatus[k]);
        const statusColors = statusKeys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).bg);
        const statusLabels = statusKeys.map(k => (STATUS_COLOR_MAP[k] || STATUS_COLOR_MAP['pending']).label);

        window.encoderCharts.status = new Chart(statusCtx, {
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
        const legendListEl = document.getElementById('encoderStatusLegendList');
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
    const brgyCtx = document.getElementById('encoderBarangayChart')?.getContext('2d');
    if (brgyCtx) {
        const brgyData = analytics.barangays || {};
        const brgyLabels = Object.keys(brgyData).map(b => b ? b.charAt(0).toUpperCase() + b.slice(1) : '—');
        const brgyValues = Object.values(brgyData);
        const brgyColors = brgyLabels.map((_, i) => BRGY_PALETTE[i % BRGY_PALETTE.length]);

        window.encoderCharts.brgy = new Chart(brgyCtx, {
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
    const radarCtx = document.getElementById('encoderDemographicRadarChart')?.getContext('2d');
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

        window.encoderCharts.radar = new Chart(radarCtx, {
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
                scales: {
                    r: {
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: {
                            color: tickColor,
                            font: { family: "'Inter', sans-serif", size: 12, weight: '500' }
                        },
                        ticks: { display: false, stepSize: Math.max(1, Math.ceil(Math.max(...radarValues) / 5)) }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: makeTooltip()
                }
            }
        });

        // Render the demographic breakdown sidebar
        const breakdownEl = document.getElementById('encoderDemographicBreakdown');
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
                        <span class="demo-chip-label">Indigenous</span>
                    </div>
                </div>
            `;
        }
    }
}





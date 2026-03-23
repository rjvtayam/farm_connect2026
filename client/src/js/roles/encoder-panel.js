/**
 * Encoder Dashboard Functionality
 * Handles: stats, submissions table, search & filter, new registration form
 */

let currentSubmissions = [];
let editingSubmissionId = null; // Track if we are editing an existing submission
let pendingPopulateData = null; // Data waiting for the iframe to be ready

// Load data on page load
document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    loadSubmissions();
    setupSearchAndFilters();
    loadTrashCount();
    initEncoderSockets();

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
        loadSubmissions();
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

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    if (typeFilter) {
        typeFilter.addEventListener('change', applyFilters);
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

    try {
        // Professional UI feedback
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';

        // Construct query parameters
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);

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
async function applyFilters() {
    const term = (document.getElementById('searchSubmissions')?.value || '').toLowerCase().trim();
    const status = (document.getElementById('filterStatus')?.value || '').toLowerCase();
    const type = (document.getElementById('filterType')?.value || '').toLowerCase();

    const filtered = currentSubmissions.filter(s => {
        const b = s.beneficiary || {};
        const firstName = b.first_name || '';
        const lastName = b.last_name || '';
        const fullName = `${firstName} ${lastName}`.toLowerCase();

        const matchesTerm = fullName.includes(term) ||
            (s.form_type || '').toLowerCase().includes(term) ||
            (b.rsbsa_id || '').toLowerCase().includes(term);

        let currentStatus = (s.status || 'pending').toLowerCase();

        // Map pending_verification to pending for filtering consistency
        if (currentStatus === 'pending_verification') currentStatus = 'pending';

        const matchesStatus = status === '' || currentStatus === status;
        const matchesType = type === '' || (s.form_type || '').toLowerCase() === type;

        return matchesTerm && matchesStatus && matchesType;
    });

    renderSubmissions(filtered);
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
function loadSubmissions() {
    const tbody = document.getElementById('submissionsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5"><div class="loading-spinner"></div></td></tr>';

    fetch('/encoder/api/submissions', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentSubmissions = data.submissions;
                renderSubmissions(currentSubmissions);
            }
        })
        .catch(error => {
            console.error('Error loading submissions:', error);
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light)">Failed to load submissions</td></tr>';
        });
}

function renderSubmissions(list) {
    const tbody = document.getElementById('submissionsTableBody');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `
            <tr><td colspan="5">
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <p>No submissions yet. Start by creating a new registration.</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(s => {
        const b = s.beneficiary || {};
        const name = b.full_name || 'Unknown';
        const type = s.form_type || 'rsba';

        let status = s.status || 'pending';
        let statusClass = status.toLowerCase();
        let statusLabel = status;

        if (statusClass === 'pending_verification' || statusClass === 'pending') {
            statusClass = 'pending';
            statusLabel = 'Pending';
        } else if (statusClass === 'approved') {
            statusLabel = 'Approved';
        } else if (statusClass === 'rejected') {
            statusLabel = 'Rejected';
        }

        const date = s.submission_date || s.created_at;

        return `
        <tr>
            <td><span style="font-weight:600;color:var(--text-dark)">${name}</span></td>
            <td><span class="badge badge-type">${type.toUpperCase()}</span></td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td style="color:var(--text-light);font-size:0.85rem">${formatDate(date)}</td>
            <td>
                <button class="btn-icon" onclick="viewSubmission(${s.id})" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon" onclick="editSubmission(${s.id})" title="Edit Submission">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="downloadSubmissionPdf(${s.id}, '${type}')" title="Download PDF">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn-icon delete" onclick="softDeleteSubmission(${s.id})" title="Move to Trash">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.viewSubmission = function (id) {
    const csrfToken = getCSRFToken();

    // Show a loading indicator since PDF generation might take a second
    showFlashMessage('Preparing PDF document for viewing...', 'info');

    // 1. Fetch the submission data first to know its type and get the raw JSON
    fetch(`/encoder/api/submissions/${id}`, { headers: { 'X-CSRFToken': csrfToken } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) throw new Error('Failed to load submission details');

            const sub = data.submission;
            const type = sub.form_type || 'rsbsa';

            if (type !== 'rsbsa') {
                showFlashMessage('PDF view is currently only supported for RSBSA forms.', 'warn');
                return;
            }

            const parsed = typeof sub.data_json === 'string' ? JSON.parse(sub.data_json) : (sub.data_json || {});

            // 2. Request the generated PDF from the backend
            return fetch('/forms/download/rsba-enrollment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(parsed),
            }).then(res => {
                if (!res.ok) throw new Error('PDF generation failed on server');
                return { blob: res.blob(), sub: sub };
            });
        })
        .then(result => {
            if (!result) return;
            return result.blob.then(blobData => ({ blob: blobData, sub: result.sub }));
        })
        .then(result => {
            if (!result) return;

            const url = URL.createObjectURL(result.blob);

            // 3. Create a clean, large modal to display the PDF inline
            const modalHtml = `
            <div id="viewPdfOverlay_${result.sub.id}" class="modal premium-overlay" style="display:flex; z-index:10000;">
                <div class="modal-overlay" onclick="closePdfViewer('viewPdfOverlay_${result.sub.id}', '${url}')" style="position:fixed; top:0; left:0; width:100%; height:100%;"></div>
                <div class="modal-content premium-modal-content" style="max-width:1000px; width:95%; height:90vh; background:white; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); position:relative; margin:auto; overflow:hidden; display:flex; flex-direction:column;">
                    <div class="modal-header" style="padding:1rem 1.5rem; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                        <h3 style="margin:0; font-size:1.1rem; font-weight:700; color:#334155; display:flex; align-items:center; gap:0.5rem;">
                            <i class="fas fa-file-pdf" style="color:#ef4444;"></i> Document Viewer: RSBSA Form
                        </h3>
                        ${result.sub.remarks ? `
                        <div style="margin-left: 2rem; padding: 0.4rem 1rem; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 20px; color: #e11d48; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; animation: pulse 2s infinite;">
                            <i class="fas fa-exclamation-circle"></i> Feedback: ${result.sub.remarks}
                        </div>
                        ` : ''}
                        <div style="display:flex; gap:0.5rem;">
                            <button onclick="printPdfIframe('pdfViewerFrame_${result.sub.id}')" style="background:#3b82f6; color:white; border:none; padding:0.5rem 1rem; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:0.3rem; transition: background 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                                <i class="fas fa-print"></i> Print
                            </button>
                            <button onclick="closePdfViewer('viewPdfOverlay_${result.sub.id}', '${url}')" style="background:#e2e8f0; color:#475569; border:none; width:34px; height:34px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1rem; transition: background 0.2s;">
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
        })
        .catch(err => {
            console.error('Error viewing submission PDF:', err);
            showFlashMessage(err.message || 'Failed to load PDF viewer', 'error');
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

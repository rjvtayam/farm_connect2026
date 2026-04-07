/**
 * Boat Registration Form — JavaScript
 * Supports: signature pad, thumbmark upload, PDF download, DB submit.
 * Design matched to RSBSA premium form pattern.
 */

/* ═══════════════════════════════  STATE  ══════════════════════════════ */
const signaturePads = {};
let _editingSubmissionId = null; // Set by POPULATE_FORM message when in edit mode

/* ══════════════════════════════════  INIT  ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initSignaturePad('ownerSignature', 'owner');
    initThumbmarkUpload();
    setupEventListeners();
    bindFormSubmit();

    // Signal parent that the form is ready to receive data
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'FORM_READY' }, '*');
    }
});

/* ═════════════════════════  EDIT MODE LISTENER  ════════════════════════════ */
window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'POPULATE_FORM') return;
    const { data, submissionId } = event.data;
    _editingSubmissionId = submissionId || null;
    if (data) populateForm(data);
});

/**
 * Populate all boat form fields from stored nested JSON.
 */
function populateForm(d) {
    const owner  = d.owner        || {};
    const vessel = d.vessel       || {};
    const dim    = d.dimensions   || {};
    const prop   = d.propulsion   || {};
    const cert   = d.certification || {};

    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    const setCheck = (name, vals) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
            cb.checked = Array.isArray(vals) ? vals.includes(cb.value) : cb.value === vals;
        });
    };

    set('province',        d.province);
    set('municipality',    d.municipality);
    set('mfvrNo',          d.mfvrNo);
    set('dateApplication', d.dateApplication);
    setCheck('regType',    d.registrationType);

    // Owner
    set('ownerName',    owner.name);
    set('ownerAddress', owner.address);

    // Vessel
    set('homeport',   vessel.homeport);
    set('vesselName', vessel.name);
    set('vesselType', vessel.type);
    set('placeBuilt', vessel.placeBuilt);
    set('yearBuilt',  vessel.yearBuilt);
    setCheck('material', vessel.materials);

    // Dimensions
    set('regLength',       dim.regLength);
    set('regBreadth',      dim.regBreadth);
    set('regDepth',        dim.regDepth);
    set('tonnageLength',   dim.tonnageLength);
    set('tonnageBreadth',  dim.tonnageBreadth);
    set('tonnageDepth',    dim.tonnageDepth);
    set('grossTonnage',    dim.grossTonnage);
    set('netTonnage',      dim.netTonnage);

    // Propulsion
    set('engineMake',   prop.engineMake);
    set('serialNumber', prop.serialNumber);
    set('horsepower',   prop.horsepower);

    // Fishing gear
    setCheck('gear', d.fishingGear);
    set('gearsOther', d.gearsOther);

    // Certification
    set('ownerPrintedName', cert.ownerPrintedName);

    // Show edit banner and change submit button
    if (_editingSubmissionId) {
        let banner = document.getElementById('editBannerInfo');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'editBannerInfo';
            banner.style.cssText = 'background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:0.6rem 1rem;border-radius:8px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;';
            banner.innerHTML = '<i class="fas fa-edit"></i> Editing existing submission — changes will update the record.';
            document.querySelector('form')?.prepend(banner);
        }
        
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes & Re-submit';
    }
}


/* ══════════════════════════════  FORM INIT  ═══════════════════════════════ */
function initializeForm() {
    const today = new Date().toISOString().split('T')[0];
    const dateField = document.getElementById('dateApplication');
    if (dateField) dateField.value = today;
}

/* ═══════════════════════════  EVENT LISTENERS  ════════════════════════════ */
function setupEventListeners() {
    // Registration type checkboxes (only one can be selected)
    const regTypeCheckboxes = document.querySelectorAll('input[name="regType"]');
    regTypeCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                regTypeCheckboxes.forEach(cb => {
                    if (cb !== this) cb.checked = false;
                });
            }
        });
    });

    // Auto-fill owner printed name
    const ownerPrintedName = document.getElementById('ownerPrintedName');
    if (ownerPrintedName) {
        ownerPrintedName.addEventListener('focus', function () {
            if (!this.value) {
                const ownerName = document.getElementById('ownerName')?.value || '';
                this.value = ownerName.toUpperCase();
            }
        });
    }
}

/* ═══════════════════════════  THUMBMARK UPLOAD  ═══════════════════════════ */
function initThumbmarkUpload() {
    const input = document.getElementById('thumbmarkUpload');
    const preview = document.getElementById('thumbmarkPreview');
    const hint = document.getElementById('thumbmarkHint');
    if (!input) return;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            preview.src = ev.target.result;
            preview.style.display = 'block';
            if (hint) hint.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

/* ═══════════════════════════  SIGNATURE PAD  ══════════════════════════════ */
function initSignaturePad(canvasId, padName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#111827';
        ctx.lineCap = 'round';
    }
    resize();
    window.addEventListener('resize', resize);

    function getPos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX || e.pageX) - r.left, y: (e.clientY || e.pageY) - r.top };
    }

    function startSig(e) {
        isDrawing = true;
        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function drawSig(e) {
        if (!isDrawing) return;
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    function stopSig() { isDrawing = false; }

    canvas.addEventListener('mousedown', startSig);
    canvas.addEventListener('mousemove', drawSig);
    canvas.addEventListener('mouseup', stopSig);
    canvas.addEventListener('mouseleave', stopSig);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); startSig(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); drawSig(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend', stopSig);

    signaturePads[padName] = { canvas, ctx };
}

function clearSignature(padName) {
    if (signaturePads[padName]) {
        const { canvas, ctx } = signaturePads[padName];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/* ═══════════════════════════════  VALIDATION  ═════════════════════════════ */
function validateForm() {
    const requiredFields = ['ownerName', 'ownerAddress', 'vesselName'];
    let valid = true;

    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.remove('field-error');
        if (!field.value.trim()) {
            field.classList.add('field-error');
            valid = false;
        }
    });

    if (!valid) showToast('Please fill in all required fields.', 'warn');
    return valid;
}

/* ══════════════════════════  COLLECT FORM DATA  ════════════════════════════ */
function collectFormData() {
    return {
        province: document.getElementById('province')?.value || '',
        municipality: document.getElementById('municipality')?.value || '',
        mfvrNo: document.getElementById('mfvrNo')?.value || '',
        dateApplication: document.getElementById('dateApplication')?.value || '',
        registrationType: Array.from(document.querySelectorAll('input[name="regType"]:checked')).map(cb => cb.value),
        owner: {
            name: document.getElementById('ownerName')?.value || '',
            address: document.getElementById('ownerAddress')?.value || ''
        },
        vessel: {
            homeport: document.getElementById('homeport')?.value || '',
            name: document.getElementById('vesselName')?.value || '',
            type: document.querySelector('input[name="vesselType"]:checked')?.value || '',
            placeBuilt: document.getElementById('placeBuilt')?.value || '',
            yearBuilt: document.getElementById('yearBuilt')?.value || '',
            materials: Array.from(document.querySelectorAll('input[name="material"]:checked')).map(cb => cb.value)
        },
        dimensions: {
            regLength: document.getElementById('regLength')?.value || '',
            regBreadth: document.getElementById('regBreadth')?.value || '',
            regDepth: document.getElementById('regDepth')?.value || '',
            tonnageLength: document.getElementById('tonnageLength')?.value || '',
            tonnageBreadth: document.getElementById('tonnageBreadth')?.value || '',
            tonnageDepth: document.getElementById('tonnageDepth')?.value || '',
            grossTonnage: document.getElementById('grossTonnage')?.value || '',
            netTonnage: document.getElementById('netTonnage')?.value || ''
        },
        propulsion: {
            engineMake: document.getElementById('engineMake')?.value || '',
            serialNumber: document.getElementById('serialNumber')?.value || '',
            horsepower: document.getElementById('horsepower')?.value || ''
        },
        fishingGear: Array.from(document.querySelectorAll('input[name="gear"]:checked')).map(cb => cb.value),
        gearsOther: document.getElementById('gearsOther')?.value || '',
        certification: {
            ownerPrintedName: document.getElementById('ownerPrintedName')?.value || '',
            signatureDataUrl: signaturePads['owner']?.canvas?.toDataURL() || ''
        }
    };
}

/* ══════════════════════════  FORM SUBMIT  ══════════════════════════════════ */
function bindFormSubmit() {
    const form = document.getElementById('boatForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm()) return;

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Submitting...';

        const formData = collectFormData();
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

        const isEdit = !!_editingSubmissionId;
        const url    = isEdit ? `/encoder/api/submissions/${_editingSubmissionId}` : '/forms/submit/boat';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(formData),
            });
            const json = await res.json();
            if (json.success) {
                if (isEdit && window.parent !== window) {
                    window.parent.postMessage({ type: 'SUBMISSION_UPDATED', id: _editingSubmissionId }, '*');
                } else {
                    const msg = document.getElementById('successMessage');
                    if (msg) {
                        msg.style.display = 'block';
                        msg.textContent = '✓ Boat registration submitted successfully!';
                        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => { msg.style.display = 'none'; }, 6000);
                    }
                }
            } else {
                showToast(json.message || 'Submission failed.', 'error');
            }
        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '✓ Submit Boat Registration';
        }
    });
}

/* ══════════════════════════  PDF DOWNLOAD  ═════════════════════════════════ */
async function downloadPDF() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    const raw = collectFormData();

    const payload = {
        province: raw.province,
        municipality: raw.municipality,
        mfvrNo: raw.mfvrNo,
        dateApplication: raw.dateApplication,
        regType: raw.registrationType,
        ownerName: raw.owner?.name,
        ownerAddress: raw.owner?.address,
        homeport: raw.vessel?.homeport,
        vesselName: raw.vessel?.name,
        vesselType: raw.vessel?.type,
        placeBuilt: raw.vessel?.placeBuilt,
        yearBuilt: raw.vessel?.yearBuilt,
        material: raw.vessel?.materials || [],
        regLength: raw.dimensions?.regLength,
        regBreadth: raw.dimensions?.regBreadth,
        regDepth: raw.dimensions?.regDepth,
        tonnageLength: raw.dimensions?.tonnageLength,
        tonnageBreadth: raw.dimensions?.tonnageBreadth,
        tonnageDepth: raw.dimensions?.tonnageDepth,
        grossTonnage: raw.dimensions?.grossTonnage,
        netTonnage: raw.dimensions?.netTonnage,
        engineMake: raw.propulsion?.engineMake,
        serialNumber: raw.propulsion?.serialNumber,
        horsepower: raw.propulsion?.horsepower,
        gear: raw.fishingGear || [],
        gearsOther: raw.gearsOther,
        ownerPrintedName: raw.certification?.ownerPrintedName,
    };

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    try {
        const response = await fetch('/forms/download/boat-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server error ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Boat_Registration_Form.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        showToast('PDF download failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '⬇ Download Pre-filled PDF'; }
    }
}

/* ══════════════════════════  TOAST HELPER  ═════════════════════════════════ */
function showToast(msg, type = 'warn') {
    const existing = document.getElementById('formToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'formToast';
    const colors = { warn: '#f59e0b', error: '#dc2626', success: '#16a34a' };
    toast.style.cssText = `
        position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
        background: ${colors[type] || '#374151'}; color: white;
        padding: 0.75rem 1.25rem; border-radius: 8px;
        font-size: 0.88rem; font-weight: 600; font-family: inherit;
        box-shadow: 0 4px 16px rgba(0,0,0,0.20);
        animation: toastIn 0.3s ease;
        max-width: 320px; line-height: 1.4;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

/* Field error style */
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .field-error {
            border-color: #dc2626 !important;
            box-shadow: 0 0 0 3px rgba(220,38,38,0.12) !important;
        }
        @keyframes toastIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
});

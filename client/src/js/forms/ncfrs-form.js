/**
 * NCFRS Enrollment Form — JavaScript
 * Supports: dynamic farm parcels, signature pad, thumbmark upload,
 * PDF download, DB submit, toast notifications.
 * Design matched to RSBSA premium form pattern.
 */

/* ═══════════════════════════════  STATE  ══════════════════════════════ */
let parcelCount = 0;
let signaturePad;
let _editingSubmissionId = null; // Set by POPULATE_FORM message when in edit mode

/* ══════════════════════════════════  INIT  ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initSignaturePad();
    initThumbmarkUpload();
    setupEventListeners();
    addFarmParcel(); // start with one parcel
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
 * Populate all NCFRS form fields from stored nested JSON.
 */
function populateForm(d) {
    const pi   = d.personalInfo  || {};
    const addr = pi.address      || {};
    const cert = d.certification || {};

    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    const setRadio = (name, v) => { const r = document.querySelector(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; };
    const setCheck = (name, vals) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
            cb.checked = Array.isArray(vals) ? vals.includes(cb.value) : cb.value === vals;
        });
    };

    setCheck('enrollmentType', d.enrollmentType);

    // Personal info
    set('lastName',    pi.lastName);
    set('firstName',   pi.firstName);
    set('middleName',  pi.middleName);
    set('suffix',      pi.suffix);
    setRadio('sex',    pi.sex);
    set('mobileNumber',   pi.mobileNumber);
    set('landlineNumber', pi.landlineNumber);
    set('dateOfBirth',   pi.dateOfBirth);
    set('placeOfBirth',  pi.placeOfBirth);
    setRadio('civilStatus', pi.civilStatus);
    setRadio('education',   pi.education);
    setRadio('govId',       pi.govId);
    set('idType',   pi.idType);
    set('idNumber', pi.idNumber);

    // Address
    set('houseNo',     addr.houseNo);
    set('street',      addr.street);
    set('barangay',    addr.barangay);
    set('municipality', addr.municipality);
    set('province',    addr.province);
    set('region',      addr.region);

    // Certification
    set('certDate',    cert.date);
    set('printedName', cert.printedName);

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
    const certDate = document.getElementById('certDate');
    if (certDate) certDate.value = today;
}

/* ═══════════════════════════  EVENT LISTENERS  ════════════════════════════ */
function setupEventListeners() {
    // Government ID toggle
    document.querySelectorAll('input[name="govId"]').forEach(r => {
        r.addEventListener('change', () => {
            const show = r.value === 'Yes';
            const fields = document.getElementById('govIdFields');
            if (fields) fields.style.display = show ? 'flex' : 'none';
        });
    });

    // Enrollment type checkboxes (only one can be selected)
    const checkboxes = document.querySelectorAll('input[name="enrollmentType"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                checkboxes.forEach(cb => { if (cb !== this) cb.checked = false; });
            }
        });
    });

    // Residency Status Toggle
    document.querySelectorAll('input[name="isMabitacResident"]').forEach(r => {
        r.addEventListener('change', () => {
            const isResident = r.value === 'Yes';
            const muni = document.getElementById('municipality');
            const prov = document.getElementById('province');
            const reg = document.getElementById('region');

            if (isResident) {
                if (muni) {
                    muni.value = 'Mabitac'; muni.readOnly = true; muni.classList.add('fg-locked');
                    muni.setAttribute('data-dropdown-disabled', 'false');
                }
                if (prov) {
                    prov.value = 'Laguna'; prov.readOnly = true; prov.classList.add('fg-locked');
                    prov.setAttribute('data-dropdown-disabled', 'false');
                }
                if (reg) {
                    reg.value = 'Region IV-A'; reg.readOnly = true; reg.classList.add('fg-locked');
                    reg.setAttribute('data-dropdown-disabled', 'false');
                }
                const brgy = document.getElementById('barangay');
                if (brgy) brgy.setAttribute('data-dropdown-disabled', 'false');
            } else {
                if (muni) {
                    muni.value = ''; muni.readOnly = false; muni.classList.remove('fg-locked');
                    muni.setAttribute('data-dropdown-disabled', 'true');
                }
                if (prov) {
                    prov.value = ''; prov.readOnly = false; prov.classList.remove('fg-locked');
                    prov.setAttribute('data-dropdown-disabled', 'true');
                }
                if (reg) {
                    reg.value = ''; reg.readOnly = false; reg.classList.remove('fg-locked');
                    reg.setAttribute('data-dropdown-disabled', 'true');
                }
                const brgy = document.getElementById('barangay');
                if (brgy) {
                    brgy.setAttribute('data-dropdown-disabled', 'true');
                    const container = brgy.closest('.premium-dropdown-container');
                    if (container) {
                        const list = container.querySelector('.premium-dropdown-list');
                        if (list) list.style.display = 'none';
                        brgy.classList.remove('premium-select-active');
                    }
                }
            }
        });
    });

    // Auto-fill printed name
    const printedName = document.getElementById('printedName');
    if (printedName) {
        printedName.addEventListener('focus', function () {
            if (!this.value) {
                const firstName = document.getElementById('firstName')?.value || '';
                const middleName = document.getElementById('middleName')?.value || '';
                const lastName = document.getElementById('lastName')?.value || '';
                const suffix = document.getElementById('suffix')?.value || '';
                const fullName = [firstName, middleName, lastName, suffix]
                    .filter(n => n.trim()).join(' ');
                this.value = fullName.toUpperCase();
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
function initSignaturePad() {
    const canvas = document.getElementById('applicantSignature');
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

    signaturePad = { canvas, ctx };
}

function clearSignature() {
    if (signaturePad) {
        const { canvas, ctx } = signaturePad;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/* ════════════════════════════  FARM PARCELS  ══════════════════════════════ */
function addFarmParcel() {
    parcelCount++;
    const container = document.getElementById('farmParcelsContainer');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'farm-parcel-block';
    block.id = `parcel-${parcelCount}`;

    block.innerHTML = `
    <div class="parcel-block-header">
        <span class="parcel-block-title">Farm Parcel #${parcelCount}</span>
        ${parcelCount > 1
            ? `<button type="button" class="btn-remove-parcel" onclick="removeFarmParcel(${parcelCount})">✕ Remove</button>`
            : '<span></span>'}
    </div>
    <div class="parcel-block-body">
        <div class="fg-row">
            <div class="fg fg-full">
                <label class="fg-label">LAND HOLDING STATUS</label>
                <div class="radio-row flex-wrap">
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Owner"> Owner</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Owner-Tiller"> Owner-Tiller</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Grower"> Grower</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Tenant"> Tenant</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Tenant-Worker"> Tenant-Worker</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Worker-Laborer"> Worker-Laborer</label>
                    <label class="check-opt"><input type="checkbox" name="status_${parcelCount}" value="Others"> Others</label>
                </div>
            </div>
        </div>

        <div class="fg-row">
            <div class="fg fg-full">
                <label class="fg-label">FARM LOCATION <span class="fg-note">(Province, Municipality, Barangay)</span></label>
                <input type="text" name="farmLocation_${parcelCount}" class="fg-input">
            </div>
        </div>

        <div class="fg-row">
            <div class="fg fg-third">
                <label class="fg-label">LAND OWNERSHIP <span class="fg-note">(Absolute/Coconut/Intercrop/Other/Idle)</span></label>
                <input type="text" name="landOwnership_${parcelCount}" class="fg-input">
            </div>
            <div class="fg fg-third">
                <label class="fg-label">ORGANIC CERTIFIED?</label>
                <div class="radio-row">
                    <label class="check-opt"><input type="radio" name="organic_${parcelCount}" value="Y"> Yes</label>
                    <label class="check-opt"><input type="radio" name="organic_${parcelCount}" value="N"> No</label>
                </div>
            </div>
            <div class="fg fg-third">
                <label class="fg-label">GAP CERTIFIED?</label>
                <div class="radio-row">
                    <label class="check-opt"><input type="radio" name="gap_${parcelCount}" value="Y"> Yes</label>
                    <label class="check-opt"><input type="radio" name="gap_${parcelCount}" value="N"> No</label>
                </div>
            </div>
        </div>

        <div class="fg-row">
            <div class="fg fg-full">
                <label class="fg-label">COCONUT TREES <span class="fg-note">(Variety, Year Planted, Planting Pattern, Distance, No. of Trees)</span></label>
                <textarea name="coconutTrees_${parcelCount}" class="fg-input" rows="3"></textarea>
            </div>
        </div>

        <div class="fg-row">
            <div class="fg fg-full">
                <label class="fg-label">FARM INCOME / EXPENSES</label>
                <textarea name="farmIncome_${parcelCount}" class="fg-input" rows="2"></textarea>
            </div>
        </div>
    </div>`;

    container.appendChild(block);
}

function removeFarmParcel(parcelId) {
    const el = document.getElementById(`parcel-${parcelId}`);
    if (el) el.remove();
}

/* ═══════════════════════════════  VALIDATION  ═════════════════════════════ */
function validateForm() {
    const requiredFields = ['lastName', 'firstName', 'barangay', 'municipality', 'province'];
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
    const val = id => document.getElementById(id)?.value?.trim() || '';
    const rval = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';

    return {
        enrollmentType: Array.from(document.querySelectorAll('input[name="enrollmentType"]:checked')).map(cb => cb.value),
        personalInfo: {
            lastName: val('lastName'),
            firstName: val('firstName'),
            middleName: val('middleName'),
            suffix: val('suffix'),
            isMabitacResident: rval('isMabitacResident') === 'Yes',
            address: {
                houseNo: val('houseNo'),
                street: val('street'),
                barangay: val('barangay'),
                municipality: val('municipality'),
                province: val('province'),
                region: val('region')
            },
            sex: rval('sex'),
            mobileNumber: val('mobileNumber'),
            landlineNumber: val('landlineNumber'),
            dateOfBirth: val('dateOfBirth'),
            placeOfBirth: val('placeOfBirth'),
            civilStatus: rval('civilStatus'),
            education: rval('education'),
            govId: rval('govId'),
            idType: val('idType'),
            idNumber: val('idNumber')
        },
        certification: {
            date: val('certDate'),
            printedName: val('printedName'),
            signatureDataUrl: signaturePad?.canvas?.toDataURL() || ''
        }
    };
}

/* ══════════════════════════  FORM SUBMIT  ══════════════════════════════════ */
function bindFormSubmit() {
    const form = document.getElementById('ncfrsForm');
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
        const url    = isEdit ? `/encoder/api/submissions/${_editingSubmissionId}` : '/forms/submit/ncfrs';
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
                        msg.textContent = `✓ NCFRS Enrollment submitted successfully! ID: ${json.registration_id || ''}`;
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
            submitBtn.innerHTML = '✓ Submit Enrollment Form';
        }
    });
}

/* ══════════════════════════  PDF DOWNLOAD  ═════════════════════════════════ */
async function downloadPDF() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    const raw = collectFormData();
    const payload = {
        enrollmentType: raw.enrollmentType,
        lastName: raw.personalInfo?.lastName,
        firstName: raw.personalInfo?.firstName,
        middleName: raw.personalInfo?.middleName,
        suffix: raw.personalInfo?.suffix,
        houseNo: raw.personalInfo?.address?.houseNo,
        street: raw.personalInfo?.address?.street,
        barangay: raw.personalInfo?.address?.barangay,
        municipality: raw.personalInfo?.address?.municipality,
        province: raw.personalInfo?.address?.province,
        region: raw.personalInfo?.address?.region,
        sex: raw.personalInfo?.sex,
        mobileNumber: raw.personalInfo?.mobileNumber,
        landlineNumber: raw.personalInfo?.landlineNumber,
        dateOfBirth: raw.personalInfo?.dateOfBirth,
        placeOfBirth: raw.personalInfo?.placeOfBirth,
        civilStatus: raw.personalInfo?.civilStatus,
        education: raw.personalInfo?.education,
        govId: raw.personalInfo?.govId,
        idType: raw.personalInfo?.idType,
        idNumber: raw.personalInfo?.idNumber,
        certDate: raw.certification?.date,
        printedName: raw.certification?.printedName,
    };

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    try {
        const response = await fetch('/forms/download/ncfrs', {
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
        link.download = 'NCFRS_Enrollment_Form.pdf';
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

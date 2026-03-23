/**
 * Fish Registration Form — JavaScript
 * Supports: signature pad, photo/thumbmark upload, org table,
 * PDF download, DB submit, toast notifications.
 * Design matched to RSBSA premium form pattern.
 */

/* ═══════════════════════════════  STATE  ══════════════════════════════ */
const signaturePads = {};

/* ══════════════════════════════════  INIT  ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initSignaturePad('applicantSignature', 'applicant');
    initPhotoUpload();
    initThumbmarkUpload();
    setupEventListeners();
    bindFormSubmit();
});

/* ══════════════════════════════  FORM INIT  ═══════════════════════════════ */
function initializeForm() {
    const today = new Date().toISOString().split('T')[0];
    const regDate = document.getElementById('registrationDate');
    const dateAcc = document.getElementById('dateAccomplished');
    if (regDate) regDate.value = today;
    if (dateAcc) dateAcc.value = today;
    generateRegistrationNumber();
}

function generateRegistrationNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const regNo = `FR-${timestamp.toString().slice(-8)}-${random.toString().padStart(3, '0')}`;
    const el = document.getElementById('registrationNo');
    if (el) el.value = regNo;
}

/* ═══════════════════════════  EVENT LISTENERS  ════════════════════════════ */
function setupEventListeners() {
    // Date of birth → calculate age
    const dob = document.getElementById('dateOfBirth');
    if (dob) dob.addEventListener('change', calculateAge);

    // Nationality other field toggle
    document.querySelectorAll('input[name="nationality"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const otherField = document.getElementById('nationalityOther');
            if (otherField) otherField.style.display = this.value === 'Others' ? 'inline-block' : 'none';
        });
    });

    // Education other field toggle
    document.querySelectorAll('input[name="education"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const otherField = document.getElementById('educationOther');
            if (otherField) otherField.style.display = this.value === 'Others' ? 'inline-block' : 'none';
        });
    });

    // Registration type checkboxes (only one can be selected)
    const newReg = document.getElementById('newRegistration');
    const renewal = document.getElementById('renewal');
    if (newReg && renewal) {
        newReg.addEventListener('change', function () { if (this.checked) renewal.checked = false; });
        renewal.addEventListener('change', function () { if (this.checked) newReg.checked = false; });
    }

    // Residency Status Toggle
    document.querySelectorAll('input[name="isMabitacResident"]').forEach(r => {
        r.addEventListener('change', () => {
            const isResident = r.value === 'Yes';
            const muni = document.getElementById('city');
            const prov = document.getElementById('province');

            if (isResident) {
                if (muni) { 
                    muni.value = 'Mabitac'; muni.readOnly = true; muni.classList.add('fg-locked'); 
                    muni.setAttribute('data-dropdown-disabled', 'false');
                }
                if (prov) { 
                    prov.value = 'Laguna'; prov.readOnly = true; prov.classList.add('fg-locked'); 
                    prov.setAttribute('data-dropdown-disabled', 'false');
                }
                const brgy = document.getElementById('street'); // In fish form, street/barangay are in one field
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
                const brgy = document.getElementById('street');
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
    if (printedName) printedName.addEventListener('focus', autoFillPrintedName);
}

function calculateAge() {
    const dob = new Date(this.value);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    const ageField = document.getElementById('age');
    if (ageField) ageField.value = age;
}

function autoFillPrintedName() {
    if (!this.value) {
        const salutation = document.querySelector('input[name="salutation"]:checked')?.value || '';
        const firstName = document.getElementById('firstName')?.value || '';
        const middleName = document.getElementById('middleName')?.value || '';
        const lastName = document.getElementById('lastName')?.value || '';
        const appellation = document.getElementById('appellation')?.value || '';
        const fullName = [salutation, firstName, middleName, lastName, appellation]
            .filter(n => n.trim()).join(' ');
        this.value = fullName.toUpperCase();
    }
}

/* ═══════════════════════════  PHOTO UPLOAD  ═══════════════════════════════ */
function initPhotoUpload() {
    const input = document.getElementById('photoUpload');
    const preview = document.getElementById('photoPreview');
    const holder = document.getElementById('photoPlaceholder');
    if (!input) return;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            preview.src = ev.target.result;
            preview.style.display = 'block';
            if (holder) holder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
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

/* ═══════════════════════════  ORGANIZATION TABLE  ═════════════════════════ */
function addOrganizationRow() {
    const tbody = document.getElementById('organizationTableBody');
    if (!tbody) return;
    const rowCount = tbody.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" name="orgName_${rowCount}"></td>
        <td><input type="text" name="memberSince_${rowCount}" placeholder="Year"></td>
        <td><input type="text" name="position_${rowCount}"></td>
    `;
    tbody.appendChild(row);
}

/* ═══════════════════════════════  VALIDATION  ═════════════════════════════ */
function validateForm() {
    const requiredFields = [
        'lastName', 'firstName', 'street', 'city', 'province',
        'contactNo', 'dateOfBirth', 'placeOfBirth',
        'emergencyPerson', 'relationship', 'emergencyContact'
    ];
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

    const gender = document.querySelector('input[name="gender"]:checked');
    if (!gender) { showToast('Please select Gender.', 'warn'); valid = false; }

    const civilStatus = document.querySelector('input[name="civilStatus"]:checked');
    if (!civilStatus) { showToast('Please select Civil Status.', 'warn'); valid = false; }

    if (!valid) showToast('Please fill in all required fields.', 'warn');
    return valid;
}

/* ══════════════════════════  COLLECT FORM DATA  ════════════════════════════ */
function collectFormData() {
    let registrationType = 'new';
    if (document.getElementById('renewal')?.checked) registrationType = 'renewal';

    return {
        registrationNo: document.getElementById('registrationNo')?.value || '',
        registrationDate: document.getElementById('registrationDate')?.value || '',
        registrationType,
        personalInfo: {
            salutation: document.querySelector('input[name="salutation"]:checked')?.value || '',
            lastName: document.getElementById('lastName')?.value || '',
            firstName: document.getElementById('firstName')?.value || '',
            middleName: document.getElementById('middleName')?.value || '',
            appellation: document.getElementById('appellation')?.value || '',
            isMabitacResident: document.querySelector('input[name="isMabitacResident"]:checked')?.value === 'Yes',
            address: {
                street: document.getElementById('street')?.value || '',
                city: document.getElementById('city')?.value || '',
                province: document.getElementById('province')?.value || ''
            },
            contactNo: document.getElementById('contactNo')?.value || '',
            residentSince: document.getElementById('residentSince')?.value || '',
            age: document.getElementById('age')?.value || '',
            dateOfBirth: document.getElementById('dateOfBirth')?.value || '',
            placeOfBirth: document.getElementById('placeOfBirth')?.value || '',
            gender: document.querySelector('input[name="gender"]:checked')?.value || '',
            civilStatus: document.querySelector('input[name="civilStatus"]:checked')?.value || '',
            numChildren: document.getElementById('numChildren')?.value || '',
            nationality: document.querySelector('input[name="nationality"]:checked')?.value || '',
            education: document.querySelector('input[name="education"]:checked')?.value || ''
        },
        emergencyContact: {
            person: document.getElementById('emergencyPerson')?.value || '',
            relationship: document.getElementById('relationship')?.value || '',
            contact: document.getElementById('emergencyContact')?.value || '',
            address: document.getElementById('emergencyAddress')?.value || ''
        },
        livelihood: {
            mainIncome: Array.from(document.querySelectorAll('input[name="mainIncome"]:checked')).map(cb => cb.value),
            otherIncome: Array.from(document.querySelectorAll('input[name="otherIncome"]:checked')).map(cb => cb.value)
        },
        organizations: collectOrganizations(),
        certification: {
            printedName: document.getElementById('printedName')?.value || '',
            dateAccomplished: document.getElementById('dateAccomplished')?.value || '',
            signatureDataUrl: signaturePads['applicant']?.canvas?.toDataURL() || ''
        }
    };
}

function collectOrganizations() {
    const organizations = [];
    const tbody = document.getElementById('organizationTableBody');
    if (!tbody) return organizations;
    tbody.querySelectorAll('tr').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const orgName = inputs[0]?.value || '';
        const memberSince = inputs[1]?.value || '';
        const position = inputs[2]?.value || '';
        if (orgName || memberSince || position) {
            organizations.push({ name: orgName, memberSince, position });
        }
    });
    return organizations;
}

/* ══════════════════════════  FORM SUBMIT  ══════════════════════════════════ */
function bindFormSubmit() {
    const form = document.getElementById('fisherfolkForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm()) return;

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Submitting...';

        const formData = collectFormData();
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

        try {
            const res = await fetch('/forms/submit/fish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(formData),
            });
            const json = await res.json();
            if (json.success) {
                const msg = document.getElementById('successMessage');
                msg.style.display = 'block';
                msg.textContent = `✓ Registration submitted successfully! ID: ${json.registration_id || formData.registrationNo}`;
                msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => { msg.style.display = 'none'; }, 6000);
            } else {
                showToast(json.message || 'Submission failed.', 'error');
            }
        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '✓ Submit Registration Form';
        }
    });
}

/* ══════════════════════════  PDF DOWNLOAD  ═════════════════════════════════ */
async function downloadPDF() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    const raw = collectFormData();
    const payload = {
        registrationNo: raw.registrationNo,
        registrationDate: raw.registrationDate,
        registrationType: raw.registrationType,
        salutation: raw.personalInfo?.salutation,
        lastName: raw.personalInfo?.lastName,
        firstName: raw.personalInfo?.firstName,
        middleName: raw.personalInfo?.middleName,
        appellation: raw.personalInfo?.appellation,
        street: raw.personalInfo?.address?.street,
        city: raw.personalInfo?.address?.city,
        province: raw.personalInfo?.address?.province,
        contactNo: raw.personalInfo?.contactNo,
        residentSince: raw.personalInfo?.residentSince,
        age: raw.personalInfo?.age,
        dateOfBirth: raw.personalInfo?.dateOfBirth,
        placeOfBirth: raw.personalInfo?.placeOfBirth,
        gender: raw.personalInfo?.gender,
        civilStatus: raw.personalInfo?.civilStatus,
        numChildren: raw.personalInfo?.numChildren,
        nationality: raw.personalInfo?.nationality,
        education: raw.personalInfo?.education,
        emergencyPerson: raw.emergencyContact?.person,
        relationship: raw.emergencyContact?.relationship,
        emergencyContact: raw.emergencyContact?.contact,
        emergencyAddress: raw.emergencyContact?.address,
        mainIncome: raw.livelihood?.mainIncome || [],
        otherIncome: raw.livelihood?.otherIncome || [],
        printedName: raw.certification?.printedName,
        dateAccomplished: raw.certification?.dateAccomplished,
    };

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    try {
        const response = await fetch('/forms/download/fish-registration', {
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
        link.download = 'Fisherfolk_Registration_Form.pdf';
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

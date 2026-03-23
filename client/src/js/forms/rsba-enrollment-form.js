/**
 * RSBSA Enrollment Form — JavaScript
 * Supports: 3-step wizard, dynamic farm parcels, signature pad,
 * photo/thumbmark upload, client's copy population, PDF download, DB submit.
 */

/* ═══════════════════════════════════  STATE  ══════════════════════════════ */
let currentStep = 1;
let parcelCount = 0;
let sigCanvas, sigCtx, isDrawing = false;
let photoBase64 = null;
let thumbmarkBase64 = null;
let landDocBase64 = null;
let gpxBase64 = null;
let isEditing = false;
let editRegistrationId = null;

/* ══════════════════════════════════  INIT  ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    initSignaturePad();
    initPhotoUpload();
    initLandDocUpload();
    initThumbmarkUpload();
    initGpxUpload();
    initConditionals();
    initDateBoxAutoAdvance();
    addFarmParcel();          // start with one parcel
    bindFormSubmit();
    initMessageListener();    // Listen for population data from parent

    // Tell parent window that the form is ready to receive data
    window.parent.postMessage({ type: 'FORM_READY', formType: 'rsbsa' }, '*');
});

function initMessageListener() {
    window.addEventListener('message', event => {
        const { type, data, submissionId, isViewOnly } = event.data;
        if (type === 'POPULATE_FORM') {
            console.log('Populating form with data:', data);
            isEditing = !isViewOnly;
            editRegistrationId = submissionId;
            populateForm(data);

            if (isViewOnly) {
                // Disable all inputs and hide submit button for view-only mode
                const form = document.getElementById('rsbaForm') || document.body;
                const inputs = form.querySelectorAll('input, select, textarea, button:not(.btn-primary, .btn-secondary)');
                inputs.forEach(el => {
                    el.disabled = true;
                    el.style.pointerEvents = 'none';
                });
                // Keep next/prev buttons working
                form.querySelectorAll('.btn-primary[onclick*="nextStep"], .btn-secondary[onclick*="prevStep"]').forEach(btn => {
                    btn.disabled = false;
                    btn.style.pointerEvents = 'auto';
                });
                // Hide submit button
                const submitBtn = document.getElementById('submitBtn');
                if (submitBtn) submitBtn.style.display = 'none';

                // Disable canvas drawing
                const canvasOverlay = document.createElement('div');
                canvasOverlay.style.position = 'absolute';
                canvasOverlay.style.top = '0';
                canvasOverlay.style.left = '0';
                canvasOverlay.style.width = '100%';
                canvasOverlay.style.height = '100%';
                canvasOverlay.style.zIndex = '10';
                canvasOverlay.style.cursor = 'not-allowed';

                if (sigCanvas) sigCanvas.parentElement.appendChild(canvasOverlay.cloneNode());
                const thumbBox = document.querySelector('.thumbmark-box');
                if (thumbBox) {
                    thumbBox.style.position = 'relative';
                    thumbBox.appendChild(canvasOverlay.cloneNode());
                }
            }
        }
    });
}

function populateForm(data) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val || '';
            // Trigger change/input events for conditionals
            el.dispatchEvent(new Event('input'));
            el.dispatchEvent(new Event('change'));
        }
    };
    const setRadio = (name, val) => {
        const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (el) {
            el.checked = true;
            el.dispatchEvent(new Event('change'));
        }
    };
    const setChecks = (name, vals) => {
        if (!vals) return;
        vals.forEach(v => {
            const el = document.querySelector(`input[name="${name}"][value="${v}"]`);
            if (el) {
                el.checked = true;
                el.dispatchEvent(new Event('change'));
            }
        });
    };

    const pi = data.personalInfo || {};
    const addr = pi.address || {};

    // Step 1: Personal Info
    set('surname', pi.surname);
    set('firstName', pi.firstName);
    set('middleName', pi.middleName);
    set('extensionName', pi.extensionName);
    setRadio('isMabitacResident', pi.isMabitacResident ? 'Yes' : 'No');
    setRadio('sex', pi.sex);
    set('houseNo', addr.houseNo);
    set('street', addr.street);
    set('barangay', addr.barangay);
    set('municipality', addr.municipality);
    set('province', addr.province);
    set('region', addr.region);
    set('mobileNumber', pi.mobileNumber);
    set('landlineNumber', pi.landlineNumber);
    set('dateOfBirth', pi.dateOfBirth);
    set('placeOfBirth', pi.placeOfBirth);
    setRadio('religion', pi.religion);
    set('religionOther', pi.religionOther);
    setRadio('civilStatus', pi.civilStatus);
    set('spouseName', pi.spouseName);
    set('motherName', pi.motherName);
    setRadio('householdHead', pi.householdHead);
    set('householdHeadName', pi.householdHeadName);
    set('relationship', pi.relationship);
    set('householdMembers', pi.householdMembers);
    set('numMale', pi.numMale);
    set('numFemale', pi.numFemale);
    setChecks('education', pi.education);
    setRadio('pwd', pi.pwd);
    setRadio('fourPs', pi.fourPs);
    setRadio('indigenous', pi.indigenous);
    set('indigenousSpecify', pi.indigenousSpecify);
    setRadio('govId', pi.govId);
    set('idType', pi.idType);
    set('idNumber', pi.idNumber);
    setRadio('association', pi.association);
    set('associationName', pi.associationName);
    set('emergencyPerson', pi.emergencyPerson);
    set('emergencyContact', pi.emergencyContact);

    // Step 2: Farm Profile
    const fp = data.farmProfile || {};
    setChecks('livelihood', fp.livelihood);
    setChecks('farmingActivity', fp.farmingActivity);
    set('otherCrops', fp.otherCrops);
    set('livestockType', fp.livestockType);
    set('poultryType', fp.poultryType);
    setChecks('farmWork', fp.farmWork);
    set('farmWorkOther', fp.farmWorkOther);
    setChecks('fishingActivity', fp.fishingActivity);
    set('fishingActivityOther', fp.fishingActivityOther);
    setChecks('youthInvolvement', fp.youthInvolvement);
    set('youthInvolvementOther', fp.youthInvolvementOther);
    set('farmingIncome', fp.farmingIncome);
    set('nonFarmingIncome', fp.nonFarmingIncome);

    // Metadata & Admin Date
    const meta = data.meta || {};
    setRadio('enrollmentType', meta.enrollmentType);
    set('refRegion', meta.refRegion);
    set('refProvince', meta.refProvince);
    set('refCityMuni', meta.refCityMuni);
    set('refBarangay', meta.refBarangay);
    set('rotP1', meta.rotP1);
    set('rotP2', meta.rotP2);
    set('rotP3', meta.rotP3);

    if (meta.date) {
        const parts = meta.date.split('/');
        if (parts.length === 3) {
            set('dateMM1', parts[0][0]); set('dateMM2', parts[0][1]);
            set('dateDD1', parts[1][0]); set('dateDD2', parts[1][1]);
            set('dateYY1', parts[2][0]); set('dateYY2', parts[2][1]);
            set('dateYY3', parts[2][2]); set('dateYY4', parts[2][3]);
        }
    }

    // Step 3: Attached Documents
    const docs = data.attachedDocs || {};
    setChecks('attachedDoc', docs.documents);
    set('attachedDocOther', docs.other);

    // Parcels
    if (data.parcels && data.parcels.length > 0) {
        document.getElementById('farmParcelsContainer').innerHTML = '';
        parcelCount = 0;
        data.parcels.forEach((p, pIdx) => {
            addFarmParcel();
            const pid = pIdx + 1;
            const nset = (name, val) => {
                const el = document.querySelector(`[name="${name}"]`);
                if (el) el.value = val || '';
            };
            const nrset = (name, val) => {
                const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
                if (el) el.checked = true;
            };

            nset(`parcel_${pid}_barangay`, p.barangay);
            nset(`parcel_${pid}_city`, p.municipality);
            nset(`parcel_${pid}_area`, p.area);
            nrset(`parcel_${pid}_ancestral`, p.ancestral);
            nset(`parcel_${pid}_owndoc`, p.ownershipDoc);
            nrset(`parcel_${pid}_arb`, p.arb);
            nrset(`parcel_${pid}_owntype`, p.ownershipType);
            nset(`parcel_${pid}_owntype_other`, p.ownershipTypeOther);
            nset(`parcel_${pid}_landlord_tenant`, p.landlordTenant);
            nset(`parcel_${pid}_landlord_lessee`, p.landlordLessee);

            if (p.crops) {
                const tbody = document.getElementById(`parcelTableBody_${pid}`);
                tbody.innerHTML = ''; // clear initial rows
                p.crops.forEach((c, cIdx) => {
                    addParcelRow(pid);
                    nset(`parcel_${pid}_crop_${cIdx}`, c.commodity);
                    nset(`parcel_${pid}_size_${cIdx}`, c.size);
                    nset(`parcel_${pid}_head_${cIdx}`, c.head);
                    nset(`parcel_${pid}_farmtype_${cIdx}`, c.farmType);
                    nset(`parcel_${pid}_organic_${cIdx}`, c.organic);
                    nset(`parcel_${pid}_remarks_${cIdx}`, c.remarks);
                });
            }
        });
    }

    // Update Submit Button Text
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes & Re-submit';
}

/* ═══════════════════════════════  STEP WIZARD  ════════════════════════════ */
function goToStep(target) {
    if (target > currentStep && !validateStep(currentStep)) return;

    // Hide current step
    document.getElementById(`step-${currentStep}`).style.display = 'none';
    // Show target step
    document.getElementById(`step-${target}`).style.display = 'block';
    currentStep = target;

    // Update progress bar
    document.querySelectorAll('.wizard-step').forEach((el, idx) => {
        const n = idx + 1;
        el.classList.remove('active', 'done');
        if (n < currentStep) el.classList.add('done');
        if (n === currentStep) el.classList.add('active');
    });

    // Update step connectors
    document.querySelectorAll('.step-connector').forEach((el, idx) => {
        el.classList.toggle('done', idx + 1 < currentStep);
    });

    // Populate client's copy when reaching step 3
    if (currentStep === 3) populateClientsCopy();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════  VALIDATION  ═════════════════════════════ */
function validateStep(step) {
    const stepEl = document.getElementById(`step-${step}`);
    const required = stepEl.querySelectorAll('[required]');
    let valid = true;

    required.forEach(el => {
        el.classList.remove('field-error');
        if (!el.value.trim()) {
            el.classList.add('field-error');
            valid = false;
        }
    });

    // Radio group validation for step 1
    if (step === 1) {
        const sexPicked = document.querySelector('input[name="sex"]:checked');
        if (!sexPicked) {
            showToast('Please select SEX (Male/Female).', 'warn');
            valid = false;
        }
        const civilPicked = document.querySelector('input[name="civilStatus"]:checked');
        if (!civilPicked) {
            showToast('Please select Civil Status.', 'warn');
            valid = false;
        }
    }

    if (!valid) showToast('Please fill in all required fields.', 'warn');
    return valid;
}

/* ═══════════════════════════════  DATE BOX  ═══════════════════════════════ */
function initDateBoxAutoAdvance() {
    const dateBoxIds = ['dateMM1', 'dateMM2', 'dateDD1', 'dateDD2', 'dateYY1', 'dateYY2', 'dateYY3', 'dateYY4'];
    dateBoxIds.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            el.value = el.value.replace(/\D/g, '');
            if (el.value.length >= el.maxLength && i < dateBoxIds.length - 1) {
                document.getElementById(dateBoxIds[i + 1])?.focus();
            }
        });
    });
}

/* ═══════════════════════════════  CONDITIONALS  ═══════════════════════════ */
function initConditionals() {
    /* household head */
    document.querySelectorAll('input[name="householdHead"]').forEach(r => {
        r.addEventListener('change', () => {
            const no = r.value === 'No';
            document.getElementById('householdHeadInfo').style.display = no ? 'flex' : 'none';
            document.getElementById('relationshipRow').style.display = no ? 'flex' : 'none';
        });
    });

    /* indigenous group */
    document.querySelectorAll('input[name="indigenous"]').forEach(r => {
        r.addEventListener('change', () => {
            document.getElementById('ipSpecifyRow').style.display = r.value === 'Yes' ? 'flex' : 'none';
        });
    });

    /* government ID */
    document.querySelectorAll('input[name="govId"]').forEach(r => {
        r.addEventListener('change', () => {
            const yn = r.value === 'Yes';
            document.getElementById('govIdFields').style.display = yn ? 'flex' : 'none';
            document.getElementById('govIdNumField').style.display = yn ? 'flex' : 'none';
        });
    });

    /* association */
    document.querySelectorAll('input[name="association"]').forEach(r => {
        r.addEventListener('change', () => {
            document.getElementById('assocNameRow').style.display = r.value === 'Yes' ? 'flex' : 'none';
        });
    });

    /* residency status — smart address pre-fill */
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
                // Barangay should still have dropdown for residents
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
                    // Force hide if active
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

    /* livelihood checkboxes — show/hide sub-sections */
    [
        ['chkFarmer', 'farmerSub', 'cardFarmer'],
        ['chkFarmworker', 'farmworkerSub', 'cardFarmworker'],
        ['chkFisherfolk', 'fisherfolkSub', 'cardFisherfolk'],
        ['chkAgriYouth', 'agriyouthSub', 'cardAgriYouth'],
    ].forEach(([chkId, subId, cardId]) => {
        const chk = document.getElementById(chkId);
        if (!chk) return;
        chk.addEventListener('change', () => {
            document.getElementById(subId).style.display = chk.checked ? 'flex' : 'none';
            document.getElementById(cardId).style.borderColor = chk.checked ? 'var(--da-green)' : 'var(--border)';
        });
    });
}

/* ═══════════════════════════════  PHOTO UPLOAD  ═══════════════════════════ */
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
            photoBase64 = ev.target.result;
            preview.src = photoBase64;
            preview.style.display = 'block';
            holder.style.display = 'none';
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
            thumbmarkBase64 = ev.target.result;
            preview.src = thumbmarkBase64;
            preview.style.display = 'block';
            if (hint) hint.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

function initLandDocUpload() {
    const input = document.getElementById('landDocUpload');
    const filename = document.getElementById('landDocFilename');
    if (!input) return;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            landDocBase64 = ev.target.result;
            if (filename) {
                filename.textContent = `📎 ${file.name}`;
                filename.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    });
}

/* ═══════════════════════════  GPX FILE UPLOAD  ═════════════════════════════ */
function initGpxUpload() {
    const input = document.getElementById('gpxUpload');
    const hint = document.getElementById('gpxHint');
    const filename = document.getElementById('gpxFilename');
    if (!input) return;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            gpxBase64 = ev.target.result;
            if (hint) hint.style.display = 'none';
            if (filename) {
                filename.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                filename.style.display = 'block';
            }
            // Style zone as selected
            const zone = document.getElementById('gpxZone');
            if (zone) zone.classList.add('gpx-selected');
        };
        reader.readAsDataURL(file);
    });
}

/* ═══════════════════════════  SIGNATURE PAD  ══════════════════════════════ */
function initSignaturePad() {
    sigCanvas = document.getElementById('applicantSignature');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');

    // Resize canvas to match CSS dimensions
    function resize() {
        const rect = sigCanvas.getBoundingClientRect();
        sigCanvas.width = rect.width;
        sigCanvas.height = rect.height;
        sigCtx.lineWidth = 1.5;
        sigCtx.strokeStyle = '#111827';
        sigCtx.lineCap = 'round';
    }
    resize();
    window.addEventListener('resize', resize);

    sigCanvas.addEventListener('mousedown', startSig);
    sigCanvas.addEventListener('mousemove', drawSig);
    sigCanvas.addEventListener('mouseup', stopSig);
    sigCanvas.addEventListener('mouseleave', stopSig);
    sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); startSig(e.touches[0]); }, { passive: false });
    sigCanvas.addEventListener('touchmove', e => { e.preventDefault(); drawSig(e.touches[0]); }, { passive: false });
    sigCanvas.addEventListener('touchend', stopSig);
}

function _sigPos(e) {
    const r = sigCanvas.getBoundingClientRect();
    return { x: (e.clientX || e.pageX) - r.left, y: (e.clientY || e.pageY) - r.top };
}

function startSig(e) {
    isDrawing = true;
    const { x, y } = _sigPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(x, y);
}

function drawSig(e) {
    if (!isDrawing) return;
    const { x, y } = _sigPos(e);
    sigCtx.lineTo(x, y);
    sigCtx.stroke();
}

function stopSig() { isDrawing = false; }

function clearSignature() {
    if (!sigCtx) return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

/* ════════════════════════════  FARM PARCELS  ══════════════════════════════ */
function addFarmParcel() {
    parcelCount++;
    const container = document.getElementById('farmParcelsContainer');
    const block = document.createElement('div');
    block.className = 'farm-parcel-block';
    block.id = `parcel-${parcelCount}`;

    block.innerHTML = `
    <div class="parcel-block-header">
        <span class="parcel-block-title">Farm Parcel #${parcelCount}</span>
        ${parcelCount > 1
            ? `<button type="button" class="btn-remove-parcel" onclick="removeParcel(${parcelCount})">✕ Remove</button>`
            : '<span></span>'}
    </div>
    <div class="parcel-block-body">
        <div class="parcel-desc-grid">
            <div class="fg">
                <label class="fg-label">Farm Location (Barangay)</label>
                <input type="text" name="parcel_${parcelCount}_barangay" class="fg-input">
            </div>
            <div class="fg">
                <label class="fg-label">City / Municipality</label>
                <input type="text" name="parcel_${parcelCount}_city" class="fg-input">
            </div>
            <div class="fg">
                <label class="fg-label">Total Farm Area (in hectares)</label>
                <input type="number" name="parcel_${parcelCount}_area" class="fg-input" min="0" step="0.0001" placeholder="0.0000">
            </div>
            <div class="fg">
                <label class="fg-label">Within Ancestral Domain?</label>
                <div class="radio-row">
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_ancestral" value="Yes"> Yes</label>
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_ancestral" value="No"> No</label>
                </div>
            </div>
            <div class="fg">
                <label class="fg-label">Ownership Document No.*</label>
                <input type="text" name="parcel_${parcelCount}_owndoc" class="fg-input" placeholder="See legend">
            </div>
            <div class="fg">
                <label class="fg-label">Agrarian Reform Beneficiary?</label>
                <div class="radio-row">
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_arb" value="Yes"> Yes</label>
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_arb" value="No"> No</label>
                </div>
            </div>
            <div class="fg">
                <label class="fg-label">Coordinates (GPS / Google Maps)</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" name="parcel_${parcelCount}_lat" placeholder="Latitude" class="fg-input" style="flex:1; font-size: 0.8rem;">
                    <input type="text" name="parcel_${parcelCount}_lng" placeholder="Longitude" class="fg-input" style="flex:1; font-size: 0.8rem;">
                </div>
            </div>
        </div>

        <!-- Ownership Type -->
        <div class="fg-row" style="margin-bottom:0.75rem;">
            <div class="fg fg-full">
                <label class="fg-label">Ownership Type</label>
                <div class="ownership-type-row">
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_owntype" value="Registered Owner"> Registered Owner</label>
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_owntype" value="Others"> Others: <input type="text" name="parcel_${parcelCount}_owntype_other" class="fg-input inline-spec" placeholder="specify" style="width:120px;"></label>
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_owntype" value="Tenant"> Tenant (Name of Land Owner: <input type="text" name="parcel_${parcelCount}_landlord_tenant" class="fg-input inline-spec" placeholder="" style="width:140px;">)</label>
                    <label class="check-opt"><input type="radio" name="parcel_${parcelCount}_owntype" value="Lessee"> Lessee (Name of Land Owner: <input type="text" name="parcel_${parcelCount}_landlord_lessee" class="fg-input inline-spec" placeholder="" style="width:140px;">)</label>
                </div>
            </div>
        </div>

        <!-- Farm Parcel Data Table (matches PDF columns) -->
        <div style="overflow-x:auto;">
        <table class="parcel-data-table">
            <thead>
                <tr>
                    <th style="width:60px;">CROP / COMMODITY<br><small>(Rice/Corn/HVC/Livestock/Poultry/Agri-fishery)</small><br><small>For Livestock &amp; Poultry: specify type of animal</small></th>
                    <th style="width:70px;">SIZE (ha)</th>
                    <th style="width:70px;">NO. OF HEAD<br><small>(For Livestock and Poultry)</small></th>
                    <th style="width:60px;">FARM TYPE **</th>
                    <th style="width:70px;">ORGANIC PRACTITIONER (Y/N)</th>
                    <th>REMARKS</th>
                </tr>
            </thead>
            <tbody id="parcelTableBody_${parcelCount}">
                ${buildParcelRows(parcelCount, 4)}
            </tbody>
        </table>
        </div>
        <button type="button" class="btn-add-parcel" style="margin-top:0.5rem; font-size:0.75rem; padding:0.35rem 0.9rem;"
            onclick="addParcelRow(${parcelCount})">＋ Add Row</button>
    </div>`;

    container.appendChild(block);
    document.getElementById('numFarmParcels').value = parcelCount;
}

function buildParcelRows(pid, count) {
    let html = '';
    for (let r = 0; r < count; r++) {
        html += `
        <tr>
            <td><input type="text" name="parcel_${pid}_crop_${r}" placeholder=""></td>
            <td><input type="number" name="parcel_${pid}_size_${r}" placeholder="" step="0.0001" min="0"></td>
            <td><input type="number" name="parcel_${pid}_head_${r}" placeholder="" min="0"></td>
            <td>
                <select name="parcel_${pid}_farmtype_${r}">
                    <option value="">–</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                </select>
            </td>
            <td>
                <select name="parcel_${pid}_organic_${r}">
                    <option value="">–</option>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                </select>
            </td>
            <td>
                <input type="text" name="parcel_${pid}_remarks_${r}" placeholder="Select document" readonly class="remarks-doc-select" style="cursor: pointer;" onclick="openRemarksDropdown(this)">
            </td>
        </tr>`;
    }
    return html;
}

function addParcelRow(pid) {
    const tbody = document.getElementById(`parcelTableBody_${pid}`);
    if (!tbody) return;
    const rowIdx = tbody.rows.length;
    tbody.insertAdjacentHTML('beforeend', buildParcelRows(pid, 1).replace(/_${pid}_([a-z]+)_0/g, `_${pid}_$1_${rowIdx}`));
}

function removeParcel(id) {
    const el = document.getElementById(`parcel-${id}`);
    if (el) { el.remove(); parcelCount--; }
    document.getElementById('numFarmParcels').value = parcelCount;
    syncAttachedDocuments(); // Re-sync documents when a parcel is removed
}

/* ══════════════════════════  REMARKS DOCUMENT DROPDOWN ═════════════════════ */
let currentRemarksInput = null;

function openRemarksDropdown(inputEl) {
    currentRemarksInput = inputEl;
    const dropdown = document.getElementById('remarksDocDropdown');
    if (!dropdown) return;

    // Clear all checkboxes in the dropdown first
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);

    // If the input already has values, check the corresponding boxes
    const currentValues = inputEl.value.split(',').map(v => v.trim()).filter(v => v);
    currentValues.forEach(val => {
        const cb = dropdown.querySelector(`input[type="checkbox"][value="${val}"]`);
        if (cb) cb.checked = true;
    });

    dropdown.style.display = 'block';

    // Position it under the input
    const rect = inputEl.getBoundingClientRect();
    const content = dropdown.querySelector('.remarks-dropdown-content');
    content.style.position = 'absolute';

    // Calculate document-relative positions so it scrolls naturally
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    content.style.top = (rect.bottom + scrollTop + 4) + 'px';
    content.style.left = (rect.left + scrollLeft) + 'px';
    content.style.width = Math.max(rect.width, 350) + 'px';

    // adjust if it overflows bottom or right
    if (rect.left + 350 > window.innerWidth) {
        content.style.left = (window.innerWidth - 360 + scrollLeft) + 'px';
    }
}

function closeRemarksDropdown() {
    const dropdown = document.getElementById('remarksDocDropdown');
    if (dropdown) dropdown.style.display = 'none';
    currentRemarksInput = null;
}

function handleRemarksCheckboxChange() {
    if (!currentRemarksInput) return;

    const dropdown = document.getElementById('remarksDocDropdown');
    const checked = dropdown.querySelectorAll('input[type="checkbox"]:checked');
    const selectedValues = Array.from(checked).map(cb => cb.value);

    // Sort values numerically
    selectedValues.sort((a, b) => parseInt(a) - parseInt(b));

    currentRemarksInput.value = selectedValues.join(', ');
    syncAttachedDocuments();
}

function syncAttachedDocuments() {
    // 1. Gather all unique document numbers from ALL remarks inputs
    const allRemarksInputs = document.querySelectorAll('.remarks-doc-select');
    const uniqueDocs = new Set();

    allRemarksInputs.forEach(input => {
        const values = input.value.split(',').map(v => v.trim()).filter(v => v);
        values.forEach(v => uniqueDocs.add(v));
    });

    // 2. Loop through the "DOCUMENTS TO ATTACH" legend and update checkboxes
    const attachCheckboxes = document.querySelectorAll('input[name="attachedDoc"]');
    attachCheckboxes.forEach(cb => {
        const isNeeded = uniqueDocs.has(cb.value);
        if (cb.checked !== isNeeded) {
            cb.checked = isNeeded;
            // Optionally dispatch change event if there are other listeners
            cb.dispatchEvent(new Event('change'));
        }
    });
}

/* ══════════════════════════  CLIENT'S COPY  ════════════════════════════════ */
function populateClientsCopy() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    set('ccSurname', document.getElementById('surname')?.value);
    set('ccFirstName', document.getElementById('firstName')?.value);
    set('ccMiddleName', document.getElementById('middleName')?.value);
    set('ccExtName', document.getElementById('extensionName')?.value);

    const copyVal = id => document.getElementById(id)?.value || '';
    document.getElementById('ccRefRegion').textContent = copyVal('refRegion');
    document.getElementById('ccRefProvince').textContent = copyVal('refProvince');
    document.getElementById('ccRefCity').textContent = copyVal('refCityMuni');
    document.getElementById('ccRefBarangay').textContent = copyVal('refBarangay');
}

/* ══════════════════════════  COLLECT FORM DATA  ════════════════════════════ */
function collectFormData() {
    const val = id => document.getElementById(id)?.value?.trim() || '';
    const rval = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
    const cvals = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
    const nval = name => document.querySelector(`[name="${name}"]`)?.value?.trim() || '';

    const addr = {
        houseNo: val('houseNo'),
        street: val('street'),
        barangay: val('barangay'),
        municipality: val('municipality'),
        province: val('province'),
        region: val('region'),
    };

    const personalInfo = {
        surname: val('surname'),
        firstName: val('firstName'),
        middleName: val('middleName'),
        extensionName: val('extensionName'),
        isMabitacResident: rval('isMabitacResident') === 'Yes',
        sex: rval('sex'),
        address: addr,
        mobileNumber: val('mobileNumber'),
        landlineNumber: val('landlineNumber'),
        dateOfBirth: val('dateOfBirth'),
        placeOfBirth: val('placeOfBirth'),
        religion: rval('religion'),
        religionOther: val('religionOther'),
        civilStatus: rval('civilStatus'),
        spouseName: val('spouseName'),
        motherName: val('motherName'),
        householdHead: rval('householdHead'),
        householdHeadName: val('householdHeadName'),
        relationship: val('relationship'),
        householdMembers: val('householdMembers'),
        numMale: val('numMale'),
        numFemale: val('numFemale'),
        education: cvals('education'),
        pwd: rval('pwd'),
        fourPs: rval('fourPs'),
        indigenous: rval('indigenous'),
        indigenousSpecify: val('indigenousSpecify'),
        govId: rval('govId'),
        idType: val('idType'),
        idNumber: val('idNumber'),
        association: rval('association'),
        associationName: val('associationName'),
        emergencyPerson: val('emergencyPerson'),
        emergencyContact: val('emergencyContact'),
        photo: photoBase64,
        thumbmark: thumbmarkBase64,
        land_doc: landDocBase64,
        gpx_data: gpxBase64
    };

    const farmProfile = {
        livelihood: cvals('livelihood'),
        farmingActivity: cvals('farmingActivity'),
        otherCrops: val('otherCrops'),
        livestockType: val('livestockType'),
        poultryType: val('poultryType'),
        farmWork: cvals('farmWork'),
        farmWorkOther: val('farmWorkOther'),
        fishingActivity: cvals('fishingActivity'),
        fishingActivityOther: val('fishingActivityOther'),
        youthInvolvement: cvals('youthInvolvement'),
        youthInvolvementOther: val('youthInvolvementOther'),
        farmingIncome: val('farmingIncome'),
        nonFarmingIncome: val('nonFarmingIncome'),
    };

    // Assemble admin date from individual date box inputs
    const adminDate = val('dateMM1') + val('dateMM2') + '/'
        + val('dateDD1') + val('dateDD2') + '/'
        + val('dateYY1') + val('dateYY2') + val('dateYY3') + val('dateYY4');

    const meta = {
        enrollmentType: rval('enrollmentType'),
        date: adminDate !== '//' ? adminDate : '',
        refRegion: val('refRegion'),
        refProvince: val('refProvince'),
        refCityMuni: val('refCityMuni'),
        refBarangay: val('refBarangay'),
        numFarmParcels: val('numFarmParcels'),
        rotP1: val('rotP1'),
        rotP2: val('rotP2'),
        rotP3: val('rotP3'),
    };

    const certification = {
        applicantDate: val('applicantDate'),
        applicantPrintedName: val('applicantPrintedName'),
        signatureDataUrl: sigCanvas ? sigCanvas.toDataURL() : '',
    };


    const attachedDocs = {
        documents: cvals('attachedDoc'),
        other: document.querySelector('input[name="attachedDocOther"]')?.value?.trim() || '',
    };

    // ── Collect all farm parcel data ───────────────────────────────────────
    const parcels = [];
    const parcelBlocks = document.querySelectorAll('.farm-parcel-block');
    parcelBlocks.forEach((block, idx) => {
        const pid = idx + 1;
        const parcel = {
            barangay: nval(`parcel_${pid}_barangay`),
            municipality: nval(`parcel_${pid}_city`),
            area: nval(`parcel_${pid}_area`),
            ancestral: rval(`parcel_${pid}_ancestral`),
            ownershipDoc: nval(`parcel_${pid}_owndoc`),
            arb: rval(`parcel_${pid}_arb`),
            latitude: nval(`parcel_${pid}_lat`),
            longitude: nval(`parcel_${pid}_lng`),
            ownershipType: rval(`parcel_${pid}_owntype`),
            ownershipTypeOther: nval(`parcel_${pid}_owntype_other`),
            landlordTenant: nval(`parcel_${pid}_landlord_tenant`),
            landlordLessee: nval(`parcel_${pid}_landlord_lessee`),
            crops: [],
        };

        // Collect crop/commodity rows for this parcel
        const tbody = document.getElementById(`parcelTableBody_${pid}`);
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row, rowIdx) => {
                const commodity = nval(`parcel_${pid}_crop_${rowIdx}`);
                const size = nval(`parcel_${pid}_size_${rowIdx}`);
                const head = nval(`parcel_${pid}_head_${rowIdx}`);
                const farmType = nval(`parcel_${pid}_farmtype_${rowIdx}`);
                const organic = nval(`parcel_${pid}_organic_${rowIdx}`);
                const remarks = nval(`parcel_${pid}_remarks_${rowIdx}`);

                // Only include rows that have data
                if (commodity || size || head || farmType || organic || remarks) {
                    parcel.crops.push({ commodity, size, head, farmType, organic, remarks });
                }
            });
        }

        parcels.push(parcel);
    });

    return { personalInfo, farmProfile, meta, certification, attachedDocs, parcels };
}

/* ══════════════════════════  PDF DOWNLOAD  ═════════════════════════════════ */
function downloadPDF() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    const data = collectFormData();
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    fetch('/forms/download/rsba-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(data),
    })
        .then(res => {
            if (!res.ok) throw new Error('PDF generation failed');
            return res.blob();
        })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'RSBSA_Enrollment_Form.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        })
        .catch(err => showToast('PDF download failed: ' + err.message, 'error'))
        .finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = '⬇ Download Pre-filled PDF'; }
        });
}

/* ══════════════════════════  FORM SUBMIT  ══════════════════════════════════ */
function bindFormSubmit() {
    const form = document.getElementById('rsbsaForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateStep(3)) return;

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Submitting...';

        const data = collectFormData();
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

        try {
            const url = isEditing ? `/encoder/api/submissions/${editRegistrationId}` : '/forms/submit/rsbsa';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                if (!isEditing) {
                    form.reset();
                    parcelCount = 0;
                    document.getElementById('farmParcelsContainer').innerHTML = '';
                    addFarmParcel();

                    // Show beautiful success modal instead of toast
                    const modal = document.getElementById('successModal');
                    if (modal) {
                        modal.style.display = 'flex';
                    }
                } else {
                    // Show toast for simple save changes and refresh parent dashboard
                    showToast('✓ Changes saved successfully!', 'success');
                    window.parent.postMessage({ type: 'SUBMISSION_UPDATED' }, '*');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // After closing modal, reload or redirect to dashboard
    window.location.reload();
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

/* Field error style is injected inline */
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

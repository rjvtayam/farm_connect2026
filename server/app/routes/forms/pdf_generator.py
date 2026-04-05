"""
Farm Connect - PDF Generator
Fills named AcroForm fields in fillable PDF templates using pypdf.
The fillable PDFs were created in Adobe Acrobat with named form fields.
"""

import io
import os
import base64
import traceback
from datetime import date
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject, BooleanObject, NumberObject, DictionaryObject, ArrayObject
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader

# Path to the original fillable PDF templates
PDF_DIR = os.path.normpath(os.path.join(
    os.path.dirname(__file__),
    '..', '..', '..', '..', 'client', 'public', 'forms', 'pdfs'
))


def _get_pdf_path(filename):
    return os.path.normpath(os.path.join(PDF_DIR, filename))


# ─────────────────────────────────────────────────────────────────────────────
# Core: Hierarchical Field Name Resolution & Smart Radio/Checkbox Filling
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_field_name(annot_obj):
    """
    Resolve the fully qualified field name by walking the /Parent chain.
    PDF fields can be hierarchical — the full name is formed by joining
    each ancestor's /T with '.' separator (per PDF spec §12.7.3.2).
    Returns the full name string, or None if no /T found anywhere.
    """
    parts = []
    obj = annot_obj
    visited = set()
    while obj is not None:
        obj_id = id(obj)
        if obj_id in visited:
            break
        visited.add(obj_id)
        t = obj.get('/T')
        if t:
            parts.insert(0, str(t).strip())
        parent = obj.get('/Parent')
        if parent:
            try:
                obj = parent.get_object()
            except Exception:
                break
        else:
            break
    return '.'.join(parts) if parts else None


def _get_inherited_field_type(annot_obj):
    """
    Get the /FT (field type) by checking the annotation itself,
    then walking up the /Parent chain. Returns '/Tx', '/Btn', '/Ch', or None.
    """
    obj = annot_obj
    visited = set()
    while obj is not None:
        obj_id = id(obj)
        if obj_id in visited:
            break
        visited.add(obj_id)
        ft = obj.get('/FT')
        if ft:
            return str(ft)
        parent = obj.get('/Parent')
        if parent:
            try:
                obj = parent.get_object()
            except Exception:
                break
        else:
            break
    return None


def _get_checkbox_on_state(annot_obj):
    """
    Detect the correct 'on' appearance state for a checkbox/radio widget.
    Inspects /AP/N and returns whichever key is NOT '/Off'.
    Falls back to '/Yes' if detection fails.
    """
    try:
        ap = annot_obj.get('/AP')
        if ap:
            n_dict = ap.get('/N')
            if n_dict:
                keys = [str(k) for k in n_dict.keys()]
                for k in keys:
                    if k != '/Off':
                        return k
    except Exception:
        pass
    return '/Yes'


def _fill_button_field(annots, value, reader_on_states=None):
    """
    Fill a checkbox or radio button field (one or more widget annotations).
    Sets /V (value) on Parent and /AS (appearance state) on Widget.
    Minimal implementation to rely on PDF's built-in appearance streams.
    """
    if value is None: return
    val_str = str(value).strip().lower()

    def _on_state_for(idx, annot):
        if reader_on_states and idx < len(reader_on_states) and reader_on_states[idx]:
            return reader_on_states[idx]
        return _get_checkbox_on_state(annot)

    # ── 1. Radio groups (multiple widgets) ──────────────────────────────────
    if len(annots) > 1:
        matched_idx = -1
        for idx, annot in enumerate(annots):
            on_state = _on_state_for(idx, annot)
            on_clean = on_state.lstrip('/').strip().lower()
            if on_clean == val_str:
                matched_idx = idx; break
            if val_str in ('yes', '1', 'true', 'on', 'registered owner') and on_clean in ('yes', 'on', 'true', 'chk', 'checked'):
                matched_idx = idx; break
            if val_str in ('no', '0', 'false', 'off') and on_clean in ('no', 'off', 'false', 'unchk'):
                matched_idx = idx; break

        if matched_idx >= 0:
            on_name = NameObject(_on_state_for(matched_idx, annots[matched_idx]))
            
            # Set /V on Parent (Field Object)
            if '/Parent' in annots[matched_idx]:
                parent = annots[matched_idx]['/Parent'].get_object()
                parent.update({NameObject('/V'): on_name})

            # Set /AS on each widget
            for idx, annot in enumerate(annots):
                on_state_i = _on_state_for(idx, annot)
                if idx == matched_idx:
                    annot.update({NameObject('/AS'): on_name})
                else:
                    annot.update({NameObject('/AS'): NameObject('/Off')})
                _set_readonly(annot)
        return

    # ── 2. Single widget checkbox ───────────────────────────────────────────
    annot = annots[0]
    on_state = _on_state_for(0, annot)
    on_name = NameObject(on_state)
    on_clean = on_state.lstrip('/').strip().lower()

    if val_str in ('yes', 'on', 'true', '1') or val_str == on_clean:
        annot.update({
            NameObject('/V'): on_name,
            NameObject('/AS'): on_name,
        })
    else:
        annot.update({
            NameObject('/V'): NameObject('/Off'),
            NameObject('/AS'): NameObject('/Off'),
        })
    _set_readonly(annot)


def _set_readonly(annot_obj):
    """Set the field as read-only (bit 1 of /Ff)."""
    existing_ff = annot_obj.get('/Ff', 0)
    if isinstance(existing_ff, (int, NumberObject)):
        annot_obj.update({
            NameObject('/Ff'): NumberObject(int(existing_ff) | 1),
        })


def _fill_pdf_fields(pdf_path, field_values):
    """
    Open a fillable PDF and fill its AcroForm fields by name.
    Handles hierarchical field names and radio/checkbox groups.

    `field_values` is a dict of { field_name: value }.
    For radio groups, value should match an AP on-state (case-insensitive).
    For text fields, value should be a string.
    Returns a BytesIO buffer of the filled PDF.
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    # ── Step 1: Copy document structure ──
    # writer.append() clones the entire structure including /AcroForm and /Parent links
    writer.append(reader)

    # ── Step 2: Build name → annotations map from WRITER's annotations ──
    # Since we used append(), the writer's annotations have their /Parent chains intact.
    field_annots = {}   # { full_field_name: [w_annot_obj, ...] }
    for page in writer.pages:
        if '/Annots' not in page:
            continue
        for annotation in page['/Annots']:
            try:
                annot_obj = annotation.get_object()
            except Exception:
                continue
            if annot_obj.get('/Subtype') != '/Widget':
                continue
            full_name = _resolve_field_name(annot_obj)
            if full_name:
                field_annots.setdefault(full_name, []).append(annot_obj)

    # ── Step 3: Fill each requested field ──
    # Build a lowercase map for case-insensitive lookup
    lower_field_annots = {k.lower(): v for k, v in field_annots.items()}

    for field_name, value in field_values.items():
        if value is None:
            continue

        # Try exact match first, then case-insensitive
        annots = field_annots.get(field_name) or lower_field_annots.get(field_name.lower())
        if not annots:
            continue

        try:
            # Special case for 'province': disable Comb and MaxLen to allow full names like "Laguna"
            if field_name == 'province':
                for annot in annots:
                    # Remove Comb flag (bit 25 is 1<<24)
                    ff = annot.get('/Ff', 0)
                    if ff & (1 << 24):
                        annot.update({NameObject('/Ff'): NumberObject(ff & ~(1 << 24))})
                    # Remove MaxLen
                    annot.pop(NameObject('/MaxLen'), None)
                    
                    if '/Parent' in annot:
                        parent = annot['/Parent'].get_object()
                        ff_p = parent.get('/Ff', 0)
                        if ff_p & (1 << 24):
                            parent.update({NameObject('/Ff'): NumberObject(ff_p & ~(1 << 24))})
                        parent.pop(NameObject('/MaxLen'), None)

            # Determine field type (may be inherited from parent)
            field_type = _get_inherited_field_type(annots[0])

            if field_type == '/Btn':
                _fill_button_field(annots, value)
            else:
                # Text / choice field — find logical terminal field to set /V
                # (per PDF spec, /V belongs on the field object, not the widget)
                main_obj = annots[0]
                # If the widget itself or its parent defines /FT, use that.
                # Otherwise, default to the widget itself.
                if '/FT' not in main_obj and '/Parent' in main_obj:
                    parent = main_obj['/Parent'].get_object()
                    if '/FT' in parent:
                        main_obj = parent

                main_obj.update({
                    NameObject('/V'): TextStringObject(str(value)),
                })

                # Always set each widget as readonly
                for annot in annots:
                    _set_readonly(annot)
        except Exception:
            continue  # Skip problematic fields, don't crash

    # ── Step 4: Finalize AcroForm flags ──
    # Force the viewer to regenerate appearances (NeedAppearances = true)
    try:
        if '/AcroForm' not in writer.root_object:
            writer.root_object.update({
                NameObject('/AcroForm'): DictionaryObject({
                    NameObject('/Fields'): ArrayObject(),
                    NameObject('/NeedAppearances'): BooleanObject(True)
                })
            })
        else:
            writer.root_object['/AcroForm'].update({
                NameObject('/NeedAppearances'): BooleanObject(True)
            })
    except Exception:
        pass

    # ── Step 5: Fix radio-group square checkmarks ──
    # The PDF template uses /MK/CA='n' (ZapfDingbats square ■) for radio
    # group widgets. Replace with '4' (checkmark ✓) ONLY on those widgets.
    # This does NOT affect simple checkboxes (Rice, Farmer, etc.)
    _fix_radio_square_marks(writer)

    # ── Step 6: Force all fields to be Read-Only ──
    # The user requested the generated PDF be strictly "view only".
    for page in writer.pages:
        if '/Annots' not in page:
            continue
        for annotation in page['/Annots']:
            try:
                annot_obj = annotation.get_object()
                if annot_obj.get('/Subtype') == '/Widget':
                    _set_readonly(annot_obj)
                    if '/Parent' in annot_obj:
                        _set_readonly(annot_obj['/Parent'].get_object())
            except Exception:
                continue

    # ── Step 7: Write to buffer ──
    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output


def _fix_radio_square_marks(writer):
    """
    Post-process: fix the checkmark character ONLY for parcel radio-group
    fields (ancestral_domain, agrarian_reform_beneficiary, ownership_type).
    These use /MK/CA='n' (ZapfDingbats square ■) in the template.
    All other checkboxes (Rice, Farmer, sex, etc.) are NOT touched.
    """
    PARCEL_RADIO_NAMES = {'ancestral_domain', 'agrarian_reform_beneficiary', 'ownership_type'}
    
    for page in writer.pages:
        if '/Annots' not in page:
            continue
        for annotation in page['/Annots']:
            try:
                annot_obj = annotation.get_object()
                if annot_obj.get('/Subtype') != '/Widget':
                    continue
                
                # Resolve the field name to check if it's a parcel radio
                full_name = _resolve_field_name(annot_obj)
                if not full_name:
                    continue
                
                # Check if the base name (without suffix) matches a parcel radio
                base_name = full_name.split('_c')[0]  # strip chunk suffix (_c0, _c1)
                # Strip parcel suffix (_2, _3) to get the base field name
                for suffix in ('_2', '_3', '_4', '_5'):
                    if base_name.endswith(suffix):
                        base_name = base_name[:-len(suffix)]
                        break
                
                if base_name not in PARCEL_RADIO_NAMES:
                    continue  # Not a parcel radio field, skip
                
                # Rather than deleting the /AP (which fails when the doc is Read-Only),
                # we'll patch the graphical Appearance Stream directly to draw a '4'
                # (ZapfDingbats checkmark) instead of an 'n' (square).
                ap = annot_obj.get('/AP')
                if ap and '/N' in ap:
                    n_dict = ap['/N'].get_object()
                    for state_key, stream_obj in n_dict.items():
                        # The stream_obj is an IndirectObject pointing to a StreamObject
                        stream = stream_obj.get_object()
                        if stream:
                            # Read the raw drawing instructions
                            data = stream.get_data()
                            # Replace the square drawing command `(n) Tj` with checkmark `(4) Tj`
                            if b'(n) Tj' in data:
                                new_data = data.replace(b'(n) Tj', b'(4) Tj')
                                stream._data = new_data
                                # Optionally clear filters so the new raw data is used directly
                                if '/Filter' in stream:
                                    del stream['/Filter']
            except Exception:
                continue


# ─────────────────────────────────────────────────────────────────────────────
# Photo Embedding Helper
# ─────────────────────────────────────────────────────────────────────────────

def _embed_photo_on_pdf(pdf_buffer, photo_data, x, y, width, height):
    """
    Overlay a photo image onto the first page of a PDF.
    `photo_base64` is a data URI (e.g., 'data:image/png;base64,...') or raw base64.
    `x, y` are the bottom-left position in PDF points.
    `width, height` are in PDF points (72 pts = 1 inch).
    Returns a new BytesIO buffer with the photo embedded.
    """
    try:
        # Decode base64 image or load from file
        image_buf = None
        if isinstance(photo_data, str) and photo_data.startswith('data:image'):
            if ',' in photo_data:
                b64_data = photo_data.split(',', 1)[1]
            else:
                b64_data = photo_data
            image_bytes = base64.b64decode(b64_data)
            image_buf = io.BytesIO(image_bytes)
        elif isinstance(photo_data, str) and (photo_data.startswith('/static/') or os.path.isabs(photo_data)):
            # It's a path. Resolve it relative to the server if needed.
            if photo_data.startswith('/static/'):
                # Assuming /static/ is in the client or server static folder
                # Our Beneficiary photo_path is /static/uploads/beneficiaries/...
                # The root is c:\FARM CONNECT PROJECT 2026 - Copy\server
                root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                full_path = os.path.normpath(os.path.join(root, photo_data.lstrip('/')))
            else:
                full_path = photo_data
            
            if os.path.exists(full_path):
                with open(full_path, 'rb') as f:
                    image_buf = io.BytesIO(f.read())
            else:
                print(f"[PDF Photo Embed] Error: File not found: {full_path}")
                return pdf_buffer
        else:
            # Try raw base64 as fallback
            try:
                image_bytes = base64.b64decode(photo_data)
                image_buf = io.BytesIO(image_bytes)
            except:
                return pdf_buffer

        if not image_buf:
            return pdf_buffer

        # Get the first page dimensions from the existing PDF
        pdf_buffer.seek(0)
        reader = PdfReader(pdf_buffer)
        first_page = reader.pages[0]
        media_box = first_page.mediabox
        page_width = float(media_box.width or 612) # Fallback to Letter width
        page_height = float(media_box.height or 792) # Fallback to Letter height

        # Create an overlay PDF with the photo
        overlay_buf = io.BytesIO()
        c = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
        img = ImageReader(image_buf)
        c.drawImage(img, x, y, width=width, height=height,
                    preserveAspectRatio=True, anchor='nw', mask='auto')
        c.save()

        # Merge the overlay onto the first page
        overlay_buf.seek(0)
        overlay_reader = PdfReader(overlay_buf)

        writer = PdfWriter()
        pdf_buffer.seek(0)
        reader = PdfReader(pdf_buffer)

        for i, page in enumerate(reader.pages):
            if i == 0:
                page.merge_page(overlay_reader.pages[0])
            writer.add_page(page)

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)
        return output

    except Exception as e:
        print(f"[PDF Photo Embed] Error: {e}")
        traceback.print_exc()
        return pdf_buffer


def generate_rsba_pdf(data):
    """
    Fill the RSBSA enrollment fillable PDF using named AcroForm fields.
    Automatically handles any number of farm parcels by creating 
    additional continuation pages as needed.
    """
    original_path = _get_pdf_path('rsbsa-enrollment-form.pdf')

    # ── Extract nested sub-objects ──────────────────────────────────────────
    pi   = data.get('personalInfo', {})
    addr = pi.get('address', {})
    fp   = data.get('farmProfile', {})
    meta = data.get('meta', {})
    cert = data.get('certification', {})
    parcels = data.get('parcels', [])

    # Date helper
    def format_to_8_digits(date_str):
        if not date_str: return ''
        clean = str(date_str).replace('-', '').replace('/', '')
        if len(clean) == 8:
            if clean.startswith('20') or clean.startswith('19'):
                return clean[4:6] + clean[6:8] + clean[0:4]
            return clean
        return clean[:8]

    # Chunk parcels into groups of 3
    parcel_chunks = [parcels[i:i + 3] for i in range(0, len(parcels), 3)]
    if not parcel_chunks:
        parcel_chunks = [[]]

    writer = PdfWriter()

    for chunk_idx, chunk in enumerate(parcel_chunks):
        fields = {}

        # ── 1. Common Fields (Repeated on every copy for ID) ────────────────
        enrollment_type = meta.get('enrollmentType', 'new')
        if enrollment_type:
            fields['enrollment_type'] = enrollment_type

        fields['date'] = format_to_8_digits(meta.get('date', ''))
        fields['reference_region'] = meta.get('refRegion', '')
        fields['reference_province'] = meta.get('refProvince', '')
        fields['reference_city/muni'] = meta.get('refCityMuni', '')
        fields['reference_barangay'] = meta.get('refBarangay', '')
        fields['reference_number'] = meta.get('referenceNumber', '')

        # Personal Info
        fields['surname'] = pi.get('surname') or pi.get('lastName') or pi.get('last_name') or ''
        fields['first_name'] = pi.get('firstName') or pi.get('first_name') or ''
        fields['middle_name'] = pi.get('middleName', '')
        fields['extension_name'] = pi.get('extensionName', '')
        
        sex = pi.get('sex', '')
        if sex: fields['sex'] = sex

        # Address
        fields['house/lot/bldg.no./purok'] = addr.get('houseNo', '')
        fields['street/sitio/subdv'] = addr.get('street', '')
        fields['barangay'] = addr.get('barangay', '')
        fields['municipality/city'] = addr.get('municipality', '') or addr.get('city', '')
        fields['province'] = addr.get('province', '')
        fields['region'] = addr.get('region', '')

        # ── 2. Farm Profile & Certification (Full on first page, empty or partial on others) ──
        # We fill them on all pages to keep the document looking official and redundant for safety
        fields['mobile_number'] = pi.get('mobileNumber', '')
        fields['landline_number'] = pi.get('landlineNumber', '')
        
        education_list = pi.get('education', [])
        if isinstance(education_list, str): education_list = [education_list]
        if education_list: fields['education'] = education_list[0]

        fields['birth_date'] = format_to_8_digits(pi.get('dateOfBirth', ''))
        place_of_birth = pi.get('placeOfBirth', '')
        birth_parts = [p.strip() for p in place_of_birth.split(',')]
        fields['birth_municipality'] = birth_parts[0] if len(birth_parts) > 0 else ''
        fields['birth_province'] = birth_parts[1] if len(birth_parts) > 1 else ''
        fields['birth_country'] = birth_parts[2] if len(birth_parts) > 2 else 'Philippines'

        pwd_val = pi.get('pwd', '')
        if pwd_val: fields['person_with_disability'] = pwd_val
        
        religion = pi.get('religion', '')
        if religion: fields['religion'] = religion
        fields['religion_specify'] = pi.get('religionOther', '')

        cs = pi.get('civilStatus', '')
        if cs: fields['civil_status'] = cs
        
        fields['name_spouse'] = pi.get('spouseName', '')
        
        fourps_val = pi.get('fourPs', '')
        if fourps_val: fields['4ps_beneficiary'] = fourps_val
        
        indigenous_val = pi.get('indigenous', '')
        if indigenous_val: fields['indigenous_group'] = indigenous_val
        fields['beneficiary_specify'] = pi.get('indigenousSpecify', '')

        fields['mothers_maiden_name'] = pi.get('motherName', '')
        
        gov_id = pi.get('govId', '')
        if gov_id: fields['government_id'] = gov_id
        fields['government_id_type'] = pi.get('idType', '')
        fields['government_id_number'] = pi.get('idNumber', '')

        hh = pi.get('householdHead', '')
        if hh: fields['household_head'] = hh
        fields['name_household_head'] = pi.get('householdHeadName', '')
        fields['relationship_household_head'] = pi.get('relationship', '')
        fields['number_living_household_members'] = str(pi.get('householdMembers', ''))
        fields['number_male'] = str(pi.get('numMale', ''))
        fields['number_female'] = str(pi.get('numFemale', ''))

        assoc = pi.get('association', '')
        if assoc: fields['farmers_association/cooperative'] = assoc
        fields['farmers_association/cooperative_specify'] = pi.get('associationName', '')

        fields['emergency_person'] = pi.get('emergencyPerson', '')
        fields['emergency_contact'] = pi.get('emergencyContact', '')

        # Part II
        livelihoods = fp.get('livelihood', [])
        if 'FARMER' in livelihoods: fields['main_livelihood_farmer'] = 'farmer'
        for lh_val, ap_match in [('FARMWORKER/LABORER', 'farmworker/laborer'), ('FISHERFOLK', 'fisherfolk'), ('AGRI YOUTH', 'agri_youth')]:
            if lh_val in livelihoods:
                fields['main_livelihood'] = ap_match
                break

        farming_activities = fp.get('farmingActivity', [])
        if 'Rice' in farming_activities: fields['farming_activity_rice'] = 'rice'
        if 'Corn' in farming_activities: fields['farming_activity_corn'] = 'corn'
        if 'Other crops' in farming_activities: fields['farming_activity_crops'] = 'other_crops'
        if 'Livestock' in farming_activities: fields['farming_activity_livestock'] = 'livestock'
        if 'Poultry' in farming_activities: fields['farming_activity_poultry'] = 'poultry'

        fields['specify_crops'] = fp.get('otherCrops', '')
        fields['specify_livestock'] = fp.get('livestockType', '')
        fields['specify_poultry'] = fp.get('poultryType', '')

        farm_work = fp.get('farmWork', [])
        if 'Land Preparation' in farm_work: fields['farmworkers_work_land_preparation'] = 'land_preparation'
        if 'Planting/Transplanting' in farm_work: fields['farmworkers_work_planting/transplanting'] = 'planting/transplanting'
        if 'Cultivation' in farm_work: fields['farmworkers_work_cultivation'] = 'cultivation'
        if 'Harvesting' in farm_work: fields['farmworkers_work_harvesting'] = 'harvesting'
        if 'Others' in farm_work: fields['farmworkers_work_others'] = 'others'
        fields['farmworkers_work_specify'] = fp.get('farmWorkOther', '')

        fishing = fp.get('fishingActivity', [])
        if 'Fish Capture' in fishing: fields['fishing_activity_fish_capture'] = 'fish_capture'
        if 'Aquaculture' in fishing: fields['fishing_activity_aquaculture'] = 'aquaculture'
        if 'Gleaning' in fishing: fields['fishing_activity_gleaning'] = 'gleaning'
        if 'Others' in fishing: fields['fishing_activity_others'] = 'others'
        if 'Fish Processing' in fishing: fields['fishing_activity_fish_processing'] = 'fish_processing'
        if 'Fish Vending' in fishing: fields['fishing_activity_fish_vending'] = 'fish_vending'
        fields['fishing_activity_specify'] = fp.get('fishingActivityOther', '')

        youth = fp.get('youthInvolvement', [])
        if 'part of a farming household' in youth: fields['agri_youth_involvement_household'] = 'farming_household'
        if 'attending/attended formal agri-fishery related course' in youth: fields['agri_youth_involvement_formal_course'] = 'formal_course'
        if 'attending/attended non-formal agri-fishery related course' in youth: fields['agri_youth_involvement_non-formal_course'] = 'non_formal_course'
        if 'participated in any agricultural activity/program' in youth: fields['agri_youth_involvement_agricultural/activity_program'] = 'agricultural_activity/program'
        if 'others' in youth: fields['agri_youth_involvement_others'] = 'specify'
        fields['agri_youth_specify'] = fp.get('youthInvolvementOther', '')

        fields['farming_gross_annual_income'] = str(fp.get('farmingIncome', ''))
        fields['non_farming_gross_annual_income'] = str(fp.get('nonFarmingIncome', ''))

        fields['no._farm_parcels'] = str(meta.get('numFarmParcels', len(parcels) or ''))
        fields['name_farmer_p1'] = meta.get('rotP1', '')
        fields['name_farmer_p2'] = meta.get('rotP2', '')
        fields['name_farmer_p3'] = meta.get('rotP3', '')

        # ── 3. Parcel Information for CURRENT CHUNK ────────────────────────
        for p_idx in range(3):
            suffix = '' if p_idx == 0 else f'_{p_idx + 1}'
            
            # Initialize slots to empty
            fields[f'farm_location_barangay{suffix}'] = ''
            fields[f'farm_location_municipality{suffix}'] = ''
            fields[f'total_farm_area{suffix}'] = ''
            fields[f'ownership_document_number{suffix}'] = ''
            fields[f'ownership_type_others{suffix}'] = ''
            fields[f'name_land_owner_tenant{suffix}'] = ''
            fields[f'name_land_owner_lessee{suffix}'] = ''
            
            fields[f'ancestral_domain{suffix}'] = ''
            fields[f'agrarian_reform_beneficiary{suffix}'] = ''
            fields[f'ownership_type{suffix}'] = ''
            
            for r_i in range(5):
                f_num = (p_idx * 5) + r_i + 1
                n_sfx = '' if f_num == 1 else f'_{f_num}'
                fields[f'crop/commodity{n_sfx}'] = ''
                fields[f'size_ha{n_sfx}'] = ''
                fields[f'no._head{n_sfx}'] = ''
                fields[f'farm_type{n_sfx}'] = ''
                fields[f'organic_practitioner{n_sfx}'] = ''
                fields[f'remarks{n_sfx}'] = ''

            # If we have a parcel in this chunk slot, fill it
            if p_idx < len(chunk):
                p = chunk[p_idx]
                fields[f'farm_location_barangay{suffix}'] = p.get('barangay', '')
                fields[f'farm_location_municipality{suffix}'] = p.get('municipality', '')
                fields[f'total_farm_area{suffix}'] = str(p.get('area', ''))
                
                ancestral = p.get('ancestral', '')
                if ancestral: fields[f'ancestral_domain{suffix}'] = ancestral
                
                fields[f'ownership_document_number{suffix}'] = p.get('ownershipDoc', '')
                
                arb = p.get('arb', '')
                if arb: fields[f'agrarian_reform_beneficiary{suffix}'] = arb
                
                own_type = p.get('ownershipType', '')
                own_map = {
                    'Registered Owner': 'YES',
                    'Tenant': 'TENANT',
                    'Lessee': 'LESSEEE',
                    'Others': 'OTHERS'
                }
                own_val = own_map.get(own_type, own_type)
                if own_val: fields[f'ownership_type{suffix}'] = own_val
                
                fields[f'ownership_type_others{suffix}'] = p.get('ownershipTypeOther', '')
                fields[f'name_land_owner_tenant{suffix}'] = p.get('landlordTenant', '')
                fields[f'name_land_owner_lessee{suffix}'] = p.get('landlordLessee', '')

                # Crops for this parcel
                crops = p.get('crops', [])
                for r_idx in range(min(len(crops), 5)):
                    crop = crops[r_idx]
                    f_num = (p_idx * 5) + r_idx + 1
                    n_sfx = '' if f_num == 1 else f'_{f_num}'
                    fields[f'crop/commodity{n_sfx}'] = crop.get('commodity', '')
                    fields[f'size_ha{n_sfx}'] = str(crop.get('size', ''))
                    fields[f'no._head{n_sfx}'] = str(crop.get('head', ''))
                    fields[f'farm_type{n_sfx}'] = str(crop.get('farmType', ''))
                    fields[f'organic_practitioner{n_sfx}'] = crop.get('organic', '')
                    fields[f'remarks{n_sfx}'] = crop.get('remarks', '')

        # Certification
        cert = data.get('certification', {})
        cert_name = cert.get('applicantPrintedName', '') or f"{pi.get('firstName', '')} {pi.get('surname', '')}".strip()
        fields['printed_name_applicant'] = cert_name.upper()
        fields['printed_name_verifier'] = cert.get('verifierName', '')
        fields['printed_name_city/municipal_agriculture_office'] = cert.get('maoName', '')
        fields['printed_name_cafc/mafc_chairman'] = cert.get('chairmanName', '')

        # -- 4. Generate & Append Segment -------------------------------------------
        pdf_seg_buf = _fill_pdf_fields(original_path, fields)

        # Use PdfReader to extract pages and rename fields to prevent mirroring
        pdf_seg_buf.seek(0)
        reader = PdfReader(pdf_seg_buf)

        # Namespace field names to this chunk
        seen_fields = set()
        for page in reader.pages:
            if '/Annots' not in page: continue
            for annotation in page['/Annots']:
                try:
                    annot_obj = annotation.get_object()
                    # Rename the field itself and all its ancestors that have names
                    curr = annot_obj
                    while curr:
                        if '/T' in curr:
                            if id(curr) not in seen_fields:
                                old_t = str(curr['/T'])
                                curr.update({NameObject('/T'): TextStringObject(f"{old_t}_c{chunk_idx}")})
                                seen_fields.add(id(curr))
                        
                        parent = curr.get('/Parent')
                        if parent:
                            curr = parent.get_object()
                        else:
                            break
                except Exception:
                    pass

        # Append preserves AcroForm (unlike add_page which drops fields like surname)
        writer.append(reader)

    # 4.5. Final Global Flags (Ensure NeedAppearances persists in final merged PDF)
    try:
        if '/AcroForm' not in writer.root_object:
            writer.root_object.update({
                NameObject('/AcroForm'): DictionaryObject({
                    NameObject('/Fields'): ArrayObject(),
                    NameObject('/NeedAppearances'): BooleanObject(True)
                })
            })
        else:
            writer.root_object['/AcroForm'].update({
                NameObject('/NeedAppearances'): BooleanObject(True)
            })
    except:
        pass

    # -- 5. Embed Photo on First Page ---------------------------------------------
    photo_data = pi.get('photo', '')
    if photo_data and isinstance(photo_data, str) and photo_data.startswith('data:image'):
        try:
            image_buf = None
            if ',' in photo_data:
                b64_data = photo_data.split(',', 1)[1]
            else:
                b64_data = photo_data
            image_bytes = base64.b64decode(b64_data)
            if not image_bytes: return writer # Skip empty image
            image_buf = io.BytesIO(image_bytes)

            overlay_buf = io.BytesIO()
            # 612x792 are standard Letter dimensions
            c = rl_canvas.Canvas(overlay_buf, pagesize=(612, 792))
            img = ImageReader(image_buf)
            # Standard RSBSA form: 2x2 photo is in the top-right corner of page 1
            c.drawImage(img, 488, 650, width=110, height=125, preserveAspectRatio=True, anchor='nw', mask='auto')
            c.save()

            overlay_buf.seek(0)
            overlay_reader = PdfReader(overlay_buf)
            # Overlay photo directly onto the very first page of the merged document
            if len(writer.pages) > 0:
                writer.pages[0].merge_page(overlay_reader.pages[0])
        except Exception as e:
            print(f"[PDF Photo Embed] Error: {e}")

    # -- 5.1 Embed Signature & Thumbmark on all Page 2s ---------------------------
    cert = data.get('certification', {})
    sig_data = cert.get('signatureDataUrl', '')
    personal = data.get('personalInfo', {})
    thumb_data = personal.get('thumbmark', '') # Collect if present

    def _embed_at(page_idx, data_url, x, y, w, h):
        try:
            if not data_url or not isinstance(data_url, str) or ',' not in data_url: return
            b64 = data_url.split(',', 1)[1]
            if not b64 or b64.strip() == '': return
            img_bytes = base64.b64decode(b64)
            if not img_bytes: return
            overlay = io.BytesIO()
            c = rl_canvas.Canvas(overlay, pagesize=(612, 792))
            c.drawImage(ImageReader(io.BytesIO(img_bytes)), x, y, width=w, height=h, preserveAspectRatio=True, mask='auto')
            c.save()
            overlay.seek(0)
            writer.pages[page_idx].merge_page(PdfReader(overlay).pages[0])
        except Exception as e:
            print(f"[PDF Sig Embed] Page {page_idx} Error: {e}")

    # Certification is on the 2nd page of every chunk (index 1, 3, 5...)
    for c_i in range(len(parcels) // 3 + (1 if len(parcels) % 3 > 0 or not parcels else 0)):
        target_page = (c_i * 2) + 1
        if target_page < len(writer.pages):
            # Signature over "SIGNATURE OF APPLICANT" (approx based on date [35,130] and name [145,303])
            _embed_at(target_page, sig_data, 318, 315, 140, 50)
            # Thumbmark in "THUMBMARK" box
            _embed_at(target_page, thumb_data, 495, 315, 80, 50)

    # Ensure all newly added visual text layers generate correctly
    try:
        if '/AcroForm' in writer.root_object:
            writer.root_object['/AcroForm'].update({
                NameObject('/NeedAppearances'): BooleanObject(True)
            })
    except Exception:
        pass

    # -- 6. Output Merged Result --------------------------------------------------
    final_output = io.BytesIO()
    writer.write(final_output)
    final_output.seek(0)
    return final_output

# Fisherfolk Registration Form
# ─────────────────────────────────────────────────────────────────────────────
def generate_fish_pdf(data):
    """
    Fill the Fisherfolk registration fillable PDF.
    Returns a BytesIO buffer.
    """
    original_path = _get_pdf_path('fish-registration-form.pdf')

    try:
        reader = PdfReader(original_path)
        if reader.get_fields():
            # PDF has form fields — fill them
            fields = _map_fish_fields(data)
            return _fill_pdf_fields(original_path, fields)
    except Exception:
        pass

    # Fallback: use overlay approach for non-fillable PDFs
    return _generate_fish_pdf_overlay(data)


def _map_fish_fields(data):
    """Map fish registration data directly to the AcroForm exact field names."""
    fields = {}
    pi = data.get('personalInfo', data)
    fields['registration_no'] = data.get('registrationNo', '')
    fields['registration_date'] = data.get('registrationDate', '')
    fields['new_renewal'] = data.get('status', 'new')
    
    fields['last_name'] = pi.get('lastName') or pi.get('surname') or pi.get('last_name') or data.get('lastName') or ''
    fields['first_name'] = pi.get('firstName') or pi.get('first_name') or data.get('firstName') or ''
    fields['middle_name'] = pi.get('middleName') or pi.get('middle_name') or ''
    fields['appelation'] = pi.get('extensionName') or pi.get('suffix') or pi.get('appellation') or '' # Misspelled in PDF
    
    addr = pi.get('address', data)
    fields['street_barangay'] = f"{addr.get('street', '')} {addr.get('barangay', '')}".strip() or data.get('street', '')
    fields['city_municipality'] = addr.get('municipality', '') or data.get('city', 'Alaminos')
    fields['province'] = addr.get('province', '') or data.get('province', 'Pangasinan')
    
    fields['contact_no'] = pi.get('contactNo', pi.get('mobileNumber', data.get('contactNo', '')))
    
    dob = pi.get('dateOfBirth', data.get('dateOfBirth', ''))
    if dob and '-' in dob:
        parts = dob.split('-') # YYYY-MM-DD
        if len(parts) == 3:
            fields['date_of_birth_year'] = parts[0]
            fields['date_of_birth_month'] = parts[1]
            fields['date_of_birth_day'] = parts[2]
            
    fields['place_of_birth'] = pi.get('placeOfBirth', data.get('placeOfBirth', ''))
    fields['gender'] = pi.get('gender', pi.get('sex', data.get('gender', '')))
    fields['civil_status'] = pi.get('civilStatus', data.get('civilStatus', ''))
    
    ec = data.get('emergencyContact', {})
    fields['person_in_case_of_emergency'] = ec.get('person') or data.get('emergencyPerson', '')
    fields['emergency_contact_no'] = ec.get('contact') or data.get('emergencyContact', '')
    
    return fields


def _generate_fish_pdf_overlay(data):
    """Fallback overlay approach for non-fillable fish registration PDFs."""
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib import colors
    import pdfrw

    original_path = _get_pdf_path('fish-registration-form.pdf')
    orig = pdfrw.PdfReader(original_path)
    page = orig.pages[0]
    media_box = page.MediaBox
    page_width = float(media_box[2])
    page_height = float(media_box[3])

    overlay_buf = io.BytesIO()
    c = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
    c.setFont('Helvetica', 9)

    # Basic fields
    c.drawString(140, page_height - 130, data.get('registrationNo', ''))
    c.drawString(72, page_height - 230, data.get('lastName', ''))
    c.drawString(220, page_height - 230, data.get('firstName', ''))
    c.drawString(380, page_height - 230, data.get('middleName', ''))

    c.save()

    overlay_buf.seek(0)
    overlay_pdf = pdfrw.PdfReader(overlay_buf)
    writer = pdfrw.PdfWriter()

    for i, orig_page in enumerate(orig.pages):
        if i < len(overlay_pdf.pages):
            merger = pdfrw.PageMerge(orig_page)
            merger.add(overlay_pdf.pages[i]).render()
        writer.addpage(orig_page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output


# ─────────────────────────────────────────────────────────────────────────────
# Boat / Fishing Vessel Registration Form
# ─────────────────────────────────────────────────────────────────────────────
def generate_boat_pdf(data):
    """
    Fill the Boat/Vessel registration fillable PDF.
    Returns a BytesIO buffer.
    """
    original_path = _get_pdf_path('boat-registration-form.pdf')

    try:
        reader = PdfReader(original_path)
        if reader.get_fields():
            fields = _map_boat_fields(data)
            return _fill_pdf_fields(original_path, fields)
    except Exception:
        pass

    return _generate_boat_pdf_overlay(data)


def _map_boat_fields(data):
    """Map boat registration data strictly to the exact AcroForm names."""
    fields = {}
    fields['province'] = data.get('province', 'Pangasinan')
    fields['municipal/city'] = data.get('municipality', 'Alaminos')
    fields['mvfr_no'] = data.get('mfvrNo', '') # Mispelled mvfr vs mfvr in PDF
    fields['date of application'] = data.get('dateApplication', '')
    
    owner = data.get('owner', data)
    fields['name_of_owner'] = (owner.get('name') or 
                              f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or 
                              data.get('ownerName', ''))
    fields['address'] = owner.get('address', data.get('ownerAddress', ''))
    
    fields['homeport'] = data.get('homeport', '')
    fields['name_of_fishing_vessel'] = data.get('vesselName', '')
    fields['vessel_type'] = data.get('vesselType', '')
    fields['place_built'] = data.get('placeBuilt', '')
    fields['year_built'] = data.get('yearBuilt', '')
    fields['registered_length'] = data.get('regLength', '')
    fields['registered_breadth'] = data.get('regBreadth', '')
    fields['registered_depth'] = data.get('regDepth', '')
    fields['gross_tonnage'] = data.get('grossTonnage', '')
    fields['net_tonnage'] = data.get('netTonnage', '')
    
    engine = data.get('engine', data)
    fields['engine_make'] = engine.get('make') or data.get('engineMake', '')
    fields['serial_number'] = engine.get('serialNumber') or data.get('serialNumber', '')
    fields['horsepower'] = engine.get('horsepower') or data.get('horsepower', '')
    return fields


def _generate_boat_pdf_overlay(data):
    """Fallback overlay approach for non-fillable boat registration PDFs."""
    from reportlab.pdfgen import canvas as rl_canvas
    import pdfrw

    original_path = _get_pdf_path('boat-registration-form.pdf')
    orig = pdfrw.PdfReader(original_path)
    page = orig.pages[0]
    media_box = page.MediaBox
    page_width = float(media_box[2])
    page_height = float(media_box[3])

    overlay_buf = io.BytesIO()
    c = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
    c.setFont('Helvetica', 9)

    c.drawString(155, page_height - 108, data.get('province', ''))
    c.drawString(190, page_height - 125, data.get('municipality', ''))
    c.drawString(72, page_height - 265, data.get('ownerName', ''))
    c.drawString(72, page_height - 345, data.get('homeport', ''))
    c.drawString(250, page_height - 345, data.get('vesselName', ''))

    c.save()

    overlay_buf.seek(0)
    overlay_pdf = pdfrw.PdfReader(overlay_buf)
    writer = pdfrw.PdfWriter()

    for i, orig_page in enumerate(orig.pages):
        if i < len(overlay_pdf.pages):
            merger = pdfrw.PageMerge(orig_page)
            merger.add(overlay_pdf.pages[i]).render()
        writer.addpage(orig_page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output


# ─────────────────────────────────────────────────────────────────────────────
# NCFRS Enrollment Form
# ─────────────────────────────────────────────────────────────────────────────
def generate_ncfrs_pdf(data):
    """
    Fill the NCFRS enrollment fillable PDF.
    Returns a BytesIO buffer.
    """
    original_path = _get_pdf_path('ncfrs-form.pdf')

    try:
        reader = PdfReader(original_path)
        if reader.get_fields():
            fields = _map_ncfrs_fields(data)
            return _fill_pdf_fields(original_path, fields)
    except Exception:
        pass

    return _generate_ncfrs_pdf_overlay(data)


def _map_ncfrs_fields(data):
    """Map NCFRS enrollment data to the exact AcroForm names."""
    fields = {}
    pi = data.get('personalInfo', data)
    
    fields['reference_no'] = data.get('referenceNumber', '')
    fields['new_existing'] = data.get('enrollmentType', 'new')
    
    fields['last_name'] = pi.get('lastName') or pi.get('surname') or pi.get('last_name') or data.get('lastName') or ''
    fields['first_name'] = pi.get('firstName') or pi.get('first_name') or data.get('firstName') or ''
    fields['middle_name'] = pi.get('middleName') or pi.get('middle_name') or ''
    fields['suffix'] = pi.get('extensionName') or pi.get('suffix') or pi.get('appellation') or ''
    fields['sex'] = pi.get('sex', data.get('sex', ''))
    
    addr = pi.get('address', data)
    fields['house_lot_bldg_no'] = addr.get('houseNo', data.get('houseNo', ''))
    fields['street_sitio_subd'] = addr.get('street', data.get('street', ''))
    fields['barangay'] = addr.get('barangay', data.get('barangay', ''))
    fields['municipal_city'] = addr.get('municipality', data.get('municipality', ''))
    fields['province'] = addr.get('province', data.get('province', ''))
    fields['region'] = addr.get('region', data.get('region', ''))
    
    fields['date_of_birth'] = pi.get('dateOfBirth', data.get('dateOfBirth', ''))
    fields['place_of_birth'] = pi.get('placeOfBirth', data.get('placeOfBirth', ''))
    fields['civil_status'] = pi.get('civilStatus', data.get('civilStatus', ''))
    
    # Needs to extract list or raw string
    education = pi.get('education', data.get('education', ''))
    if isinstance(education, list) and len(education) > 0: education = education[0]
    fields['highest_educational_attainment'] = education
    
    fields['id_type'] = pi.get('idType', data.get('idType', ''))
    fields['id_no'] = pi.get('idNumber', data.get('idNumber', ''))
    fields['contact_number1'] = pi.get('mobileNumber', data.get('mobileNumber', ''))
    fields['contact_number2'] = pi.get('landlineNumber', data.get('landlineNumber', ''))
    fields['religion'] = pi.get('religion', data.get('religion', ''))
    return fields


def _generate_ncfrs_pdf_overlay(data):
    """Fallback overlay approach for non-fillable NCFRS PDFs."""
    from reportlab.pdfgen import canvas as rl_canvas
    import pdfrw

    original_path = _get_pdf_path('ncfrs-form.pdf')
    orig = pdfrw.PdfReader(original_path)
    page = orig.pages[0]
    media_box = page.MediaBox
    page_width = float(media_box[2])
    page_height = float(media_box[3])

    overlay_buf = io.BytesIO()
    c = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
    c.setFont('Helvetica', 9)

    c.drawString(72, page_height - 185, data.get('lastName', ''))
    c.drawString(235, page_height - 185, data.get('firstName', ''))
    c.drawString(380, page_height - 185, data.get('middleName', ''))

    c.save()

    overlay_buf.seek(0)
    overlay_pdf = pdfrw.PdfReader(overlay_buf)
    writer = pdfrw.PdfWriter()

    for i, orig_page in enumerate(orig.pages):
        if i < len(overlay_pdf.pages):
            merger = pdfrw.PageMerge(orig_page)
            merger.add(overlay_pdf.pages[i]).render()
        writer.addpage(orig_page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output

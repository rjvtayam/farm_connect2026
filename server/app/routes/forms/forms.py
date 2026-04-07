"""
Farm Connect - Forms Routes
Serves the registration form pages and handles PDF download / DB submission.
"""

import io
import os
import json
import base64
import uuid
from datetime import datetime, date
from flask import Blueprint, render_template, request, jsonify, send_file, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.extensions import csrf, db
from app.models.registration import Beneficiary, Registration
from app.models.notification import Notification
from app.models.user import User
from app.routes.forms.pdf_generator import (
    generate_rsba_pdf,
    generate_fish_pdf,
    generate_boat_pdf,
    generate_ncfrs_pdf,
)
from app.socket_handlers import broadcast_new_submission, broadcast_new_notification

forms_bp = Blueprint('forms', __name__)



# ── Helper ────────────────────────────────────────────────────────────────────

def _safe_date(val):
    """Convert a string like '2000-01-15' to a date, or return None."""
    if not val:
        return None
    try:
        return datetime.strptime(val, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def _strip_base64(obj):
    """
    Recursively remove large base64 data:image strings from a dict/list
    so the JSON stored in the DB isn't enormous.
    Returns a shallow-copied structure with base64 values replaced by a
    short placeholder.
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if isinstance(v, str) and v.startswith('data:image'):
                cleaned[k] = '[photo_saved_to_file]'
            else:
                cleaned[k] = _strip_base64(v)
        return cleaned
    elif isinstance(obj, list):
        return [_strip_base64(item) for item in obj]
    return obj


def _save_base64_image(base64_string, subfolder):
    """Save a base64 image string to a file and return the relative path."""
    if not base64_string or not base64_string.startswith('data:image'):
        return None

    try:
        # Split header from data
        header, encoded = base64_string.split(",", 1)
        ext = header.split(';')[0].split('/')[-1] # e.g. 'png' or 'jpeg'
        
        # Create filename
        filename = f"{uuid.uuid4()}.{ext}"
        upload_dir = os.path.join(current_app.root_path, '..', 'client', 'src', 'uploads', subfolder)
        os.makedirs(upload_dir, exist_ok=True)
        
        filepath = os.path.join(upload_dir, filename)
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(encoded))
            
        return f'uploads/{subfolder}/{filename}'
    except Exception as e:
        print(f"Error saving base64 image: {e}")
        return None


def _notify_roles(roles, municipality, message, notif_type, ref_id):
    """
    Create a notification for every user with one of the given roles
    in the specified municipality. Case-insensitive.
    """
    try:
        # Normalize municipality for matching
        muni_search = str(municipality).strip() if municipality else ""
        muni_search_lower = muni_search.lower()

        # Find relevant users in the target municipality
        # Robust matching: If muni is "Mabitac", also include users in "Laguna" for testing/fallback
        
        query = User.query.filter(User.role.in_(roles), User.is_active == True)
        
        if muni_search_lower == 'mabitac' or muni_search_lower == 'laguna':
            query = query.filter(db.or_(
                User.municipality.ilike('%mabitac%'),
                User.municipality.ilike('%laguna%')
            ))
        else:
            query = query.filter(User.municipality.ilike(f'%{muni_search_lower}%'))
            
        users = query.all()
        
        for u in users:
            # Check if notification already exists for this user/ref to prevent duplicates
            existing = Notification.query.filter_by(
                user_id=u.id, 
                reference_id=ref_id, 
                type=notif_type
            ).first()
            
            if not existing:
                db.session.add(Notification(
                    user_id=u.id,
                    message=message,
                    type=notif_type,
                    reference_id=ref_id,
                ))
        db.session.commit()
        
        # Real-time socket trigger for each recipient
        for u in users:
            broadcast_new_notification(u.id)
    except Exception as e:
        print(f"Notification Error: {e}")
        db.session.rollback()


def _clean_name(val):
    """Clean name input: strip whitespace and convert 'None' or empty to None."""
    if not val:
        return None
    s = str(val).strip()
    if s.lower() == 'none' or not s:
        return None
    return s


def _upsert_beneficiary(first_name, last_name, dob, extra_fields: dict) -> Beneficiary:
    """
    Find an existing beneficiary by name + DOB, or create a new one.
    `extra_fields` contains any additional columns to set on the model.
    """
    first_name = _clean_name(first_name)
    last_name = _clean_name(last_name)
    
    bene = Beneficiary.query.filter_by(
        first_name=first_name,
        last_name=last_name,
        date_of_birth=dob,
    ).first()

    if bene is None:
        bene = Beneficiary(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=dob,
        )
        db.session.add(bene)

    # Apply / update extra fields
    for col, val in extra_fields.items():
        if hasattr(bene, col):
            # Clean name-related fields
            if col in ['middle_name', 'extension_name']:
                val = _clean_name(val)
            setattr(bene, col, val)

    db.session.flush()   # gives bene.id without committing yet
    return bene


# ── Page rendering routes ────────────────────────────────────────────────────

@forms_bp.route('/rsba-enrollment')
def rsba_enrollment():
    return render_template('forms/rsba-enrollment-form.html')


@forms_bp.route('/fish-registration')
def fish_registration():
    return render_template('forms/fish-registration-form.html')


@forms_bp.route('/boat-registration')
def boat_registration():
    return render_template('forms/boat-registration-form.html')


@forms_bp.route('/ncfrs')
def ncfrs():
    return render_template('forms/ncfrs-form.html')


# ── PDF Download routes ──────────────────────────────────────────────────────

@forms_bp.route('/download/rsba-enrollment', methods=['POST'])
@csrf.exempt
def download_rsba():
    """Receive form JSON data and return a pre-filled RSBSA PDF."""
    data = request.get_json(force=True) or {}
    try:
        pdf_buffer = generate_rsba_pdf(data)
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='RSBSA_Enrollment_Form.pdf'
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@forms_bp.route('/download/fish-registration', methods=['POST'])
@csrf.exempt
def download_fish():
    """Receive form JSON data and return a pre-filled Fish Registration PDF."""
    data = request.get_json(force=True) or {}
    try:
        pdf_buffer = generate_fish_pdf(data)
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='Fisherfolk_Registration_Form.pdf'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@forms_bp.route('/download/boat-registration', methods=['POST'])
@csrf.exempt
def download_boat():
    """Receive form JSON data and return a pre-filled Boat Registration PDF."""
    data = request.get_json(force=True) or {}
    try:
        pdf_buffer = generate_boat_pdf(data)
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='Boat_Registration_Form.pdf'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@forms_bp.route('/download/ncfrs', methods=['POST'])
@csrf.exempt
def download_ncfrs():
    """Receive form JSON data and return a pre-filled NCFRS PDF."""
    data = request.get_json(force=True) or {}
    try:
        pdf_buffer = generate_ncfrs_pdf(data)
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='NCFRS_Enrollment_Form.pdf'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Form Submission routes (save to DB) ──────────────────────────────────────

@forms_bp.route('/submit/rsbsa', methods=['POST'])
@csrf.exempt
@login_required
def submit_rsbsa():
    """Save RSBSA enrollment to the database."""
    d = request.get_json(force=True) or {}
    pi = d.get('personalInfo', {})
    addr = pi.get('address', {})

    # Validate minimum required fields
    first_name = (pi.get('firstName') or pi.get('first_name') or '').strip()
    last_name  = (pi.get('surname') or pi.get('lastName') or pi.get('last_name') or '').strip()
    
    if not first_name or not last_name:
        return jsonify({'success': False, 'message': 'First name and last name are required.'}), 400

    try:
        dob = _safe_date(pi.get('dateOfBirth'))
        bene = _upsert_beneficiary(first_name, last_name, dob, {
            'middle_name':    pi.get('middleName') or pi.get('middle_name'),
            'extension_name': pi.get('extensionName') or pi.get('extension_name') or pi.get('suffix') or pi.get('appellation'),
            'sex':            pi.get('sex'),
            'date_of_birth':  dob,
            'place_of_birth': pi.get('placeOfBirth'),
            'civil_status':   pi.get('civilStatus'),
            'spouse_name':    pi.get('spouseName'),
            'address_street': f"{addr.get('houseNo', '')} {addr.get('street', '')}".strip(),
            'barangay':       addr.get('barangay'),
            'municipality':   addr.get('municipality'),
            'province':       addr.get('province'),
            'region':         addr.get('region'),
            'mobile_number':  pi.get('mobileNumber'),
            'landline':       pi.get('landlineNumber'),
            'religion':       pi.get('religion'),
            'is_pwd':         pi.get('pwd') == 'Yes',
            'is_4ps':         pi.get('fourPs') == 'Yes',
            'is_ip':          pi.get('indigenous') == 'Yes',
            'ip_group':       pi.get('indigenousSpecify'),
            'govt_id_type':   pi.get('idType'),
            'govt_id_no':     pi.get('idNumber'),
            'emergency_contact_name': pi.get('emergencyPerson'),
            'emergency_contact_no':   pi.get('emergencyContact'),
            'educational_attainment': ", ".join(pi.get('education', [])) if isinstance(pi.get('education'), list) else str(pi.get('education') or ''),
            'photo_path':             _save_base64_image(pi.get('photo'), 'beneficiaries')
        })

        reg = Registration(
            beneficiary_id=bene.id,
            form_type='rsbsa',
            status='pending',
            encoded_by=current_user.id,
            data_json=json.dumps(_strip_base64(d)),
        )
        db.session.add(reg)
        db.session.commit()

        # Notify verifiers & MAO in the same municipality
        muni = current_user.municipality # Always notify the Encoder's local reviewers
        _notify_roles(
            ['verifier', 'mao'], muni,
            f'New RSBSA enrollment submitted for {first_name} {last_name}',
            'new_submission', reg.id
        )

        # Real-time Map & Toast Notification broadcast
        broadcast_new_submission({
            'form_type': 'rsbsa',
            'municipality': muni,
            'barangay': addr.get('barangay'),
            'first_name': first_name,
            'last_name': last_name
        })

        return jsonify({'success': True, 'registration_id': reg.id})

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


@forms_bp.route('/upload/gpx', methods=['POST'])
@csrf.exempt
@login_required
def upload_gpx():
    """Upload a GPX track file and optionally link to a registration."""
    if 'gpx_file' not in request.files:
        return jsonify({'success': False, 'message': 'No GPX file provided.'}), 400

    gpx_file   = request.files['gpx_file']
    reg_id_raw = request.form.get('registration_id')

    if not gpx_file.filename:
        return jsonify({'success': False, 'message': 'Empty file.'}), 400
    if not gpx_file.filename.lower().endswith('.gpx'):
        return jsonify({'success': False, 'message': 'Only .gpx files are accepted.'}), 400

    filename   = secure_filename(gpx_file.filename)
    upload_dir = os.path.join(current_app.root_path, '..', 'client', 'src', 'uploads', 'gpx')
    os.makedirs(upload_dir, exist_ok=True)
    gpx_file.save(os.path.join(upload_dir, filename))
    rel_path = f'uploads/gpx/{filename}'

    # Optionally store path in the registration's gis data block
    if reg_id_raw:
        try:
            reg = Registration.query.get(int(reg_id_raw))
            if reg:
                data = reg.data or {}
                data.setdefault('gis', {})['gpx_file_path'] = rel_path
                reg.data_json = json.dumps(data)
                db.session.commit()
        except Exception:
            pass  # File saved; linking is best-effort

    return jsonify({'success': True, 'file': filename, 'path': rel_path})


@forms_bp.route('/submit/fish', methods=['POST'])
@csrf.exempt
@login_required
def submit_fish():
    """Save Fisherfolk Registration to the database."""
    d = request.get_json(force=True) or {}
    pi = d.get('personalInfo', {})
    addr = pi.get('address', {})

    first_name = (pi.get('firstName') or pi.get('first_name') or '').strip()
    last_name  = (pi.get('surname') or pi.get('lastName') or pi.get('last_name') or '').strip()
    if not first_name or not last_name:
        return jsonify({'success': False, 'message': 'First name and last name are required.'}), 400

    try:
        dob = _safe_date(pi.get('dateOfBirth'))
        bene = _upsert_beneficiary(first_name, last_name, dob, {
            'middle_name':    pi.get('middleName') or pi.get('middle_name'),
            'extension_name': pi.get('appellation') or pi.get('extensionName') or pi.get('suffix'),
            'sex':            pi.get('gender'),
            'date_of_birth':  dob,
            'place_of_birth': pi.get('placeOfBirth'),
            'civil_status':   pi.get('civilStatus'),
            'address_street': addr.get('street'),
            'barangay':       addr.get('street'),   # Fish form: 'street' IS the barangay dropdown
            'municipality':   addr.get('city'),
            'province':       addr.get('province'),
            'mobile_number':  pi.get('contactNo'),
            'emergency_contact_name': d.get('emergencyContact', {}).get('person'),
            'emergency_contact_no':   d.get('emergencyContact', {}).get('contact'),
        })

        reg = Registration(
            beneficiary_id=bene.id,
            form_type='fish',
            status='pending',
            encoded_by=current_user.id,
            data_json=json.dumps(_strip_base64(d)),
        )
        db.session.add(reg)
        db.session.commit()

        # Notify verifiers & MAO
        muni = current_user.municipality # Always notify the Encoder's local reviewers
        brgy = addr.get('barangay') or addr.get('city') or 'Unknown'

        _notify_roles(
            ['verifier', 'mao'], muni,
            f'New Fish Registration submitted for {first_name} {last_name}',
            'new_submission', reg.id
        )

        # Real-time Map & Toast Notification broadcast
        broadcast_new_submission({
            'form_type': 'fish',
            'municipality': muni,
            'barangay': brgy,
            'first_name': first_name,
            'last_name': last_name
        })

        return jsonify({'success': True, 'registration_id': reg.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@forms_bp.route('/submit/boat', methods=['POST'])
@csrf.exempt
@login_required
def submit_boat():
    """Save Boat Registration to the database."""
    d = request.get_json(force=True) or {}
    owner = d.get('owner', {})

    owner_name = owner.get('name', '').strip()
    if not owner_name:
        return jsonify({'success': False, 'message': 'Owner name is required.'}), 400

    # Split owner name into first/last (best effort)
    parts = owner_name.split()
    first_name = parts[0] if parts else ''
    last_name  = parts[-1] if len(parts) > 1 else parts[0] if parts else ''

    try:
        bene = _upsert_beneficiary(first_name, last_name, None, {
            'address_street': owner.get('address'),
            'municipality':   d.get('municipality'),
            'province':       d.get('province'),
        })

        reg = Registration(
            beneficiary_id=bene.id,
            form_type='boat',
            status='pending',
            encoded_by=current_user.id,
            data_json=json.dumps(_strip_base64(d)),
        )
        db.session.add(reg)
        db.session.commit()

        # Notify verifiers & MAO
        muni = current_user.municipality # Always notify the Encoder's local reviewers
        brgy = d.get('barangay') or 'Unknown'

        _notify_roles(
            ['verifier', 'mao'], muni,
            f'New Boat Registration submitted for {first_name} {last_name}',
            'new_submission', reg.id
        )

        # Real-time Map & Toast Notification broadcast
        broadcast_new_submission({
            'form_type': 'boat',
            'municipality': muni,
            'barangay': brgy,
            'first_name': first_name,
            'last_name': last_name
        })

        return jsonify({'success': True, 'registration_id': reg.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@forms_bp.route('/submit/ncfrs', methods=['POST'])
@csrf.exempt
@login_required
def submit_ncfrs():
    """Save NCFRS enrollment to the database."""
    d = request.get_json(force=True) or {}
    pi = d.get('personalInfo', {})
    addr = pi.get('address', {})

    first_name = (pi.get('firstName') or pi.get('first_name') or '').strip()
    last_name  = (pi.get('surname') or pi.get('lastName') or pi.get('last_name') or '').strip()
    if not first_name or not last_name:
        return jsonify({'success': False, 'message': 'First name and last name are required.'}), 400

    try:
        dob = _safe_date(pi.get('dateOfBirth'))
        bene = _upsert_beneficiary(first_name, last_name, dob, {
            'middle_name':    pi.get('middleName') or pi.get('middle_name'),
            'extension_name': pi.get('suffix') or pi.get('extensionName') or pi.get('appellation'),
            'sex':            pi.get('sex'),
            'date_of_birth':  dob,
            'civil_status':   pi.get('civilStatus'),
            'address_street': f"{addr.get('houseNo', '')} {addr.get('street', '')}".strip(),
            'barangay':       addr.get('barangay'),
            'municipality':   addr.get('municipality'),
            'province':       addr.get('province'),
            'region':         addr.get('region'),
        })

        reg = Registration(
            beneficiary_id=bene.id,
            form_type='ncfrs',
            status='pending',
            encoded_by=current_user.id,
            data_json=json.dumps(_strip_base64(d)),
        )
        db.session.add(reg)
        db.session.commit()

        # Notify verifiers & MAO
        muni = current_user.municipality # Always notify the Encoder's local reviewers
        _notify_roles(
            ['verifier', 'mao'], muni,
            f'New NCFRS enrollment submitted for {first_name} {last_name}',
            'new_submission', reg.id
        )

        # Real-time Map & Toast Notification broadcast
        broadcast_new_submission({
            'form_type': 'ncfrs',
            'municipality': muni,
            'barangay': addr.get('barangay'),
            'first_name': first_name,
            'last_name': last_name
        })

        return jsonify({'success': True, 'registration_id': reg.id})

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

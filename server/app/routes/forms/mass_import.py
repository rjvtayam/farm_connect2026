import os
import json
import pandas as pd
from datetime import datetime
from flask import request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db, csrf
from app.models.registration import Registration
from app.routes.forms.forms import forms_bp, _upsert_beneficiary, _notify_roles, _safe_date
from app.socket_handlers import broadcast_new_submission

ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}

def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@forms_bp.route('/import/mass', methods=['POST'])
@csrf.exempt
@login_required
def mass_import():
    """
    Handle mass import of registrations via CSV or Excel file.
    Expects standard column headers (e.g., 'First Name', 'Last Name', 'Date of Birth').
    """
    if 'import_file' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded.'}), 400
        
    file = request.files['import_file']
    form_type = request.form.get('form_type', '').strip().lower()
    
    if file.filename == '' or not _allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'Invalid file format. Please upload a .csv or .xlsx file.'}), 400
        
    if form_type not in ['rsbsa', 'fish', 'boat', 'ncfrs']:
        return jsonify({'success': False, 'message': 'Invalid form type specified.'}), 400

    filename = secure_filename(file.filename)
    upload_folder = os.path.join(current_app.root_path, '..', 'client', 'src', 'uploads', 'mass_imports')
    os.makedirs(upload_folder, exist_ok=True)
    file_path = os.path.join(upload_folder, filename)
    file.save(file_path)
    
    try:
        if filename.endswith('.csv'):
            try:
                df = pd.read_csv(file_path, encoding='utf-8')
            except Exception:
                df = pd.read_csv(file_path, encoding='latin1')
        else:
            df = pd.read_excel(file_path)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error reading file: {str(e)}'}), 400

    success_count = 0
    errors = []
    
    # Standardize column headers to lowercase and remove spaces for easier matching
    original_cols = df.columns.tolist()
    # Replace spaces and common special characters to make mapping robust
    df.columns = df.columns.str.lower().str.replace(' ', '_').str.replace('/', '_').str.replace('.', '').str.strip()
    
    muni = current_user.municipality

    for index, row in df.iterrows():
        try:
            # Map columns flexibly based on variations from the client's RSBSA CSV
            first_name = row.get('first_name', row.get('firstname', ''))
            last_name = row.get('surname', row.get('last_name', row.get('lastname', '')))
            
            if pd.isna(first_name) or pd.isna(last_name) or str(first_name).strip() == '' or str(last_name).strip() == '':
                errors.append(f"Row {index+2}: Missing first name or surname")
                continue
                
            first_name = str(first_name).strip()
            last_name = str(last_name).strip()
            
            # Map other core beneficiary fields
            dob_raw = row.get('birth_date', row.get('date_of_birth', row.get('dob', '')))
            dob = _safe_date(str(dob_raw).strip() if pd.notna(dob_raw) else None)
            
            middle_name = row.get('middle_name', '')
            ext_name = row.get('extension_name', row.get('suffix', ''))
            sex = row.get('sex', row.get('gender', ''))
            civil_status = row.get('civil_status', '')
            barangay = row.get('barangay', '')
            municipality = row.get('municipality_city', row.get('municipality', muni))
            province = row.get('province', 'Laguna')
            mobile = row.get('mobile_number', row.get('contact', ''))

            # Clean NA values, enforce exactly database column maximum lengths, and prevent Not-Null postgres constraints
            middle_name = str(middle_name).strip()[:100] if pd.notna(middle_name) else ""
            ext_name = str(ext_name).strip()[:20] if pd.notna(ext_name) else ""
            sex = str(sex).strip()[:20] if pd.notna(sex) else "Not Specified"
            civil_status = str(civil_status).strip()[:50] if pd.notna(civil_status) else ""
            barangay = str(barangay).strip()[:100] if pd.notna(barangay) else ""
            municipality = str(municipality).strip()[:100] if pd.notna(municipality) else ""
            province = str(province).strip()[:100] if pd.notna(province) else ""
            
            if pd.notna(mobile):
                mob_str = str(mobile).strip()
                if mob_str.endswith(".0"):
                    mob_str = mob_str[:-2]
                mobile = mob_str[:20]
            else:
                mobile = ""
            
            first_name = first_name[:100]
            last_name = last_name[:100]

            bene = _upsert_beneficiary(first_name, last_name, dob, {
                'middle_name': middle_name,
                'extension_name': ext_name,
                'sex': sex,
                'civil_status': civil_status,
                'barangay': barangay,
                'municipality': municipality,
                'province': province,
                'mobile_number': mobile
            })
            
            # Keep all original columns in the JSON data
            row_dict = {}
            for col in original_cols:
                mapped_col = col.lower().replace(' ', '_').replace('/', '_').replace('.', '').strip()
                val = row.get(mapped_col)
                row_dict[col] = val if pd.notna(val) else None
            
            # For data consistency, recreate the structure expected by the viewer based on form_type
            data_payload = {
                'source': 'mass_import',
                'imported_file': filename,
                'personalInfo': {
                    'firstName': first_name,
                    'lastName': last_name,
                    'middleName': middle_name,
                    'dateOfBirth': str(dob) if dob else None,
                    'address': {
                        'barangay': barangay,
                        'municipality': municipality,
                        'province': province
                    }
                },
                'raw_data': row_dict
            }
            
            # Add to owner specifically for boat
            if form_type == 'boat':
                data_payload['owner'] = {
                    'name': f"{first_name} {last_name}",
                    'address': barangay
                }

            reg = Registration(
                beneficiary_id=bene.id,
                form_type=form_type,
                status='pending',
                encoded_by=current_user.id,
                data_json=json.dumps(data_payload)
            )
            
            db.session.add(reg)
            db.session.commit()
            
            success_count += 1
            
            # Only broadcast socket/notifications individually if it's a small file to prevent spam
            if len(df) <= 50:
                _notify_roles(
                    ['verifier', 'mao'], muni,
                    f'Mass import: {first_name} {last_name} ({form_type.upper()})',
                    'new_submission', reg.id
                )
                
                broadcast_new_submission({
                    'form_type': form_type,
                    'municipality': muni,
                    'barangay': barangay,
                    'first_name': first_name,
                    'last_name': last_name
                })
                
        except Exception as e:
            db.session.rollback()
            errors.append(f"Row {index+2} ({first_name} {last_name}): {str(e)}")
            
    # For large files, send a single bulk notification
    if success_count > 0 and len(df) > 50:
        _notify_roles(
            ['verifier', 'mao'], muni,
            f'Mass import completed: {success_count} {form_type.upper()} registrations added.',
            'batch_submission', 0
        )
            
    # Cleanup temp file
    if os.path.exists(file_path):
        os.remove(file_path)
        
    print(f"DEBUG MASS IMPORT: {len(errors)} errors found.")
    if errors:
        for err in errors[:20]:
            print(" ->", err)
        
    summary = {
        'success': True,
        'message': f'Successfully imported {success_count} registrations.',
        'success_count': success_count,
        'error_count': len(errors),
        'errors': errors[:10] # Return only first 10 errors to prevent huge payload
    }
    
    return jsonify(summary)

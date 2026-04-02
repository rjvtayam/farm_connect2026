from flask import Blueprint, jsonify, request
from app.models.registration import Beneficiary, Registration
from sqlalchemy import or_

scanner_bp = Blueprint('scanner', __name__)

@scanner_bp.route('/beneficiary/<uid>', methods=['GET'])
def get_beneficiary_details(uid):
    """
    Fetch a beneficiary using either their internal ID or RSBSA ID.
    Returns personal information, address, and related registrations (parcels, interventions, etc.)
    """
    try:
        # Check if the UID is purely numeric, if so, it might be the internal ID.
        # But we also search by rsbsa_id just in case.
        filters = [Beneficiary.rsbsa_id == uid]
        if uid.isdigit():
            filters.append(Beneficiary.id == int(uid))

        beneficiary = Beneficiary.query.filter(or_(*filters)).first()

        if not beneficiary:
            return jsonify({'success': False, 'message': 'Beneficiary not found.'}), 404

        # Fetch registrations
        registrations = Registration.query.filter_by(
            beneficiary_id=beneficiary.id, 
            is_deleted=False
        ).order_by(Registration.submission_date.desc()).all()

        registration_data = []
        for reg in registrations:
            reg_dict = reg.to_dict()
            # Omit locking info to keep public payload clean
            reg_dict.pop('lock', None)
            registration_data.append(reg_dict)

        data = {
            'success': True,
            'beneficiary': beneficiary.to_dict(),
            'registrations': registration_data
        }

        return jsonify(data), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'An error occurred while fetching data.'}), 500

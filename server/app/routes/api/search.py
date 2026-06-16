"""
Farm Connect - Global Search API
Provides unified search across beneficiaries, registrations, and users.
"""

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.extensions import db, cache
from app.models.registration import Beneficiary, Registration
from app.models.user import User

search_bp = Blueprint('search', __name__)


@search_bp.route('/api/search', methods=['GET'])
@login_required
def global_search():
    """
    Global search across beneficiaries, registrations, and users.
    Supports query parameter 'q' with minimum 2 characters.
    Results are scoped to the user's municipality (except admins).
    """
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify({'success': False, 'message': 'Query must be at least 2 characters.'}), 400

    muni = getattr(current_user, 'municipality', None)
    is_admin = getattr(current_user, 'role', '') == 'admin'

    results = {
        'success': True,
        'beneficiaries': [],
        'registrations': [],
        'users': [],
        'total': 0
    }

    # ── Search Beneficiaries (name, RSBSA ID, mobile) ──
    ben_query = Beneficiary.query
    if not is_admin and muni:
        ben_query = ben_query.filter(
            db.or_(
                Beneficiary.municipality.ilike(f'%{muni}%'),
                Beneficiary.municipality.ilike('%Laguna%') if muni.lower() == 'mabitac' else False
            )
        )

    beneficiaries = ben_query.filter(
        db.or_(
            Beneficiary.first_name.ilike(f'%{q}%'),
            Beneficiary.last_name.ilike(f'%{q}%'),
            Beneficiary.rsbsa_id.ilike(f'%{q}%'),
            Beneficiary.mobile_number.ilike(f'%{q}%'),
            Beneficiary.barangay.ilike(f'%{q}%')
        )
    ).limit(10).all()

    results['beneficiaries'] = [{
        'id': b.id,
        'full_name': ' '.join(filter(None, [b.first_name, b.middle_name, b.last_name])),
        'rsbsa_id': b.rsbsa_id,
        'barangay': b.barangay,
        'municipality': b.municipality,
        'mobile_number': b.mobile_number,
    } for b in beneficiaries]

    # ── Search Registrations (by beneficiary name or RSBSA ID) ──
    reg_query = Registration.query.join(Beneficiary)
    if not is_admin and muni:
        reg_query = reg_query.filter(
            db.or_(
                Beneficiary.municipality.ilike(f'%{muni}%'),
                Beneficiary.municipality.ilike('%Laguna%') if muni.lower() == 'mabitac' else False
            )
        )

    registrations = reg_query.filter(
        db.or_(
            Beneficiary.first_name.ilike(f'%{q}%'),
            Beneficiary.last_name.ilike(f'%{q}%'),
            Beneficiary.rsbsa_id.ilike(f'%{q}%')
        ),
        Registration.is_deleted == False
    ).order_by(Registration.created_at.desc()).limit(10).all()

    results['registrations'] = [{
        'id': r.id,
        'beneficiary_name': ' '.join(filter(None, [
            r.beneficiary.first_name, r.beneficiary.last_name
        ])) if r.beneficiary else 'Unknown',
        'rsbsa_id': r.beneficiary.rsbsa_id if r.beneficiary else None,
        'form_type': r.form_type,
        'status': r.status,
        'barangay': r.beneficiary.barangay if r.beneficiary else None,
        'submission_date': r.submission_date.isoformat() if r.submission_date else None,
    } for r in registrations]

    # ── Search Users (admin/encoder/verifier/MAO) ──
    if is_admin:
        user_query = User.query.filter(User.is_active == True)
    elif muni:
        user_query = User.query.filter(
            User.municipality.ilike(f'%{muni}%'),
            User.is_active == True
        )
    else:
        user_query = User.query.filter(False)  # Empty query

    users = user_query.filter(
        db.or_(
            User.full_name.ilike(f'%{q}%'),
            User.username.ilike(f'%{q}%'),
            User.email.ilike(f'%{q}%')
        )
    ).limit(10).all()

    results['users'] = [{
        'id': u.id,
        'full_name': u.full_name,
        'username': u.username,
        'role': u.role,
        'municipality': u.municipality,
    } for u in users]

    results['total'] = len(results['beneficiaries']) + len(results['registrations']) + len(results['users'])

    return jsonify(results)

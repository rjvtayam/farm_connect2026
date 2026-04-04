"""
Farm Connect - Encoder Panel Routes
"""

from flask import Blueprint, render_template
from flask_login import login_required
from app.routes.auth import encoder_required

encoder_bp = Blueprint('encoder', __name__)

@encoder_bp.route('/dashboard')
@encoder_required
def dashboard():
    """Encoder dashboard"""
    return render_template('roles/encoder-panel.html')

# API Routes
from app.models.registration import Registration, Beneficiary
from app.models.notification import Notification
from app.extensions import db, cache
from datetime import datetime
from flask import jsonify, request, current_app
from flask_login import current_user

@encoder_bp.route('/api/stats', methods=['GET'])
@encoder_required
def get_stats():
    """Get Encoder dashboard stats"""
    from datetime import datetime, timedelta
    
    user_id = current_user.id
    
    # ── Production Cache ──
    cache_key = f'encoder_stats_{user_id}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    # Current counts (exclude soft-deleted)
    base = Registration.query.filter(Registration.encoded_by == user_id, Registration.is_deleted == False)
    total_submitted = base.count()
    approved = base.filter(Registration.status == 'approved').count()
    verified = base.filter(Registration.status == 'verified').count()
    pending = base.filter(
        db.or_(Registration.status == 'pending', Registration.status == None)
    ).count()
    rejected = base.filter(Registration.status == 'rejected').count()
    
    # Old counts (prior to 30 days ago, exclude soft-deleted)
    old_base = base.filter(Registration.created_at <= thirty_days_ago)
    old_total = old_base.count()
    old_approved = old_base.filter(Registration.status == 'approved').count()
    old_verified = old_base.filter(Registration.status == 'verified').count()
    old_pending = old_base.filter(
        db.or_(Registration.status == 'pending', Registration.status == None)
    ).count()
    old_rejected = old_base.filter(Registration.status == 'rejected').count()

    def calc_trend(current, old):
        if old == 0: return 100 if current > 0 else 0
        return round(((current - old) / old) * 100)

    result = {
        'success': True,
        'stats': {
            'total': total_submitted,
            'approved': approved,
            'verified': verified,
            'pending': pending,
            'rejected': rejected
        },
        'trends': {
            'total': calc_trend(total_submitted, old_total),
            'approved': calc_trend(approved, old_approved),
            'verified': calc_trend(verified, old_verified),
            'pending': calc_trend(pending, old_pending),
            'rejected': calc_trend(rejected, old_rejected)
        }
    }
    cache.set(cache_key, result, timeout=300)
    return jsonify(result)

@encoder_bp.route('/api/submissions', methods=['GET'])
@encoder_required
def get_my_submissions():
    """Get current encoder's submissions (exclude soft-deleted)"""
    submissions = Registration.query.filter(
        Registration.encoded_by == current_user.id,
        Registration.is_deleted == False
    ).order_by(Registration.submission_date.desc()).all()
        
    return jsonify({
        'success': True,
        'submissions': [s.to_dict() for s in submissions]
    })

@encoder_bp.route('/api/submissions/<int:rid>', methods=['GET'])
@encoder_required
def get_submission(rid):
    """Get a single submission's full data"""
    registration = Registration.query.filter_by(id=rid, encoded_by=current_user.id).first()
    if not registration:
        return jsonify({'success': False, 'message': 'Submission not found'}), 404
        
    beneficiary = Beneficiary.query.get(registration.beneficiary_id)
    
    return jsonify({
        'success': True,
        'submission': {
            'id': registration.id,
            'form_type': registration.form_type,
            'status': registration.status,
            'data_json': registration.data,
            'beneficiary': beneficiary.to_dict() if beneficiary else None
        }
    })

@encoder_bp.route('/api/submissions/<int:rid>', methods=['PUT', 'POST'])
@encoder_required
def update_registration(rid):
    """Update an existing registration (especially if rejected)"""
    # Using POST as fallback for PUT if needed by some clients
    registration = Registration.query.filter_by(id=rid, encoded_by=current_user.id).first()
    if not registration:
        return jsonify({'success': False, 'message': 'Submission not found'}), 404
        
    data = request.get_json()
    try:
        # 1. Update Beneficiary — only overwrite fields that are actually provided
        ben = Beneficiary.query.get(registration.beneficiary_id)
        if ben:
            if 'firstName' in data:       ben.first_name = data['firstName']
            if 'surname' in data:         ben.last_name = data['surname']
            if 'middleName' in data:      ben.middle_name = data['middleName']
            if 'extensionName' in data:   ben.extension_name = data['extensionName']
            if 'sex' in data:             ben.sex = data['sex']
            if data.get('dateOfBirth'):
                ben.date_of_birth = datetime.strptime(data['dateOfBirth'], '%Y-%m-%d').date()
            if 'civilStatus' in data:     ben.civil_status = data['civilStatus']
            if 'spouseName' in data:      ben.spouse_name = data['spouseName']
            if 'houseNo' in data or 'street' in data:
                ben.address_street = f"{data.get('houseNo', '')} {data.get('street', '')}".strip()
            if 'barangay' in data:        ben.barangay = data['barangay']
            if 'province' in data:        ben.province = data['province']
            if 'region' in data:          ben.region = data['region']
            if 'mobileNumber' in data:    ben.mobile_number = data['mobileNumber']
            if 'landlineNumber' in data:  ben.landline = data['landlineNumber']
            if 'pwd' in data:             ben.is_pwd = data['pwd'] == 'Yes'
            if 'fourPs' in data:          ben.is_4ps = data['fourPs'] == 'Yes'
            if 'indigenous' in data:      ben.is_ip = data['indigenous'] == 'Yes'
            if 'indigenousSpecify' in data: ben.ip_group = data['indigenousSpecify']
            if 'religion' in data:        ben.religion = data['religion']
            if 'emergencyPerson' in data: ben.emergency_contact_name = data['emergencyPerson']
            if 'emergencyContact' in data: ben.emergency_contact_no = data['emergencyContact']

        # 2. Update Registration
        registration.data = data
        if registration.status == 'rejected':
            registration.status = 'pending' # Re-submit
            
        db.session.commit()
        cache.delete(f'encoder_stats_{current_user.id}')
        cache.delete(f'encoder_activity_{current_user.id}')
        return jsonify({'success': True, 'message': 'Registration updated successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@encoder_bp.route('/api/submit-registration', methods=['POST'])
@encoder_required
def submit_registration():
    """Submit a new registration (RSBA, Fish, etc.)"""
    data = request.get_json()
    
    try:
        # Create Beneficiary first (or find existing?)
        # For simplicity, we assume new beneficiary creation or update logic here
        # In a real app, we'd check if beneficiary exists by RSBSA ID or Name
        
        # 1. Create/Update Beneficiary
        # Check if beneficiary data is nested or flat. 
        # The form likely sends a mix. We need to extract beneficiary fields.
        
        # Simplified for now: Create new Beneficiary every time or check duplicates
        # Ideally, we should check `rsbsa_id` if provided.
        
        beneficiary = Beneficiary(
            first_name=data.get('firstName'),
            last_name=data.get('surname'),
            middle_name=data.get('middleName'),
            extension_name=data.get('extensionName'),
            sex=data.get('sex'),
            date_of_birth=datetime.strptime(data.get('dateOfBirth'), '%Y-%m-%d').date() if data.get('dateOfBirth') else None,
            civil_status=data.get('civilStatus'),
            spouse_name=data.get('spouseName'),
            address_street=f"{data.get('houseNo', '')} {data.get('street', '')}".strip(),
            barangay=data.get('barangay'),
            municipality=data.get('municipality', current_user.municipality), # Allow cross-town registration if provided
            province=data.get('province'),
            region=data.get('region'),
            mobile_number=data.get('mobileNumber'),
            landline=data.get('landlineNumber'),
            is_pwd=data.get('pwd') == 'Yes',
            is_4ps=data.get('fourPs') == 'Yes',
            is_ip=data.get('indigenous') == 'Yes',
            ip_group=data.get('indigenousSpecify'),
            religion=data.get('religion'),
            emergency_contact_name=data.get('emergencyPerson'),
            emergency_contact_no=data.get('emergencyContact')
        )
        db.session.add(beneficiary)
        db.session.flush() # Get ID
        
        # 2. Create Registration — detect form type from payload
        form_type = data.get('formType', data.get('form_type', 'rsba')).lower()
        registration = Registration(
            beneficiary_id=beneficiary.id,
            form_type=form_type,
            status='pending',
            encoded_by=current_user.id,
            data=data
        )
        db.session.add(registration)
        db.session.commit()
        
        # Invalidate caches: encoder's own stats + all municipality reviewers
        cache.delete(f'encoder_stats_{current_user.id}')
        cache.delete(f'encoder_activity_{current_user.id}')
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        
        # ── Notify Verifiers & MAOs in the same municipality ──────────
        try:
            from app.models.user import User
            from app.models.notification import Notification
            from app.socket_handlers import broadcast_new_submission, broadcast_new_notification
            
            # Find all relevant users in the same municipality
            reviewers = User.query.filter(
                User.municipality == current_user.municipality,
                User.role.in_(['verifier', 'mao']),
                User.is_active == True
            ).all()
            
            ben_name = f"{data.get('surname')}, {data.get('firstName')}"
            for user in reviewers:
                db.session.add(Notification(
                    user_id=user.id,
                    message=f'New {registration.form_type.upper()} submission for {ben_name} from {current_user.full_name} needs review.',
                    type='new_submission',
                    reference_id=registration.id
                ))
            db.session.commit()

            # Real-time: push socket events for instant UI update
            broadcast_new_submission({
                'form_type': registration.form_type,
                'barangay': data.get('barangay', 'Unknown'),
                'municipality': current_user.municipality,
                'encoder': current_user.full_name
            })
            for user in reviewers:
                broadcast_new_notification(user.id)

        except Exception as e:
            current_app.logger.error(f"Notification error: {str(e)}")
            db.session.rollback() # Don't fail the submission if notification fails
            
        return jsonify({'success': True, 'message': 'Registration submitted successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@encoder_bp.route('/api/activity-feed', methods=['GET'])
@encoder_required
def activity_feed():
    """Get recent activity feed for Encoder dashboard"""
    from sqlalchemy import desc
    
    # ── Production Cache ──
    cache_key = f'encoder_activity_{current_user.id}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    activities = []
    
    try:
        recent = Registration.query.filter(
            Registration.encoded_by == current_user.id,
            Registration.is_deleted == False
        ).order_by(desc(Registration.updated_at)).limit(10).all()
        
        for r in recent:
            ben = Beneficiary.query.get(r.beneficiary_id)
            name = f"{ben.first_name} {ben.last_name}" if ben else "Unknown"
            status_label = r.status
            if status_label == 'pending_verification':
                status_label = 'pending'
                
            act_type = 'success' if r.status == 'approved' else ('warning' if status_label == 'pending' else 'danger')
            
            activities.append({
                'message': f'Submitted {r.form_type.upper()} for {name} ({status_label})',
                'timestamp': r.updated_at.isoformat() if r.updated_at else (r.created_at.isoformat() if r.created_at else None),
                'type': act_type
            })
    except Exception:
        pass
    
    result = {'success': True, 'activities': activities}
    cache.set(cache_key, result, timeout=120)
    return jsonify(result)

@encoder_bp.route('/api/submissions/export', methods=['GET'])
@encoder_required
def export_submissions_csv():
    """Export encoder's own submissions to CSV with optional filtering"""
    import csv
    import io
    from datetime import datetime
    from flask import Response, request
    from app.models.registration import Beneficiary
    
    # ── Get Filter Parameters ──────────
    status = request.args.get('status')
    search = request.args.get('search', '').strip().lower()
    form_type = request.args.get('form_type')
    barangay = request.args.get('barangay')
    
    # ── Query Submissions (exclude soft-deleted) ──────────
    query = Registration.query.filter(Registration.encoded_by == current_user.id, Registration.is_deleted == False)
    
    if status and status != 'All Status':
        # Handle 'pending' vs 'pending_verification' internally
        if status == 'pending':
            query = query.filter(Registration.status.in_(['pending', 'pending_verification']))
        else:
            query = query.filter_by(status=status)
            
    if form_type and form_type != 'All Forms':
        query = query.filter(Registration.form_type == form_type)
            
    submissions = query.all()
    
    # ── Filter by Search & Locality (done in memory for consistency) ──────────
    if search or barangay:
        filtered = []
        for s in submissions:
            ben = Beneficiary.query.get(s.beneficiary_id)
            name = f"{ben.first_name} {ben.last_name}".lower() if ben else ""
            b_brgy = (ben.barangay or "").lower() if ben else ""
            
            matches_search = not search or (search in name or search in s.form_type.lower() or search in s.status.lower() or search in b_brgy)
            matches_brgy = not barangay or (b_brgy == barangay.lower())
            
            if matches_search and matches_brgy:
                filtered.append(s)
        submissions = filtered
    
    # ── Generate CSV ──────────
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Beneficiary', 'Form Type', 'Barangay', 'Status', 'Date Submitted'])
    
    for s in submissions:
        ben = Beneficiary.query.get(s.beneficiary_id)
        # Standardize status for CSV as well
        display_status = s.status
        if display_status == 'pending_verification':
            display_status = 'pending'
            
        writer.writerow([
            s.id,
            f"{ben.first_name} {ben.last_name}" if ben else "Unknown",
            s.form_type.upper(),
            ben.barangay if ben else "N/A",
            display_status.capitalize(),
            s.created_at.strftime('%Y-%m-%d %H:%M:%S') if s.created_at else "N/A"
        ])
    
    output.seek(0)
    muni = current_user.municipality or 'unknown'
    filename = f"submissions_{muni}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )


# ── Notification API Endpoints ───────────────────────────────────────────────

@encoder_bp.route('/api/notifications', methods=['GET'])
@encoder_required
def get_notifications():
    """Get recent notifications for current user"""
    notifs = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_at.desc()).limit(20).all()
    return jsonify({'success': True, 'notifications': [n.to_dict() for n in notifs]})

@encoder_bp.route('/api/notifications/unread-count', methods=['GET'])
@encoder_required
def unread_count():
    """Get count of unread notifications"""
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'success': True, 'count': count})

@encoder_bp.route('/api/notifications/<int:nid>/read', methods=['POST'])
@encoder_required
def mark_read(nid):
    """Mark a single notification as read"""
    notif = Notification.query.filter_by(id=nid, user_id=current_user.id).first()
    if notif:
        notif.is_read = True
        db.session.commit()
    return jsonify({'success': True})

@encoder_bp.route('/api/notifications/read-all', methods=['POST'])
@encoder_required
def mark_all_read():
    """Mark all notifications as read"""
    Notification.query.filter_by(user_id=current_user.id, is_read=False)\
        .update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})


# ── Trash Bin API Endpoints ──────────────────────────────────────────────────

@encoder_bp.route('/api/submissions/<int:rid>/soft-delete', methods=['POST'])
@encoder_required
def soft_delete_submission(rid):
    """Soft-delete a submission (move to trash)"""
    registration = Registration.query.filter_by(id=rid, encoded_by=current_user.id).first()
    if not registration:
        return jsonify({'success': False, 'message': 'Submission not found'}), 404
    if registration.is_deleted:
        return jsonify({'success': False, 'message': 'Already in trash'}), 400

    try:
        registration.is_deleted = True
        registration.deleted_at = datetime.utcnow()
        registration.deleted_by = current_user.id
        db.session.commit()
        cache.delete(f'encoder_stats_{current_user.id}')
        cache.delete(f'encoder_activity_{current_user.id}')
        return jsonify({'success': True, 'message': 'Moved to trash'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@encoder_bp.route('/api/trash', methods=['GET'])
@encoder_required
def get_trash():
    """Get soft-deleted submissions for current encoder"""
    items = Registration.query.filter(
        Registration.encoded_by == current_user.id,
        Registration.is_deleted == True
    ).order_by(Registration.deleted_at.desc()).all()
    return jsonify({'success': True, 'items': [s.to_dict() for s in items]})

@encoder_bp.route('/api/trash/count', methods=['GET'])
@encoder_required
def get_trash_count():
    """Get count of items in trash"""
    count = Registration.query.filter(
        Registration.encoded_by == current_user.id,
        Registration.is_deleted == True
    ).count()
    return jsonify({'success': True, 'count': count})

@encoder_bp.route('/api/trash/<int:rid>/restore', methods=['POST'])
@encoder_required
def restore_from_trash(rid):
    """Restore a soft-deleted submission"""
    registration = Registration.query.filter_by(id=rid, encoded_by=current_user.id).first()
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404

    try:
        registration.is_deleted = False
        registration.deleted_at = None
        registration.deleted_by = None
        db.session.commit()
        cache.delete(f'encoder_stats_{current_user.id}')
        cache.delete(f'encoder_activity_{current_user.id}')
        return jsonify({'success': True, 'message': 'Submission restored'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@encoder_bp.route('/api/trash/<int:rid>/permanent', methods=['DELETE'])
@encoder_required
def permanent_delete(rid):
    """Permanently delete a submission from trash"""
    registration = Registration.query.filter_by(id=rid, encoded_by=current_user.id).first()
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404

    try:
        ben_id = registration.beneficiary_id
        db.session.delete(registration)
        
        # Delete orphaned beneficiary if no other registrations reference it
        other = Registration.query.filter(
            Registration.beneficiary_id == ben_id,
            Registration.id != rid
        ).first()
        if not other:
            ben = Beneficiary.query.get(ben_id)
            if ben:
                db.session.delete(ben)
        
        db.session.commit()
        cache.delete(f'encoder_stats_{current_user.id}')
        cache.delete(f'encoder_activity_{current_user.id}')
        return jsonify({'success': True, 'message': 'Permanently deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

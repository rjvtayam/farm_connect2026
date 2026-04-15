"""
Farm Connect - Verifier Panel Routes
"""

from flask import Blueprint, render_template, jsonify, request, Response
from flask_login import login_required, current_user
import io
import csv
from datetime import datetime, timedelta
from sqlalchemy import desc, func
import calendar as _cal
from sqlalchemy.orm import joinedload

from app.extensions import db, cache
from app.models.registration import Registration, Beneficiary
from app.models.user import User
from app.models.notification import Notification
from app.routes.auth import verifier_required
from app.utils.logging_helpers import log_activity

verifier_bp = Blueprint('verifier', __name__)

@verifier_bp.route('/dashboard')
@verifier_required
def dashboard():
    """Verifier dashboard"""
    return render_template('roles/verifier-panel.html')

@verifier_bp.route('/api/stats', methods=['GET'])
@verifier_required
def get_stats():
    """Get Verifier dashboard stats (Municipality Filtered)"""
    muni = current_user.municipality

    # ── Production Cache ──
    cache_key = f'verifier_stats_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    # Robust filter matching the submissions list logic
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    yesterday = datetime.utcnow().date() - timedelta(days=1)
    today = datetime.utcnow().date()

    # Current counts
    pending = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, 
        Registration.status == 'pending',
        Registration.is_deleted == False
    ).count()
    
    verified_total = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'verified',
        Registration.is_deleted == False
    ).count()
    
    reviewed_today = Registration.query.filter(
        Registration.verified_by == current_user.id,
        db.func.date(Registration.review_date) == today,
        Registration.is_deleted == False
    ).count()
    
    approved_total = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'approved',
        Registration.is_deleted == False
    ).count()
    
    rejected_total = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'rejected',
        Registration.is_deleted == False
    ).count()

    # Old counts (exclude soft-deleted)
    old_pending = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'pending', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_verified = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'verified', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_approved = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_rejected = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'rejected', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    reviewed_yesterday = Registration.query.filter(Registration.verified_by == current_user.id, db.func.date(Registration.review_date) == yesterday, Registration.is_deleted == False).count()

    def calc_trend(current, old):
        if old == 0: return 100 if current > 0 else 0
        return round(((current - old) / old) * 100)
    
    result = {
        'success': True,
        'stats': {
            'pending': pending,
            'verified': verified_total,
            'reviewed_today': reviewed_today,
            'approved': approved_total,
            'rejected': rejected_total
        },
        'trends': {
            'pending': calc_trend(pending, old_pending),
            'verified': calc_trend(verified_total, old_verified),
            'reviewed_today': calc_trend(reviewed_today, reviewed_yesterday),
            'approved': calc_trend(approved_total, old_approved),
            'rejected': calc_trend(rejected_total, old_rejected)
        }
    }
    cache.set(cache_key, result, timeout=300)
    return jsonify(result)

@verifier_bp.route('/api/analytics', methods=['GET'])
@verifier_required
def get_analytics():
    """Get Verifier analytics scoped to municipality."""
    import calendar as _cal
    from sqlalchemy import func

    muni = current_user.municipality

    # ── Production Cache (10 min) ──
    cache_key = f'verifier_analytics_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )

    # ── Pipeline Status Distribution (all statuses, muni-wide) ──
    pipeline_counts = db.session.query(
        Registration.status, func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.is_deleted == False
    ).group_by(Registration.status).all()

    # ── Pending by Form Type (backlog insight) ──
    pending_by_type = db.session.query(
        Registration.form_type, func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'pending',
        Registration.is_deleted == False
    ).group_by(Registration.form_type).all()

    # ── Top Barangays with Pending Submissions (backlog) ──
    pending_by_barangay = db.session.query(
        Beneficiary.barangay, func.count(Beneficiary.id)
    ).join(Registration, Registration.beneficiary_id == Beneficiary.id
    ).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'pending',
        Registration.is_deleted == False
    ).group_by(Beneficiary.barangay
    ).order_by(func.count(Beneficiary.id).desc()).limit(10).all()

    # ── Monthly Reviews — how many this verifier reviewed per month (current year) ──
    now = datetime.utcnow()
    current_year   = now.year
    last_year_val  = current_year - 1
    current_year_start = datetime(current_year, 1, 1)
    last_year_start    = datetime(last_year_val, 1, 1)
    last_year_end      = datetime(last_year_val, 12, 31, 23, 59, 59)

    # Current year: verified or rejected by this verifier
    monthly_current_raw = db.session.query(
        func.to_char(Registration.review_date, 'YYYY-MM'),
        func.count(Registration.id)
    ).filter(
        Registration.verified_by == current_user.id,
        Registration.review_date >= current_year_start,
        Registration.is_deleted == False
    ).group_by(func.to_char(Registration.review_date, 'YYYY-MM')).all()

    # Last year
    monthly_last_raw = db.session.query(
        func.to_char(Registration.review_date, 'YYYY-MM'),
        func.count(Registration.id)
    ).filter(
        Registration.verified_by == current_user.id,
        Registration.review_date >= last_year_start,
        Registration.review_date <= last_year_end,
        Registration.is_deleted == False
    ).group_by(func.to_char(Registration.review_date, 'YYYY-MM')).all()

    cur_lookup      = {row[0]: row[1] for row in monthly_current_raw}
    last_lookup     = {row[0]: row[1] for row in monthly_last_raw}
    month_labels    = [_cal.month_abbr[m] for m in range(1, 13)]
    current_arr     = [cur_lookup.get(f"{current_year}-{str(m).zfill(2)}", 0) for m in range(1, 13)]
    last_arr        = [last_lookup.get(f"{last_year_val}-{str(m).zfill(2)}", 0) for m in range(1, 13)]

    # ── KPI summary chips ──
    raw_pipeline = dict(pipeline_counts)
    total_muni   = sum(raw_pipeline.values())
    pending_cnt  = raw_pipeline.get('pending', 0)
    verified_cnt = raw_pipeline.get('verified', 0)
    approved_cnt = raw_pipeline.get('approved', 0)
    rejected_cnt = raw_pipeline.get('rejected', 0)

    # This verifier's personal review count (all time, all statuses)
    my_total_reviewed = Registration.query.filter(
        Registration.verified_by == current_user.id,
        Registration.is_deleted == False
    ).count()

    # Verified today
    today = datetime.utcnow().date()
    reviewed_today = Registration.query.filter(
        Registration.verified_by == current_user.id,
        db.func.date(Registration.review_date) == today,
        Registration.is_deleted == False
    ).count()

    # ── Demographics (real data - counts of unique approved beneficiaries) ──
    sex_counts = db.session.query(
        Beneficiary.sex, func.count(Beneficiary.id)
    ).join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.status == 'approved'
    ).group_by(Beneficiary.sex).all()

    pwd_count     = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Beneficiary.is_pwd   == True).count()
    four_ps_count = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Beneficiary.is_4ps  == True).count()
    ip_count      = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Beneficiary.is_ip   == True).count()

    result = {
        'success': True,
        'analytics': {
            'pipeline':           raw_pipeline,
            'pending_by_type':    dict(pending_by_type),
            'pending_by_barangay': dict(pending_by_barangay),
            'monthly': {
                'month_labels': month_labels,
                'current_year': str(current_year),
                'last_year':    str(last_year_val),
                'current_data': current_arr,
                'last_data':    last_arr,
            },
            'kpi': {
                'pending':          pending_cnt,
                'verified':         verified_cnt,
                'approved':         approved_cnt,
                'rejected':         rejected_cnt,
                'my_total_reviewed': my_total_reviewed,
                'reviewed_today':   reviewed_today,
                'total_muni':       total_muni,
            },
            'demographics': {
                'sex':     dict(sex_counts),
                'pwd':     pwd_count,
                'four_ps': four_ps_count,
                'ip':      ip_count,
            }
        }
    }
    cache.set(cache_key, result, timeout=600)
    return jsonify(result)

@verifier_bp.route('/api/submissions', methods=['GET'])
@verifier_required
def get_submissions():
    """Get submissions (Municipality Filtered)"""
    muni = current_user.municipality
    status = request.args.get('status', 'pending')
    
    
    # Use case-insensitive matching for municipality, and as a fallback for testing, check if they typed the province by mistake.
    query = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        db.or_(
            Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
            # Fallback for the current test data where "Laguna" was mistakenly entered as Municipality
            Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
        ),
        Registration.is_deleted == False
    )
    
    if status:
        query = query.filter(Registration.status == status)
        
    submissions = query.order_by(Registration.created_at.asc()).limit(200).all()
    
    # Enrich with beneficiary and encoder names
    data = []

    for s in submissions:
        ben = s.beneficiary
        encoder = User.query.get(s.encoded_by)
        
        ben_dict = ben.to_dict() if ben else {}
        
        data.append({
            'id': s.id,
            'beneficiary_name': ben_dict.get('full_name', 'Unknown'),
            'form_type': s.form_type,
            'encoder_name': encoder.full_name if encoder else "Unknown",
            'barangay': ben.barangay if ben else "Unknown",
            'status': s.status,
            'created_at': s.created_at.isoformat()
        })

    return jsonify({
        'success': True,
        'submissions': data
    })

@verifier_bp.route('/api/submissions/<int:id>', methods=['GET'])
@verifier_required
def get_submission_details(id):
    """Get partial details for review (Municipality Check)"""
    # UNIFIED AUTHORIZATION LOGIC: Match the list view logic (Allow if Ben in town OR Encoder in town)
    user_muni = (current_user.municipality or '')
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{user_muni}%"),
        User.municipality.ilike(f"%{user_muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if user_muni.lower() == "mabitac" else False
    )
    
    submission = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == id,
        muni_filter
    ).first()

    if not submission:
        return jsonify({'success': False, 'message': 'Unauthorized or Not Found'}), 403
    
    ben = Beneficiary.query.get(submission.beneficiary_id)
    
    # Determine lock status safely (locked_at can be None)
    is_locked = False
    if submission.locked_by_id is not None and submission.locked_by_id != current_user.id and submission.locked_at is not None:
        is_locked = (datetime.utcnow() - submission.locked_at).total_seconds() < 900

    return jsonify({
        'success': True,
        'submission': {
            'id': submission.id,
            'status': submission.status,
            'form_type': submission.form_type,
            'data': submission.data,
            'geo_data': submission.geo_data,
            'beneficiary': ben.to_dict() if ben else {},
            'lock': {
                'is_locked': is_locked,
                'user_name': submission.locked_by_user.full_name if submission.locked_by_user else None
            }
        }
    })

@verifier_bp.route('/api/submissions/<int:id>/lock', methods=['PUT'])
@verifier_required
def lock_submission(id):
    """Lock a submission for exclusive review"""
    submission = Registration.query.get_or_404(id)
    
    # Check if already locked by someone else and lock is still valid (15 mins)
    if submission.locked_by_id and submission.locked_by_id != current_user.id:
        if (datetime.utcnow() - submission.locked_at).total_seconds() < 900:
            return jsonify({
                'success': False, 
                'message': f'Record is currently locked by {submission.locked_by_user.full_name}'
            }), 409

    submission.locked_by_id = current_user.id
    submission.locked_at = datetime.utcnow()
    db.session.commit()
    
    # Broadcast lock event via SocketIO
    from app.socket_handlers import socketio
    socketio.emit('record_locked', {
        'submission_id': id,
        'user_name': current_user.full_name,
        'user_id': current_user.id
    }, room=f"muni_{current_user.municipality.lower().replace(' ', '_')}")
    
    return jsonify({'success': True})

@verifier_bp.route('/api/submissions/<int:id>/unlock', methods=['PUT'])
@verifier_required
def unlock_submission(id):
    """Release a submission lock"""
    submission = Registration.query.get_or_404(id)
    
    if submission.locked_by_id == current_user.id:
        submission.locked_by_id = None
        submission.locked_at = None
        db.session.commit()
        
        # Broadcast unlock event
        from app.socket_handlers import socketio
        socketio.emit('record_unlocked', {
            'submission_id': id
        }, room=f"muni_{current_user.municipality.lower().replace(' ', '_')}")
        
    return jsonify({'success': True})

@verifier_bp.route('/api/submissions/<int:id>/review', methods=['POST'])
@verifier_required
def review_submission(id):
    """Approve or Reject a submission (Municipality Check)"""
    # UNIFIED AUTHORIZATION LOGIC: Match the list view logic (Allow if Ben in town OR Encoder in town)
    user_muni = (current_user.municipality or '')
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{user_muni}%"),
        User.municipality.ilike(f"%{user_muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if user_muni.lower() == "mabitac" else False
    )
    
    submission = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == id,
        muni_filter
    ).first()

    if not submission:
        return jsonify({'success': False, 'message': 'Unauthorized or Not Found'}), 403
    
    ben = Beneficiary.query.get(submission.beneficiary_id)
    data = request.get_json()
    
    new_status = data.get('status')
    if new_status not in ['verified', 'rejected']:
        return jsonify({'success': False, 'message': 'Invalid status. Use "verified" or "rejected".'}), 400
        
    try:
        submission.status = new_status
        submission.verified_by = current_user.id
        submission.review_date = datetime.utcnow()
        submission.remarks = data.get('remarks')
        
        # Auto-unlock on successful review
        submission.locked_by_id = None
        submission.locked_at = None
        
        # Save GIS/Geo data if provided
        if 'geo_data' in data:
            submission.geo_data = data.get('geo_data')

        if new_status == 'verified':
             updates = data.get('beneficiary_updates', {})
             if ben and updates:
                 if 'first_name' in updates: ben.first_name = updates['first_name']
                 if 'last_name' in updates: ben.last_name = updates['last_name']
                 if 'barangay' in updates: ben.barangay = updates['barangay']
                 if 'mobile_number' in updates: ben.mobile_number = updates['mobile_number']
                 
             # Save GIS Data directly into the submission JSON payload
             gis_data = data.get('gis_data')
             if gis_data and submission.form_type == 'rsbsa':
                 try:
                     # submission.data property setter handles json.dumps
                     form_data = submission.data or {}
                     if isinstance(form_data, dict):
                         form_data['gis'] = gis_data
                         submission.data = form_data
                 except Exception as e:
                     current_app.logger.error(f"Error saving GIS data: {e}", exc_info=True)
        
        db.session.commit()
        
        # Invalidate caches across affected roles
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        if submission.encoded_by:
            cache.delete(f'encoder_stats_{submission.encoded_by}')
            cache.delete(f'encoder_activity_{submission.encoded_by}')

        # Log the review activity
        log_activity(
            f"{new_status.capitalize()} Submission",
            f"Submission ID: {submission.id} for {ben.last_name if ben else 'Unknown'}",
            current_user
        )

        # ── Notify via SocketIO (Real-time) ─────────────────────────────
        from app.socket_handlers import broadcast_status_update, broadcast_new_notification
        broadcast_status_update(id, new_status, current_user.full_name, municipality=current_user.municipality)

        # ── Notify the encoder who submitted ────────────────────────────
        notified_user_ids = []
        try:
            ben_name = f"{ben.last_name}, {ben.first_name}" if ben else "Unknown"
            
            # If rejected, notify the encoder
            if new_status == 'rejected':
                db.session.add(Notification(
                    user_id=submission.encoded_by,
                    message=f'Your {submission.form_type.upper()} submission for {ben_name} has been returned/rejected by Verifier {current_user.full_name}',
                    type='rejected',
                    reference_id=submission.id
                ))
                notified_user_ids.append(submission.encoded_by)
            
            # If verified, notify the MAO
            elif new_status == 'verified':
                maos = User.query.filter_by(municipality=current_user.municipality, role='mao', is_active=True).all()
                for mao in maos:
                    db.session.add(Notification(
                        user_id=mao.id,
                        message=f'{ben_name}\'s {submission.form_type.upper()} submission has been verified by {current_user.full_name} and is ready for your approval.',
                        type='verified',
                        reference_id=submission.id
                    ))
                    notified_user_ids.append(mao.id)
            
            db.session.commit()

            # Real-time: instant notification badge refresh for each recipient
            for uid in notified_user_ids:
                broadcast_new_notification(uid)

        except Exception:
            db.session.rollback()

        return jsonify({
            'success': True, 
            'message': f'Submission {new_status} successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@verifier_bp.route('/api/submissions/bulk-review', methods=['POST'])
@verifier_required
def bulk_review_submissions():
    """Bulk Verify or Reject submissions (municipality-scoped)"""
    data = request.get_json()
    ids = data.get('ids', [])
    new_status = data.get('status')
    remarks = data.get('remarks', 'Bulk action')
    
    if not ids or new_status not in ['verified', 'rejected']:
        return jsonify({'success': False, 'message': 'Invalid request'}), 400

    user_muni = current_user.municipality or ''
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f'%{user_muni}%'),
        User.municipality.ilike(f'%{user_muni}%'),
        Beneficiary.municipality.ilike('%Laguna%') if user_muni.lower() == 'mabitac' else False
    )
        
    try:
        submissions = Registration.query.join(Beneficiary).outerjoin(
            User, Registration.encoded_by == User.id
        ).filter(
            Registration.id.in_(ids),
            muni_filter,
            Registration.is_deleted == False
        ).all()
        for s in submissions:
            # Basic municipality check could be added here for robustness
            s.status = new_status
            s.verified_by = current_user.id
            s.review_date = datetime.utcnow()
            s.remarks = remarks
            
            # Add notifications
            ben = Beneficiary.query.get(s.beneficiary_id)
            ben_name = f"{ben.last_name}, {ben.first_name}" if ben else "Unknown"
            
            if new_status == 'rejected':
                db.session.add(Notification(
                    user_id=s.encoded_by,
                    message=f'Your {s.form_type.upper()} submission for {ben_name} has been rejected in a bulk action by {current_user.full_name}',
                    type='rejected',
                    reference_id=s.id
                ))
            elif new_status == 'verified':
                # Notify MAOs
                maos = User.query.filter_by(municipality=current_user.municipality, role='mao', is_active=True).all()
                for mao in maos:
                    db.session.add(Notification(
                        user_id=mao.id,
                        message=f'{ben_name}\'s submission has been verified (bulk) and is ready for approval.',
                        type='verified',
                        reference_id=s.id
                    ))
        
        db.session.commit()
        
        # Invalidate caches after bulk review
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        # Invalidate encoder caches for all affected encoders
        encoder_ids = set(s.encoded_by for s in submissions if s.encoded_by)
        for eid in encoder_ids:
            cache.delete(f'encoder_stats_{eid}')
            cache.delete(f'encoder_activity_{eid}')
        
        return jsonify({'success': True, 'message': f'{len(submissions)} submissions updated'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@verifier_bp.route('/api/submissions/export', methods=['GET'])
@verifier_required
def export_submissions_csv():
    """Export submissions with filtering and professional formatting"""
    
    status = request.args.get('status')
    search = request.args.get('search', '').strip().lower()
    form_type = request.args.get('form_type')
    muni = current_user.municipality
    
    # ── Robust Municipality Filter ──────────
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )
    
    query = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.is_deleted == False)
    
    # ── Apply Status Filter ──────────
    if status == 'pending':
        query = query.filter(Registration.status == 'pending')
    elif status == 'reviewed':
        query = query.filter(Registration.status.in_(['verified', 'approved', 'rejected']))
    elif status and status != 'All Status':
        query = query.filter(Registration.status == status)
        
    # ── Apply Form Type Filter ──────────
    if form_type and form_type != 'All Forms':
        query = query.filter(Registration.form_type == form_type)
        
    submissions = query.all()
    
    # ── Apply Search Filter ──────────
    if search:
        filtered = []
        for s in submissions:
            ben = s.beneficiary
            ben_name = ben.to_dict().get('full_name', '').lower() if ben else ""
            if search in ben_name or search in s.form_type.lower() or search in (ben.barangay or '').lower():
                filtered.append(s)
        submissions = filtered
    
    # ── Generate CSV ──────────
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Beneficiary', 'Form Type', 'Encoder', 'Barangay', 'Status', 'Date Submitted'])
    
    for s in submissions:
        ben = s.beneficiary
        enc = User.query.get(s.encoded_by)
        ben_dict = ben.to_dict() if ben else {}
        
        writer.writerow([
            s.id,
            ben_dict.get('full_name', 'Unknown'),
            s.form_type.upper(),
            enc.full_name if enc else "Unknown",
            ben.barangay if ben else "N/A",
            s.status.capitalize(),
            s.created_at.strftime('%Y-%m-%d %H:%M:%S') if s.created_at else "N/A"
        ])
    
    output.seek(0)
    filename = f"verifier_export_{muni}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

@verifier_bp.route('/api/gis/global', methods=['GET'])
@verifier_required
def get_global_gis():
    """Get all verified/approved geo-data for the municipality map"""
    muni = current_user.municipality
    
    # Fetch all records that have geo_data and belong to the municipality
    # We include 'approved' and 'verified'
    items = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Beneficiary.municipality == muni,
        Registration.status.in_(['verified', 'approved']),
        Registration.geo_data != None,
        Registration.geo_data != ''
    ).all()
    
    results = []
    for item in items:
        ben = item.beneficiary
        results.append({
            'id': item.id,
            'beneficiary_name': f"{ben.first_name} {ben.last_name}" if ben else "Unknown",
            'form_type': item.form_type,
            'status': item.status,
            'barangay': ben.barangay if ben else "Unknown",
            'geo_json': item.geo_data # Already a GeoJSON string from Leaflet.draw
        })
        
    return jsonify({'success': True, 'parcels': results})

@verifier_bp.route('/api/activity-feed', methods=['GET'])
@verifier_required
def activity_feed():
    """Get recent activity feed for Verifier dashboard"""
    muni = current_user.municipality
    
    # ── Production Cache ──
    cache_key = f'verifier_activity_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    activities = []
    
    try:
        recent = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
            db.or_(
                Beneficiary.municipality.ilike(f'%{muni}%'),
                User.municipality.ilike(f'%{muni}%')
            ),
            Registration.is_deleted == False
        ).order_by(desc(Registration.updated_at)).limit(10).all()
        
        for r in recent:
            ben = r.beneficiary
            ben_dict = ben.to_dict() if ben else {}
            name = ben_dict.get('full_name', 'Unknown')
            act_type = 'success' if r.status == 'approved' else ('warning' if r.status == 'pending' else 'danger')
            activities.append({
                'message': f'{name} — {r.form_type.upper()} ({r.status})',
                'timestamp': r.updated_at.isoformat() if r.updated_at else (r.created_at.isoformat() if r.created_at else None),
                'type': act_type
            })
    except Exception:
        pass
    
    result = {'success': True, 'activities': activities}
    cache.set(cache_key, result, timeout=120)
    return jsonify(result)


# ── Notification API Endpoints (Consolidated) ──────────────────────────────────
from app.utils.notification_helpers import (
    get_user_notifications, get_unread_count,
    mark_notification_read, mark_all_notifications_read
)

@verifier_bp.route('/api/notifications', methods=['GET'])
@verifier_required
def get_notifications():
    return get_user_notifications(current_user.id)

@verifier_bp.route('/api/notifications/unread-count', methods=['GET'])
@verifier_required
def unread_count():
    return get_unread_count(current_user.id)

@verifier_bp.route('/api/notifications/<int:nid>/read', methods=['POST'])
@verifier_required
def mark_read(nid):
    return mark_notification_read(nid, current_user.id)

@verifier_bp.route('/api/notifications/read-all', methods=['POST'])
@verifier_required
def mark_all_read():
    return mark_all_notifications_read(current_user.id)


# ── Trash Bin API Endpoints ──────────────────────────────────────────────────

@verifier_bp.route('/api/submissions/<int:rid>/soft-delete', methods=['POST'])
@verifier_required
def soft_delete_submission(rid):
    """Soft-delete a submission (move to trash)"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%")
    )
    registration = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == rid, muni_filter
    ).first()
    if not registration:
        return jsonify({'success': False, 'message': 'Submission not found'}), 404
    if registration.is_deleted:
        return jsonify({'success': False, 'message': 'Already in trash'}), 400

    try:
        registration.is_deleted = True
        registration.deleted_at = datetime.utcnow()
        registration.deleted_by = current_user.id
        db.session.commit()
        cache.delete(f'verifier_stats_{muni}')
        cache.delete(f'verifier_activity_{muni}')
        return jsonify({'success': True, 'message': 'Moved to trash'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@verifier_bp.route('/api/trash', methods=['GET'])
@verifier_required
def get_trash():
    """Get soft-deleted submissions for verifier's municipality"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%")
    )
    items = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.is_deleted == True
    ).order_by(Registration.deleted_at.desc()).all()
    
    data = []
    for s in items:
        ben = Beneficiary.query.get(s.beneficiary_id)
        encoder = User.query.get(s.encoded_by)
        data.append({
            'id': s.id,
            'beneficiary_name': ben.to_dict().get('full_name', 'Unknown') if ben else 'Unknown',
            'form_type': s.form_type,
            'encoder_name': encoder.full_name if encoder else 'Unknown',
            'status': s.status,
            'deleted_at': s.deleted_at.isoformat() if s.deleted_at else None,
            'created_at': s.created_at.isoformat() if s.created_at else None
        })
    return jsonify({'success': True, 'items': data})

@verifier_bp.route('/api/trash/count', methods=['GET'])
@verifier_required
def get_trash_count():
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%")
    )
    count = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.is_deleted == True
    ).count()
    return jsonify({'success': True, 'count': count})

@verifier_bp.route('/api/trash/<int:rid>/restore', methods=['POST'])
@verifier_required
def restore_from_trash(rid):
    registration = Registration.query.get(rid)
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404
    try:
        registration.is_deleted = False
        registration.deleted_at = None
        registration.deleted_by = None
        db.session.commit()
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Submission restored'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@verifier_bp.route('/api/trash/<int:rid>/permanent', methods=['DELETE'])
@verifier_required
def permanent_delete(rid):
    registration = Registration.query.get(rid)
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404
    try:
        ben_id = registration.beneficiary_id
        db.session.delete(registration)
        other = Registration.query.filter(Registration.beneficiary_id == ben_id, Registration.id != rid).first()
        if not other:
            ben = Beneficiary.query.get(ben_id)
            if ben:
                db.session.delete(ben)
        db.session.commit()
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Permanently deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

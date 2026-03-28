import csv
import io
import random
from datetime import datetime, timedelta

from flask import Blueprint, render_template, jsonify, request, Response
from flask_login import login_required, current_user
from sqlalchemy import func, desc

from app.extensions import db, cache
from app.models.registration import Registration, Beneficiary
from app.models.user import User
from app.models.notification import Notification
from app.routes.auth import mao_required

mao_bp = Blueprint('mao', __name__)

@mao_bp.route('/dashboard')
@mao_required
def dashboard():
    """MAO dashboard"""
    return render_template('roles/mao-panel.html')

@mao_bp.route('/api/stats', methods=['GET'])
@mao_required
def get_stats():
    """Get MAO dashboard stats (Municipality Filtered)"""
    muni = current_user.municipality
    
    # ── Production Cache ──
    cache_key = f'mao_stats_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    # Robust municipality filter (matching verifier)
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )

    # Current counts (exclude soft-deleted)
    total_registrations = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.is_deleted == False).count()
    approved = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Registration.is_deleted == False).count()
    pending_approval = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'verified', Registration.is_deleted == False).count()
    pending_verification = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'pending', Registration.is_deleted == False).count()
    
    # Only count beneficiaries who have at least ONE approved registration
    beneficiaries = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, 
        Registration.status == 'approved',
        Registration.is_deleted == False
    ).distinct().count()
    
    # Old counts (exclude soft-deleted)
    old_total = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_approved = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'approved', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_pending_approval = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'verified', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_pending_verification = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.status == 'pending', Registration.created_at <= thirty_days_ago, Registration.is_deleted == False).count()
    old_beneficiaries = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Beneficiary.created_at <= thirty_days_ago, Registration.is_deleted == False).distinct().count()

    def calc_trend(current, old):
        if old == 0: return 100 if current > 0 else 0
        return round(((current - old) / old) * 100)
    
    result = {
        'success': True,
        'stats': {
            'total': total_registrations,
            'approved': approved,
            'pending': pending_approval,
            'pending_verification': pending_verification,
            'beneficiaries': beneficiaries
        },
        'trends': {
            'total': calc_trend(total_registrations, old_total),
            'approved': calc_trend(approved, old_approved),
            'pending': calc_trend(pending_approval, old_pending_approval),
            'pending_verification': calc_trend(pending_verification, old_pending_verification),
            'beneficiaries': calc_trend(beneficiaries, old_beneficiaries)
        }
    }
    cache.set(cache_key, result, timeout=300)
    return jsonify(result)

@mao_bp.route('/api/analytics', methods=['GET'])
@mao_required
def get_analytics():
    """Get chart data (Municipality Filtered) — includes year-over-year monthly comparison."""
    muni = current_user.municipality

    # ── Production Cache (10 min — heaviest endpoint) ──
    cache_key = f'mao_analytics_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )

    # ── Registration by Type ──
    type_counts = db.session.query(
        Registration.form_type, func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.is_deleted == False
    ).group_by(Registration.form_type).all()

    # ── Status Distribution ──
    status_counts = db.session.query(
        Registration.status, func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter, Registration.is_deleted == False
    ).group_by(Registration.status).all()

    # ── Barangay Distribution (Top 10) ──
    barangay_counts = db.session.query(
        Beneficiary.barangay, func.count(Beneficiary.id)
    ).join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter
    ).group_by(Beneficiary.barangay).order_by(func.count(Beneficiary.id).desc()).limit(10).all()

    # ── Monthly Growth — Current Year vs Prior Year ──
    import calendar as _cal
    now = datetime.utcnow()
    current_year   = now.year
    last_year_val  = current_year - 1
    current_year_start = datetime(current_year, 1, 1)
    last_year_start    = datetime(last_year_val, 1, 1)
    last_year_end      = datetime(last_year_val, 12, 31, 23, 59, 59)

    growth_current_raw = db.session.query(
        func.to_char(Registration.created_at, 'YYYY-MM'),
        func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.created_at >= current_year_start,
        Registration.is_deleted == False
    ).group_by(func.to_char(Registration.created_at, 'YYYY-MM')).all()

    growth_last_raw = db.session.query(
        func.to_char(Registration.created_at, 'YYYY-MM'),
        func.count(Registration.id)
    ).join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.created_at >= last_year_start,
        Registration.created_at <= last_year_end,
        Registration.is_deleted == False
    ).group_by(func.to_char(Registration.created_at, 'YYYY-MM')).all()

    current_lookup    = {row[0]: row[1] for row in growth_current_raw}
    last_lookup       = {row[0]: row[1] for row in growth_last_raw}
    month_labels      = [_cal.month_abbr[m] for m in range(1, 13)]
    current_data_arr  = [current_lookup.get(f"{current_year}-{str(m).zfill(2)}", 0) for m in range(1, 13)]
    last_data_arr     = [last_lookup.get(f"{last_year_val}-{str(m).zfill(2)}", 0) for m in range(1, 13)]

    # ── Demographics (real data) ──
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
            'types':     dict(type_counts),
            'status':    dict(status_counts),
            'barangays': dict(barangay_counts),
            'growth': {
                'month_labels': month_labels,
                'current_year': str(current_year),
                'last_year':    str(last_year_val),
                'current_data': current_data_arr,
                'last_data':    last_data_arr,
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

@mao_bp.route('/api/beneficiaries', methods=['GET'])
@mao_required
def get_beneficiaries():
    """Get all beneficiaries with at least one approved registration (Municipality Filtered)"""
    muni = current_user.municipality

    # ── Production Cache (2min) ──
    cache_key = f'mao_beneficiaries_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )
    
    # Only show beneficiaries with APPROVED registrations
    beneficiaries = Beneficiary.query.join(Registration).outerjoin(User, Registration.encoded_by == User.id).filter(
        muni_filter,
        Registration.status == 'approved'
    ).order_by(Beneficiary.created_at.desc()).distinct().all()
    
    result = {
        'success': True,
        'beneficiaries': [b.to_dict() for b in beneficiaries]
    }
    cache.set(cache_key, result, timeout=120)
    return jsonify(result)

@mao_bp.route('/api/registrations', methods=['GET'])
@mao_required
def get_registrations():
    """Get recent registrations (Filtered)"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )
    # Join with Beneficiary to filter by municipality
    registrations = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.is_deleted == False).order_by(Registration.created_at.desc()).limit(50).all()
    
    # We need to join with beneficiary to get names
    data = []
    for r in registrations:
        ben = Beneficiary.query.get(r.beneficiary_id)
        ben_dict = ben.to_dict() if ben else {}
        
        data.append({
            'id': r.id,
            'rsbsa_id': ben.rsbsa_id if ben else None,
            'beneficiary_name': ben_dict.get('full_name', 'Unknown'),
            'form_type': r.form_type,
            'barangay': ben.barangay if ben else "Unknown",
            'status': r.status,
            'created_at': r.created_at.isoformat()
        })

    return jsonify({
        'success': True,
        'registrations': data
    })

@mao_bp.route('/api/registrations/<int:rid>', methods=['GET'])
@mao_required
def get_registration(rid):
    """Get full registration details for MAO"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )
    registration = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == rid,
        muni_filter
    ).first()

    if not registration:
        return jsonify({'success': False, 'message': 'Registration not found'}), 404

    beneficiary = Beneficiary.query.get(registration.beneficiary_id)

    return jsonify({
        'success': True,
        'registration': {
            'id': registration.id,
            'form_type': registration.form_type,
            'status': registration.status,
            'data_json': registration.data,
            'geo_data': registration.geo_data, # Added for map view
            'created_at': registration.created_at.isoformat(),
            'beneficiary': beneficiary.to_dict() if beneficiary else None
        }
    })

@mao_bp.route('/api/registrations/<int:rid>/review', methods=['POST'])
@mao_required
def review_registration(rid):
    """Final Approval or Rejection by MAO"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )
    registration = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == rid,
        muni_filter
    ).first()

    if not registration:
        return jsonify({'success': False, 'message': 'Registration not found'}), 404

    data = request.json
    new_status = data.get('action') or data.get('status')
    remarks = data.get('remarks', '')
    
    if new_status not in ['approved', 'rejected']:
        return jsonify({'success': False, 'message': 'Invalid status'}), 400

    try:
        registration.status = new_status
        registration.approved_by = current_user.id
        registration.remarks = remarks
        registration.review_date = datetime.utcnow()
        
        # ── Generate RSBSA ID upon approval ──
        if new_status == 'approved':
            ben = Beneficiary.query.get(registration.beneficiary_id)
            if ben and not ben.rsbsa_id:
                # Format: RS-[YEAR]-[MUNI_PREFIX]-[RANDOM_4_DIGITS]
                year = datetime.now().year
                muni_str = str(ben.municipality or "LAG").upper().replace(" ", "")
                muni_prefix = muni_str[:3] if len(muni_str) >= 3 else muni_str.ljust(3, 'X')
                
                # Check for uniqueness (very basic loop)
                new_id = f"RS-{year}-{muni_prefix}-{random.randint(1000, 9999)}"
                while Beneficiary.query.filter_by(rsbsa_id=new_id).first():
                    new_id = f"RS-{year}-{muni_prefix}-{random.randint(1000, 9999)}"
                
                ben.rsbsa_id = new_id
                db.session.add(ben)

        db.session.commit()
        
        # Invalidate caches across affected roles
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        cache.delete(f'mao_beneficiaries_{current_user.municipality}')
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        if registration.encoded_by:
            cache.delete(f'encoder_stats_{registration.encoded_by}')
            cache.delete(f'encoder_activity_{registration.encoded_by}')

        # ── Notify Encoder & Verifier ───────────────────────────────
        from app.socket_handlers import broadcast_status_update, broadcast_new_notification

        ben = Beneficiary.query.get(registration.beneficiary_id)
        ben_name = f"{ben.last_name}, {ben.first_name}" if ben else "Unknown"
        status_label = 'approved ✓' if new_status == 'approved' else 'rejected'
        
        notified_user_ids = []

        # Notify Encoder
        db.session.add(Notification(
            user_id=registration.encoded_by,
            message=f'Final Decision: {ben_name}\'s {registration.form_type.upper()} submission has been {status_label} by MAO {current_user.full_name}.',
            type=new_status,
            reference_id=registration.id
        ))
        notified_user_ids.append(registration.encoded_by)
        
        # Notify Verifier (if exists)
        if registration.verified_by:
            db.session.add(Notification(
                user_id=registration.verified_by,
                message=f'Update: {ben_name}\'s {registration.form_type.upper()} submission (verified by you) was {status_label} by MAO {current_user.full_name}.',
                type=new_status,
                reference_id=registration.id
            ))
            notified_user_ids.append(registration.verified_by)
            
        db.session.commit()

        # Real-time: push socket events for instant UI update
        broadcast_status_update(registration.id, new_status, current_user.full_name, municipality=current_user.municipality)
        for uid in notified_user_ids:
            broadcast_new_notification(uid)

        return jsonify({'success': True, 'message': f'Registration {new_status} successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@mao_bp.route('/api/registrations/bulk-review', methods=['POST'])
@mao_required
def bulk_review_registrations():
    """Bulk Approval or Rejection by MAO"""
    data = request.get_json()
    ids = data.get('ids', [])
    new_status = data.get('status')
    remarks = data.get('remarks', 'Bulk action')
    
    if not ids or new_status not in ['approved', 'rejected']:
        return jsonify({'success': False, 'message': 'Invalid request'}), 400
        
    try:
        registrations = Registration.query.filter(Registration.id.in_(ids)).all()
        for r in registrations:
            r.status = new_status
            r.approved_by = current_user.id
            r.remarks = remarks
            r.review_date = datetime.utcnow()
            
            # ── Generate RSBSA ID upon bulk approval ──
            if new_status == 'approved':
                ben = Beneficiary.query.get(r.beneficiary_id)
                if ben and not ben.rsbsa_id:
                    year = datetime.now().year
                    muni_str = str(ben.municipality or "LAG").upper().replace(" ", "")
                    muni_prefix = muni_str[:3] if len(muni_str) >= 3 else muni_str.ljust(3, 'X')
                    
                    new_id = f"RS-{year}-{muni_prefix}-{random.randint(1000, 9999)}"
                    while Beneficiary.query.filter_by(rsbsa_id=new_id).first():
                        new_id = f"RS-{year}-{muni_prefix}-{random.randint(1000, 9999)}"
                    
                    ben.rsbsa_id = new_id
                    db.session.add(ben)
            
            # Notify Encoder
            ben = Beneficiary.query.get(r.beneficiary_id)
            ben_name = f"{ben.last_name}, {ben.first_name}" if ben else "Unknown"
            status_label = 'approved ✓' if new_status == 'approved' else 'rejected'
            
            db.session.add(Notification(
                user_id=r.encoded_by,
                message=f'Final Decision: {ben_name}\'s {r.form_type.upper()} submission has been {status_label} (bulk) by MAO {current_user.full_name}.',
                type=new_status,
                reference_id=r.id
            ))
            
            # Notify Verifier
            if r.verified_by:
                db.session.add(Notification(
                    user_id=r.verified_by,
                    message=f'Update: {ben_name}\'s submission (verified by you) was {status_label} (bulk) by MAO.',
                    type=new_status,
                    reference_id=r.id
                ))
        
        db.session.commit()
        
        # Invalidate caches after bulk review
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        cache.delete(f'mao_beneficiaries_{current_user.municipality}')
        cache.delete(f'verifier_stats_{current_user.municipality}')
        cache.delete(f'verifier_activity_{current_user.municipality}')
        # Invalidate encoder caches for all affected encoders
        encoder_ids = set(r.encoded_by for r in registrations if r.encoded_by)
        for eid in encoder_ids:
            cache.delete(f'encoder_stats_{eid}')
            cache.delete(f'encoder_activity_{eid}')
        
        return jsonify({'success': True, 'message': f'{len(registrations)} records updated'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@mao_bp.route('/api/registrations/export', methods=['GET'])
@mao_required
def export_registrations_csv():
    """Export registrations with professional filtering and formatting"""
    status = request.args.get('status')
    search = request.args.get('search', '').strip().lower()
    form_type = request.args.get('form_type')
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
    )

    query = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(muni_filter, Registration.is_deleted == False)

    if status and status != 'All Status':
        query = query.filter(Registration.status == status)
    
    if form_type and form_type != 'All Forms':
        query = query.filter(Registration.form_type == form_type)

    registrations = query.all()

    # Apply search filter (beneficiary name or barangay)
    if search:
        filtered = []
        for r in registrations:
            ben = Beneficiary.query.get(r.beneficiary_id)
            ben_name = ben.to_dict().get('full_name', '').lower() if ben else ""
            if search in ben_name or search in (ben.barangay or '').lower():
                filtered.append(r)
        registrations = filtered

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Beneficiary', 'Form Type', 'Barangay', 'Status', 'Date Submitted'])

    for r in registrations:
        ben = Beneficiary.query.get(r.beneficiary_id)
        ben_dict = ben.to_dict() if ben else {}
        writer.writerow([
            r.id,
            ben_dict.get('full_name', 'Unknown'),
            r.form_type.upper(),
            ben.barangay if ben else "N/A",
            r.status.capitalize(),
            r.created_at.strftime('%Y-%m-%d %H:%M:%S') if r.created_at else "N/A"
        ])

    output.seek(0)
    filename = f"mao_export_{muni}_{datetime.now().strftime('%Y%m%d')}.csv"
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

@mao_bp.route('/api/activity-feed', methods=['GET'])
@mao_required
def activity_feed():
    """Get recent activity feed for MAO dashboard"""
    muni = current_user.municipality
    
    # ── Production Cache ──
    cache_key = f'mao_activity_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    activities = []
    
    try:
        muni_filter = db.or_(
            Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%"),
        Beneficiary.municipality.ilike("%Laguna%") if muni.lower() == "mabitac" else False
        )
        recent_regs = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
            muni_filter,
            Registration.is_deleted == False
        ).order_by(desc(Registration.created_at)).limit(10).all()
        
        for r in recent_regs:
            ben = Beneficiary.query.get(r.beneficiary_id)
            ben_dict = ben.to_dict() if ben else {}
            ben_name = ben_dict.get('full_name', 'Unknown')
            status_label = 'Approved ✓' if r.status == 'approved' else ('Pending Review' if r.status == 'verified' else r.status.capitalize())
            act_type = 'success' if r.status == 'approved' else ('warning' if r.status == 'verified' else 'info')
            
            message = f"Registration for <strong>{ben_name}</strong> ({r.form_type.upper()}) is now <strong>{status_label}</strong>"
            if ben and ben.barangay:
                message += f" in Brgy. {ben.barangay}"

            activities.append({
                'message': message,
                'timestamp': r.created_at.isoformat() if r.created_at else None,
                'type': act_type
            })
    except Exception:
        pass
    
    result = {'success': True, 'activities': activities}
    cache.set(cache_key, result, timeout=120)
    return jsonify(result)


# ── Notification API Endpoints ───────────────────────────────────────────────

@mao_bp.route('/api/notifications', methods=['GET'])
@mao_required
def get_notifications():
    """Get recent notifications for current user"""
    notifs = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_at.desc()).limit(20).all()
    return jsonify({'success': True, 'notifications': [n.to_dict() for n in notifs]})

@mao_bp.route('/api/notifications/unread-count', methods=['GET'])
@mao_required
def unread_count():
    """Get count of unread notifications"""
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'success': True, 'count': count})

@mao_bp.route('/api/notifications/<int:nid>/read', methods=['POST'])
@mao_required
def mark_read(nid):
    """Mark a single notification as read"""
    notif = Notification.query.filter_by(id=nid, user_id=current_user.id).first()
    if notif:
        notif.is_read = True
        db.session.commit()
    return jsonify({'success': True})

@mao_bp.route('/api/notifications/read-all', methods=['POST'])
@mao_required
def mark_all_read():
    """Mark all notifications as read"""
    Notification.query.filter_by(user_id=current_user.id, is_read=False)\
        .update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})


# ── Trash Bin API Endpoints ──────────────────────────────────────────────────

@mao_bp.route('/api/registrations/<int:rid>/soft-delete', methods=['POST'])
@mao_required
def soft_delete_registration(rid):
    """Soft-delete a registration (move to trash)"""
    muni = current_user.municipality
    muni_filter = db.or_(
        Beneficiary.municipality.ilike(f"%{muni}%"),
        User.municipality.ilike(f"%{muni}%")
    )
    registration = Registration.query.join(Beneficiary).outerjoin(User, Registration.encoded_by == User.id).filter(
        Registration.id == rid, muni_filter
    ).first()
    if not registration:
        return jsonify({'success': False, 'message': 'Registration not found'}), 404
    if registration.is_deleted:
        return jsonify({'success': False, 'message': 'Already in trash'}), 400

    try:
        registration.is_deleted = True
        registration.deleted_at = datetime.utcnow()
        registration.deleted_by = current_user.id
        db.session.commit()
        cache.delete(f'mao_stats_{muni}')
        cache.delete(f'mao_activity_{muni}')
        cache.delete(f'mao_analytics_{muni}')
        return jsonify({'success': True, 'message': 'Moved to trash'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@mao_bp.route('/api/trash', methods=['GET'])
@mao_required
def get_trash():
    """Get soft-deleted registrations for MAO's municipality"""
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

@mao_bp.route('/api/trash/count', methods=['GET'])
@mao_required
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

@mao_bp.route('/api/trash/<int:rid>/restore', methods=['POST'])
@mao_required
def restore_from_trash(rid):
    registration = Registration.query.get(rid)
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404
    try:
        registration.is_deleted = False
        registration.deleted_at = None
        registration.deleted_by = None
        db.session.commit()
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        cache.delete(f'mao_beneficiaries_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Registration restored'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@mao_bp.route('/api/trash/<int:rid>/permanent', methods=['DELETE'])
@mao_required
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
        cache.delete(f'mao_stats_{current_user.municipality}')
        cache.delete(f'mao_activity_{current_user.municipality}')
        cache.delete(f'mao_analytics_{current_user.municipality}')
        cache.delete(f'mao_beneficiaries_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Permanently deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

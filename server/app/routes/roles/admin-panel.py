"""
Farm Connect - Admin Panel Routes
"""

from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, current_app
from flask_login import login_required, current_user
from sqlalchemy import func, desc

from app.routes.auth import admin_required
from app.models.user import User
from app.models.community_member import CommunityMember
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.registration import Registration, Beneficiary
from app.extensions import db, cache
from datetime import datetime, timedelta
import os
import json
import uuid
import traceback
from typing import List, Any
from app.utils.logging_helpers import log_activity

# Professional Coordinate Mapping (Centers of Mabitac Barangays)
BARANGAY_COORDS = {
    'Amuyong': [14.4172, 121.4170],
    'Antonio': [14.4382, 121.4398],
    'Mabitac': [14.4284, 121.4285],
    'Bayanihan': [14.4284, 121.4285],
    'Bayanihan (Mabitac)': [14.4284, 121.4285],
    'Nanguma': [14.4442, 121.4468],
    'Paagahan': [14.4111, 121.4086],
    'Pag-asa': [14.4258, 121.4322],
    'Libis ng Nayon': [14.4284, 121.4285],
    'Sinagtala': [14.4312, 121.4241],
    'Matalatala': [14.4082, 121.4352]
}

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/dashboard')
@admin_required
def dashboard():
    """Admin dashboard"""
    return render_template('roles/admin-panel.html')

@admin_bp.route('/api/stats', methods=['GET'])
@admin_required
def get_stats():
    muni = current_user.municipality
    if not muni:
        return jsonify({'success': False, 'message': 'Admin has no municipality assigned'}), 400

    # ── Production Cache: serve from memory if available ──
    cache_key = f'admin_stats_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    # Current counts
    total_users = User.query.filter(User.username != 'admin', User.municipality == muni).count()
    mao_count = User.query.filter(User.role == 'mao', User.municipality == muni).count()
    encoder_count = User.query.filter(User.role == 'encoder', User.municipality == muni).count()
    verifier_count = User.query.filter(User.role == 'verifier', User.municipality == muni).count()
    
    # Counts 30 days ago
    old_total = User.query.filter(User.username != 'admin', User.municipality == muni, User.created_at <= thirty_days_ago).count()
    old_mao = User.query.filter(User.role == 'mao', User.municipality == muni, User.created_at <= thirty_days_ago).count()
    old_encoder = User.query.filter(User.role == 'encoder', User.municipality == muni, User.created_at <= thirty_days_ago).count()
    old_verifier = User.query.filter(User.role == 'verifier', User.municipality == muni, User.created_at <= thirty_days_ago).count()

    def calc_trend(current, old):
        if old == 0:
            return 100 if current > 0 else 0
        return round(((current - old) / old) * 100)

    result = {
        'success': True,
        'stats': {
            'total_users': total_users,
            'mao_count': mao_count,
            'encoder_count': encoder_count,
            'verifier_count': verifier_count
        },
        'trends': {
            'total_users': calc_trend(total_users, old_total),
            'mao_count': calc_trend(mao_count, old_mao),
            'encoder_count': calc_trend(encoder_count, old_encoder),
            'verifier_count': calc_trend(verifier_count, old_verifier)
        }
    }
    cache.set(cache_key, result, timeout=300)
    return jsonify(result)

@admin_bp.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users in same municipality"""
    muni = current_user.municipality
    users = User.query.filter(User.username != 'admin', User.municipality == muni).all()
    
    users_data = []
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    for user in users:
        users_data.append({
            'id': user.id,
            'username': user.username,
            'full_name': user.full_name,
            'email': user.email,
            'role': user.role,
            'contact_no': user.contact_no,
            'is_active': user.is_active,
            'is_online': user.last_activity >= five_min_ago if user.last_activity else False,
            'last_activity': user.last_activity.strftime('%Y-%m-%d %H:%M') if user.last_activity else 'Never',
            'created_at': user.created_at.strftime('%Y-%m-%d %H:%M')
        })
    
    return jsonify({'success': True, 'users': users_data})

@admin_bp.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """Create new user in same municipality"""
    # Accept either JSON or Form Data
    if request.is_json:
        data = request.get_json()
    else:
        # Handling multipart/form-data
        data = request.form.to_dict()
    
    # Validate input
    required_fields = ['username', 'password', 'full_name', 'role']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'Missing field: {field}'}), 400
    
    # Check if username already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'success': False, 'message': 'Username already exists'}), 400
    
    # Check if email already exists (if provided)
    email = data.get('email', '').strip() or None
    if email and User.query.filter_by(email=email).first():
        return jsonify({'success': False, 'message': 'Email already in use'}), 400
    
    # Validate role is not admin
    if data['role'] not in ('mao', 'encoder', 'verifier'):
        return jsonify({'success': False, 'message': 'Invalid role selected'}), 400
        
    # Handle Optional Profile Image Upload
    avatar_url = None
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename:
            allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif'}
            ext = os.path.splitext(file.filename)[1].lower()
            if ext in allowed_extensions:
                unique_filename = f"{uuid.uuid4().hex}{ext}"
                upload_folder = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                
                try:
                    file.save(file_path)
                    avatar_url = url_for('static', filename=f'uploads/avatars/{unique_filename}')
                except Exception as e:
                    return jsonify({'success': False, 'message': f'Failed to save image: {str(e)}'}), 500
            else:
                return jsonify({'success': False, 'message': 'Invalid file type. Allowed: PNG, JPG, GIF'}), 400
    
    # Create new user with Admin's municipality
    new_user = User(
        username=data['username'],
        full_name=data['full_name'],
        email=email,
        role=data['role'],
        municipality=current_user.municipality,
        contact_no=data.get('contact_no'),
        avatar_url=avatar_url,
        is_active=True
    )
    new_user.set_password(data['password'])
    
    try:
        cache.delete(f'admin_stats_{current_user.municipality}')
        cache.delete(f'admin_activity_{current_user.municipality}')
        db.session.add(new_user)
        db.session.commit()
        
        # Real-time Map Update
        try:
            from app.extensions import socketio
            socketio.emit('staff_update', {
                'role': new_user.role,
                'municipality': new_user.municipality
            })
        except Exception:
            pass

        # Log the user creation action (Centralized utility handles storage + real-time broadcast)
        log_activity(
            action=f"Created {new_user.role.upper()} account",
            details=f"Username: {new_user.username}",
            user=current_user
        )
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Database error: {str(e)}'}), 500
    
    return jsonify({
        'success': True,
        'message': f'User {new_user.username} created successfully',
        'user': {
            'id': new_user.id,
            'username': new_user.username,
            'full_name': new_user.full_name,
            'email': new_user.email,
            'role': new_user.role,
            'contact_no': new_user.contact_no,
            'is_active': new_user.is_active
        }
    })

@admin_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update user (Must be same municipality)"""
    user = User.query.get_or_404(user_id)
    
    # Security check using strict strict equality
    if user.municipality != current_user.municipality:
        return jsonify({'success': False, 'message': 'Unauthorized access to this user'}), 403

    # Accept either JSON or Form Data
    if request.is_json:
        data = request.get_json()
    else:
        # Handling multipart/form-data
        data = request.form.to_dict()
    
    # Update fields
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'email' in data:
        email = data['email'].strip() or None
        # Ensure email uniqueness
        if email:
            existing = User.query.filter(User.email == email, User.id != user.id).first()
            if existing:
                return jsonify({'success': False, 'message': 'Email already in use'}), 400
        user.email = email
    if 'contact_no' in data:
        user.contact_no = data['contact_no']
    if 'is_active' in data:
        # Handle string booleans from form data
        val = data['is_active']
        if isinstance(val, str):
            user.is_active = val.lower() == 'true'
        else:
            user.is_active = bool(val)
    if 'password' in data and data['password']:
        user.set_password(data['password'])

    # Handle Optional Profile Image Upload
    if 'profile_image' in request.files:
        file = request.files['profile_image']
        if file and file.filename:
            allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif'}
            ext = os.path.splitext(file.filename)[1].lower()
            if ext in allowed_extensions:
                # Delete old avatar if it exists and is local
                if user.avatar_url and '/static/uploads/avatars/' in user.avatar_url:
                    old_filename = user.avatar_url.split('/')[-1]
                    old_path = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars', old_filename)
                    if os.path.exists(old_path):
                        try:
                            os.remove(old_path)
                        except Exception:
                            pass

                unique_filename = f"{uuid.uuid4().hex}{ext}"
                upload_folder = os.path.join(current_app.root_path, 'static', 'uploads', 'avatars')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                
                try:
                    file.save(file_path)
                    user.avatar_url = url_for('static', filename=f'uploads/avatars/{unique_filename}')
                except Exception as e:
                    return jsonify({'success': False, 'message': f'Failed to save image: {str(e)}'}), 500
            else:
                return jsonify({'success': False, 'message': 'Invalid file type. Allowed: PNG, JPG, GIF'}), 400
    
    user.updated_at = datetime.utcnow()
    db.session.commit()
    cache.delete(f'admin_stats_{current_user.municipality}')
    cache.delete(f'admin_activity_{current_user.municipality}')
    
    # Log the user update action (Centralized utility handles storage + real-time broadcast)
    log_activity(
        action=f"Updated User Profile",
        details=f"Updated details for: {user.username} ({user.role})",
        user=current_user
    )
    
    return jsonify({
        'success': True,
        'message': f'User {user.username} updated successfully'
    })

@admin_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete user (Must be same municipality)"""
    user = User.query.get_or_404(user_id)

    # Security check
    if user.municipality != current_user.municipality:
        return jsonify({'success': False, 'message': 'Unauthorized access to this user'}), 403
    
    # Don't allow deletion of admin user (or self)
    if user.role == 'admin' or user.id == current_user.id:
        return jsonify({'success': False, 'message': 'Cannot delete this user'}), 403
    
    username = user.username
    try:
        db.session.delete(user)
        db.session.commit()
        cache.delete(f'admin_stats_{current_user.municipality}')
        cache.delete(f'admin_activity_{current_user.municipality}')
        
        # Log the user deletion action (Centralized utility handles storage + real-time broadcast)
        log_activity(
            action=f"Deleted User Account",
            details=f"Deleted user: {username}",
            user=current_user
        )
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Database error: {str(e)}'}), 500
    
    return jsonify({
        'success': True,
        'message': f'User {username} deleted successfully'
    })

# Community Members Management
@admin_bp.route('/api/community-members', methods=['GET'])
@admin_required
def get_community_members():
    """Get all community members (public users)"""
    # Note: Community members might not be tied to a specific municipality in the same way staff are,
    # but we filter by Admin's municipality if they have one set in their profile.
    muni = current_user.municipality
    query = CommunityMember.query
    if muni:
        query = query.filter_by(municipality=muni)
    
    members = query.order_by(CommunityMember.created_at.desc()).all()
    
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    data = []
    for m in members:
        data.append({
            'id': m.id,
            'full_name': m.full_name,
            'email': m.email,
            'auth_provider': m.auth_provider,
            'last_login_at': m.last_login_at.strftime('%Y-%m-%d %H:%M') if m.last_login_at else 'Never',
            'is_online': m.last_activity >= five_min_ago if m.last_activity else False,
            'last_activity': m.last_activity.strftime('%Y-%m-%d %H:%M') if m.last_activity else 'Never',
            'is_active': m.is_active,
            'created_at': m.created_at.strftime('%Y-%m-%d %H:%M')
        })
    
    return jsonify({
        'success': True,
        'members': data
    })

@admin_bp.route('/api/community-members/<int:id>/toggle-status', methods=['POST'])
@admin_required
def toggle_member_status(id):
    """Enable/Disable community member account"""
    member = CommunityMember.query.get_or_404(id)
    
    # Municipality check if applicable
    if current_user.municipality and member.municipality != current_user.municipality:
         return jsonify({'success': False, 'message': 'Unauthorized'}), 403

    member.is_active = not member.is_active
    member.updated_at = datetime.utcnow()
    db.session.commit()
    
    status_str = "Enabled" if member.is_active else "Disabled"
    
    # Log the activity (Centralized utility handles storage + real-time broadcast)
    log_activity(
        action=f"{status_str} Community Member",
        details=f"Account for: {member.full_name}",
        user=current_user
    )
    cache.delete(f'admin_activity_{current_user.municipality}')

    return jsonify({
        'success': True,
        'message': f'Member account {status_str} successfully',
        'is_active': member.is_active
    })

@admin_bp.route('/api/activity-feed', methods=['GET'])
@admin_required
def activity_feed():
    """Get recent activity feed for the admin dashboard from AuditLog"""
    muni = current_user.municipality
    
    # ── Production Cache ──
    cache_key = f'admin_activity_{muni}'
    cached = cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    activities = []
    
    try:
        # Fetch recent audit logs for users in the same municipality
        logs = db.session.query(AuditLog, User).join(User, AuditLog.user_id == User.id).filter(
            User.municipality == muni
        ).order_by(AuditLog.timestamp.desc()).limit(15).all()
        
        for log, user in logs:
            activities.append({
                'message': f"{user.full_name}: {log.action}",
                'details': log.details,
                'timestamp': log.timestamp.isoformat(),
                'type': 'success' if 'login' in log.action.lower() or 'approved' in log.action.lower() or 'verified' in log.action.lower() else 'info'
            })
            
    except Exception as e:
        traceback.print_exc()
        activities = []
    
    result = {'success': True, 'activities': activities}
    cache.set(cache_key, result, timeout=120)
    return jsonify(result)

@admin_bp.route('/api/notifications', methods=['GET'])
@admin_required
def get_notifications():
    """Get recent notifications for admin (e.g., community logins)"""
    notifs = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_at.desc()).limit(20).all()
    return jsonify({'success': True, 'notifications': [n.to_dict() for n in notifs]})

@admin_bp.route('/api/notifications/unread-count', methods=['GET'])
@admin_required
def unread_count():
    """Get count of unread notifications"""
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'success': True, 'count': count})

@admin_bp.route('/api/notifications/<int:nid>/read', methods=['POST'])
@admin_required
def mark_read(nid):
    """Mark a single notification as read"""
    notif = Notification.query.filter_by(id=nid, user_id=current_user.id).first()
    if notif:
        notif.is_read = True
        db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/notifications/read-all', methods=['POST'])
@admin_required
def mark_all_read():
    """Mark all notifications as read"""
    Notification.query.filter_by(user_id=current_user.id, is_read=False)\
        .update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/online-users', methods=['GET'])
@admin_required
def get_online_users():
    """Get currently online staff and users (active in last 5 minutes)"""
    muni = current_user.municipality
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)

    # Online Staff (excluding admin)
    online_staff = User.query.filter(
        User.username != 'admin',
        User.municipality == muni,
        User.last_activity >= five_min_ago
    ).all()

    # Online Community Members
    online_community = CommunityMember.query.filter(
        CommunityMember.municipality == muni,
        CommunityMember.last_activity >= five_min_ago
    ).all()

    data = []
    for u in online_staff:
        data.append({
            'full_name': u.full_name,
            'role': u.role,
            'type': 'staff',
            'avatar_url': u.avatar_url
        })
    
    for c in online_community:
        data.append({
            'full_name': c.full_name,
            'role': 'Community Member',
            'type': 'community',
            'avatar_url': c.avatar_url
        })

    return jsonify({'success': True, 'users': data, 'count': len(data)})

@admin_bp.route('/api/gis/activity-heatmap', methods=['GET'])
@admin_required
def activity_heatmap():
    """Get heatmap points for staff activity and submissions"""
    # In a real app, we would query the Registration model for counts per barangay
    # and use that as the intensity. For now, we'll provide simulated intensities
    # that feel realistic based on the municipality.
    points = []
    
    # Simulation: Points with [lat, lng, intensity]
    # In production: points = [[b.lat, b.lng, b.submission_count] for b in barangays]
    for name, coords in BARANGAY_COORDS.items():
        # Mix of intensities for visual variety
        intensity = 0.4 if 'Mabitac' in name else 0.7 if 'Pag' in name else 0.5
        points.append([coords[0], coords[1], intensity])

    return jsonify({
        'success': True,
        'points': points
    })

@admin_bp.route('/api/gis/all-submissions', methods=['GET'])
@admin_required
def get_all_submissions_gis():
    """Get all registrations with their GIS/Geo data + Staff Activity"""
    muni = current_user.municipality
    if not muni:
        return jsonify({'success': False, 'message': 'Municipality not assigned'}), 400

    # Join Registration with Beneficiary to get names and verify municipality
    results = db.session.query(Registration, Beneficiary).join(
        Beneficiary, Registration.beneficiary_id == Beneficiary.id
    ).filter(
        Beneficiary.municipality == muni
    ).order_by(Registration.created_at.desc()).all()
    
    submissions_data = []
    
    for reg, ben in results:
        # ── Robust Coordinate Extraction ──
        # Check 'gis' (Verifier style) or 'parcels' (Encoder style)
        form_data = reg.data or {}
        gis_points = form_data.get('gis', [])
        parcels_data = form_data.get('parcels', [])
        
        main_coords = None
        
        # 1. Try Verifier-added GIS data
        if gis_points and len(gis_points) > 0:
            first_gis = gis_points[0]
            if isinstance(first_gis, dict):
                coords_list = first_gis.get('coords', [])
                if coords_list and len(coords_list) > 0:
                    main_coords = coords_list[0]
        
        # 2. Fallback to Encoder-added parcel coordinates (Pending items)
        if not main_coords and parcels_data and len(parcels_data) > 0:
            first_parcel = parcels_data[0]
            if isinstance(first_parcel, dict):
                lat = first_parcel.get('latitude')
                lng = first_parcel.get('longitude')
                if lat and lng:
                    try:
                        main_coords = [float(lat), float(lng)]
                    except (ValueError, TypeError):
                        pass

        # 3. Final Fallback to Barangay center if no specific coordinates found
        if not main_coords and ben.barangay:
             main_coords = BARANGAY_COORDS.get(ben.barangay)

        # ── Fetch Staff Names for tooltips ──
        encoder = User.query.get(reg.encoded_by) if reg.encoded_by else None
        verifier = User.query.get(reg.verified_by) if reg.verified_by else None

        submissions_data.append({
            'id': reg.id,
            'status': reg.status,
            'beneficiary_name': f"{ben.first_name} {ben.last_name}",
            'barangay': ben.barangay,
            'form_type': reg.form_type,
            'submission_date': reg.created_at.isoformat() if reg.created_at else None,
            'main_coords': main_coords,
            'geo_data': json.loads(reg.geo_data) if reg.geo_data else None,
            'encoder_name': encoder.full_name if encoder else "System",
            'verifier_name': verifier.full_name if verifier else "N/A"
        })
    
    # ── Staff Activity Tracking ──
    # Get ALL staff in this municipality
    active_staff_users = User.query.filter(
        User.municipality == muni,
        User.role.in_(['mao', 'encoder', 'verifier']),
        User.is_active == True
    ).all()
    
    staff_activity = []
    for staff in active_staff_users:
        last_loc = None
        # Use their last submission's barangay as their current "Post"
        last_sub = Registration.query.filter(
            db.or_(Registration.encoded_by == staff.id, Registration.verified_by == staff.id)
        ).order_by(Registration.created_at.desc()).first()
        
        current_barangay = "Active"
        if last_sub:
             ben = last_sub.beneficiary
             if ben and ben.barangay:
                 current_barangay = ben.barangay
        
        staff_activity.append({
            'id': staff.id,
            'name': staff.full_name,
            'role': staff.role,
            'last_barangay': current_barangay,
            'last_active': staff.last_activity.isoformat() if staff.last_activity else None
        })

    return jsonify({
        'success': True,
        'submissions': submissions_data,
        'staff': staff_activity
    })


# ── Trash Bin API Endpoints (Global Admin View) ─────────────────────────────

@admin_bp.route('/api/trash', methods=['GET'])
@admin_required
def get_trash():
    """Get ALL soft-deleted registrations (global admin view)"""
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
        deleted_by_user = User.query.get(s.deleted_by) if s.deleted_by else None
        data.append({
            'id': s.id,
            'beneficiary_name': ben.to_dict().get('full_name', 'Unknown') if ben else 'Unknown',
            'form_type': s.form_type,
            'encoder_name': encoder.full_name if encoder else 'Unknown',
            'deleted_by_name': deleted_by_user.full_name if deleted_by_user else 'Unknown',
            'status': s.status,
            'deleted_at': s.deleted_at.isoformat() if s.deleted_at else None,
            'created_at': s.created_at.isoformat() if s.created_at else None
        })
    return jsonify({'success': True, 'items': data})

@admin_bp.route('/api/trash/count', methods=['GET'])
@admin_required
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

@admin_bp.route('/api/trash/<int:rid>/restore', methods=['POST'])
@admin_required
def restore_from_trash(rid):
    registration = Registration.query.get(rid)
    if not registration or not registration.is_deleted:
        return jsonify({'success': False, 'message': 'Item not found in trash'}), 404
    try:
        registration.is_deleted = False
        registration.deleted_at = None
        registration.deleted_by = None
        db.session.commit()
        cache.delete(f'admin_stats_{current_user.municipality}')
        cache.delete(f'admin_activity_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Submission restored'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@admin_bp.route('/api/trash/<int:rid>/permanent', methods=['DELETE'])
@admin_required
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
        cache.delete(f'admin_stats_{current_user.municipality}')
        cache.delete(f'admin_activity_{current_user.municipality}')
        return jsonify({'success': True, 'message': 'Permanently deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

from datetime import datetime
from flask import request
from flask_login import current_user
from app.extensions import db
from app.models.audit_log import AuditLog
from app.socket_handlers import broadcast_activity

def log_activity(action, details=None, user=None):
    """
    Log an activity to AuditLog and broadcast it via Socket.IO
    """
    target_user = user or (current_user if current_user.is_authenticated else None)
    
    # Get IP address safely (handles case where not in request context)
    try:
        ip_address = request.remote_addr
    except RuntimeError:
        ip_address = '127.0.0.1'

    # Create DB entry
    log_entry = AuditLog(
        user_id=target_user.id if target_user else None,
        action=action,
        details=details,
        ip_address=ip_address,
        timestamp=datetime.utcnow()
    )
    
    try:
        db.session.add(log_entry)
        db.session.commit()
        
        # Broadcast real-time event
        activity_data = {
            'message': f"{target_user.full_name if target_user else 'System'}: {action}",
            'details': details,
            'user_role': target_user.role if target_user else 'system',
            'municipality': target_user.municipality if target_user else None,
            'timestamp': log_entry.timestamp.isoformat(),
            'type': 'success' if 'login' in action.lower() or 'approved' in action.lower() or 'verified' in action.lower() else 'info'
        }
        
        broadcast_activity(activity_data)
        return True
    except Exception as e:
        print(f"Error logging activity: {e}")
        db.session.rollback()
        return False

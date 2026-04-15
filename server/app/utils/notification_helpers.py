"""
Farm Connect - Notification Helpers
Shared notification query logic used by all role panel blueprints.
Eliminates duplication of identical notification endpoints across 4 files.
"""

from flask import jsonify
from flask_login import current_user
from app.extensions import db
from app.models.notification import Notification


def get_user_notifications(user_id, limit=20):
    """Get recent notifications for a user."""
    notifs = Notification.query.filter_by(user_id=user_id)\
        .order_by(Notification.created_at.desc()).limit(limit).all()
    return jsonify({'success': True, 'notifications': [n.to_dict() for n in notifs]})


def get_unread_count(user_id):
    """Get count of unread notifications for a user."""
    count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify({'success': True, 'count': count})


def mark_notification_read(notification_id, user_id):
    """Mark a single notification as read."""
    notif = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if notif:
        notif.is_read = True
        db.session.commit()
    return jsonify({'success': True})


def mark_all_notifications_read(user_id):
    """Mark all notifications as read for a user."""
    Notification.query.filter_by(user_id=user_id, is_read=False)\
        .update({'is_read': True})
    db.session.commit()
    return jsonify({'success': True})

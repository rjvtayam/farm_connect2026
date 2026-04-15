from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_login import current_user
from app.extensions import socketio

@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        # User joins a room based on their role
        role = getattr(current_user, 'role', 'community')
        join_room(role)

        # Personal room for targeted notification delivery
        join_room(f"user_{current_user.id}")
        
        # User also joins a municipality-specific room
        muni = getattr(current_user, 'municipality', 'unknown')
        if muni:
            muni_room = f"muni_{str(muni).lower().strip().replace(' ', '_')}"
            join_room(muni_room)
            from flask import current_app
            if current_app:
                current_app.logger.info(f"Socket connected: User {current_user.id} ({role}) joined rooms: {role}, user_{current_user.id}, {muni_room}")

@socketio.on('disconnect')
def handle_disconnect():
    if current_user.is_authenticated:
        from flask import current_app
        if current_app:
            current_app.logger.info(f"Socket disconnected: User {current_user.id}")

@socketio.on('join_submission')
def on_join_submission(data):
    """Joined when a verifier starts reviewing a specific submission"""
    submission_id = data.get('submission_id')
    if submission_id:
        join_room(f"submission_{submission_id}")

@socketio.on('leave_submission')
def on_leave_submission(data):
    submission_id = data.get('submission_id')
    if submission_id:
        leave_room(f"submission_{submission_id}")

def broadcast_new_submission(submission_data):
    """Broadcast to encoders and verifiers in the same municipality"""
    muni = submission_data.get('municipality', 'unknown')
    muni_room = f"muni_{str(muni).lower().strip().replace(' ', '_')}"
    
    socketio.emit('new_submission', submission_data, room='admin')
    socketio.emit('new_submission', submission_data, room=muni_room)

def broadcast_status_update(submission_id, status, reviewer_name, municipality=None):
    """Notify relevant parties about a status change"""
    payload = {
        'id': submission_id,
        'status': status,
        'verifier': reviewer_name
    }
    socketio.emit('status_updated', payload, room=f"submission_{submission_id}")

    # Also notify administrative rooms for dashboard live updates
    socketio.emit('status_updated', payload, room='admin')

    # Notify the municipality room so all role dashboards in that muni refresh
    if municipality:
        muni_room = f"muni_{str(municipality).lower().strip().replace(' ', '_')}"
        socketio.emit('status_updated', payload, room=muni_room)

def broadcast_new_notification(user_id):
    """Emit a lightweight event so the client refreshes its notification badge instantly.
    The client listens for 'new_notification' and calls loadNotificationCount()."""
    socketio.emit('new_notification', {'user_id': user_id}, room=f"user_{user_id}")

def broadcast_activity(activity_data):
    """Broadcast a new activity event to all administrators"""
    socketio.emit('new_activity', activity_data, room='admin')
    
    # Also broadcast to the municipality specific room if provided
    muni = activity_data.get('municipality')
    if muni:
        muni_room = f"muni_{muni.lower().replace(' ', '_')}"
        socketio.emit('new_activity', activity_data, room=muni_room)

"""
Farm Connect - Notification Model
Stores in-app notifications for role-based alerts.
"""

from app.extensions import db
from datetime import datetime


class Notification(db.Model):
    """
    Notification Model
    Used to alert Verifiers, MAO, and Encoders about form submissions,
    approvals, rejections, and other system events.
    """
    __tablename__ = 'notifications'

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    message    = db.Column(db.String(500), nullable=False)
    type       = db.Column(db.String(50), default='info')          # 'new_submission', 'approved', 'rejected', 'info'
    reference_id = db.Column(db.Integer, nullable=True)            # Registration ID for linking
    is_read    = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref=db.backref('notifications', lazy='dynamic'))

    def to_dict(self):
        return {
            'id':           self.id,
            'message':      self.message,
            'type':         self.type,
            'reference_id': self.reference_id,
            'is_read':      self.is_read,
            'created_at':   self.created_at.isoformat() if self.created_at else None,
        }

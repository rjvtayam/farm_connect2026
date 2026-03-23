"""
Farm Connect - Community Member Model
Public users who access the community via email, Facebook, or Google login.
"""

from app.extensions import db
from flask_login import UserMixin
from datetime import datetime


class CommunityMember(UserMixin, db.Model):
    """Community member model for public users"""

    __tablename__ = 'community_members'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)

    # Auth provider
    auth_provider = db.Column(db.Enum('email', 'facebook', 'google'), nullable=False, default='email')
    provider_id = db.Column(db.String(255), nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)

    # Profile
    municipality = db.Column(db.String(100), default='Mabitac')
    barangay = db.Column(db.String(100), nullable=True)
    contact_no = db.Column(db.String(20), nullable=True)
    bio = db.Column(db.Text, nullable=True)

    # Status
    is_active = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<CommunityMember {self.full_name} ({self.email})>'

"""
Farm Connect - User Model
Matches the database schema exactly
"""

from app.extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

class User(UserMixin, db.Model):
    """User model for all system users (Admin, MAO, Encoder, Verifier)"""
    
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=True)
    avatar_url = db.Column(db.String(255), nullable=True)
    role = db.Column(db.Enum('admin', 'mao', 'encoder', 'verifier'), nullable=False)
    municipality = db.Column(db.String(100), nullable=True)
    contact_no = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    two_factor_enabled = db.Column(db.Boolean, default=False)
    two_factor_secret = db.Column(db.String(32))
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    failed_login_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    nfc_card = db.relationship('NFCCard', backref='user', uselist=False, cascade='all, delete-orphan')
    registrations_encoded = db.relationship('Registration', foreign_keys='Registration.encoded_by', backref='encoder')
    registrations_verified = db.relationship('Registration', foreign_keys='Registration.verified_by', backref='verifier')
    registrations_approved = db.relationship('Registration', foreign_keys='Registration.approved_by', backref='approver')
    audit_logs = db.relationship('AuditLog', backref='user', lazy='dynamic')
    
    def set_password(self, password):
        """Hash and set the user's password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check if the provided password matches the hash"""
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        """Check if user is admin"""
        return self.role == 'admin'
    
    def is_mao(self):
        """Check if user is MAO"""
        return self.role == 'mao'
    
    def is_encoder(self):
        """Check if user is encoder"""
        return self.role == 'encoder'
    
    def is_verifier(self):
        """Check if user is verifier"""
        return self.role == 'verifier'
    
    def __repr__(self):
        return f'<User {self.username} ({self.role})>'


class NFCCard(db.Model):
    """NFC Card model for offline authentication"""
    
    __tablename__ = 'nfc_cards'
    
    id = db.Column(db.Integer, primary_key=True)
    card_uid = db.Column(db.String(50), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'))
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    last_used_at = db.Column(db.DateTime)
    
    def __repr__(self):
        return f'<NFCCard {self.card_uid} for User {self.user_id}>'

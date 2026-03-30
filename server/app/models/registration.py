from app.extensions import db
from datetime import datetime
import json

class Beneficiary(db.Model):
    """
    Beneficiary Model
    Represents a farmer, fisherfolk, or agri-worker applying for registration.
    """
    __tablename__ = 'beneficiaries'

    id = db.Column(db.Integer, primary_key=True)
    rsbsa_id = db.Column(db.String(50), unique=True, nullable=True) # Generated upon approval or manually entered
    
    # Personal Information
    first_name = db.Column(db.String(100), nullable=False)
    middle_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100), nullable=False)
    extension_name = db.Column(db.String(20))
    sex = db.Column(db.String(10))
    date_of_birth = db.Column(db.Date)
    place_of_birth = db.Column(db.String(200))
    civil_status = db.Column(db.String(20))
    spouse_name = db.Column(db.String(200))
    
    # Address
    address_street = db.Column(db.String(255))
    barangay = db.Column(db.String(100))
    municipality = db.Column(db.String(100))
    province = db.Column(db.String(100))
    region = db.Column(db.String(100))
    
    # Contact
    mobile_number = db.Column(db.String(20))
    landline = db.Column(db.String(20))
    
    # Photo
    photo_path = db.Column(db.String(255))
    
    # Additional Info
    educational_attainment = db.Column(db.String(50))
    govt_id_type = db.Column(db.String(50))
    govt_id_no = db.Column(db.String(50))
    is_pwd = db.Column(db.Boolean, default=False)
    is_4ps = db.Column(db.Boolean, default=False)
    is_ip = db.Column(db.Boolean, default=False)
    ip_group = db.Column(db.String(100))
    religion = db.Column(db.String(50))
    emergency_contact_name = db.Column(db.String(200))
    emergency_contact_no = db.Column(db.String(20))
    
    # Residency Status
    is_mabitac_resident = db.Column(db.Boolean, default=True)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    registrations = db.relationship('Registration', backref='beneficiary', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'first_name': self.first_name,
            'middle_name': self.middle_name,
            'last_name': self.last_name,
            'extension_name': self.extension_name,
            'full_name': " ".join(filter(None, [
                self.first_name,
                self.middle_name if self.middle_name and self.middle_name.lower() != 'none' else None,
                self.last_name,
                self.extension_name if self.extension_name and self.extension_name.lower() != 'none' else None
            ])).strip(),
            'rsbsa_id': self.rsbsa_id,
            'sex': self.sex,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'place_of_birth': self.place_of_birth,
            'civil_status': self.civil_status,
            'spouse_name': self.spouse_name,
            'is_mabitac_resident': self.is_mabitac_resident,
            'address': {
                'street': self.address_street,
                'barangay': self.barangay,
                'municipality': self.municipality,
                'province': self.province,
                'region': self.region
            },
            'barangay': self.barangay,
            'municipality': self.municipality,
            'province': self.province,
            'region': self.region,
            'mobile_number': self.mobile_number,
            'photo_path': self.photo_path,
            'educational_attainment': self.educational_attainment,
            'created_at': self.created_at.isoformat()
        }

class Registration(db.Model):
    """
    Registration Model
    Represents a specific form submission (RSBA, Fish, Boat, etc.)
    """
    __tablename__ = 'registrations'

    id = db.Column(db.Integer, primary_key=True)
    beneficiary_id = db.Column(db.Integer, db.ForeignKey('beneficiaries.id'), nullable=False)
    
    form_type = db.Column(db.String(50), nullable=False) # 'rsba', 'fish', 'boat', 'ncfrs'
    status = db.Column(db.String(20), default='pending') # 'pending', 'approved', 'rejected'
    
    # Tracking
    encoded_by = db.Column(db.Integer, db.ForeignKey('users.id')) # Encoder who submitted
    verified_by = db.Column(db.Integer, db.ForeignKey('users.id')) # Verifier who reviewed/actioned
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id')) # MAO/Admin who gave final approval (if applicable)
    
    # Concurrency Locking
    locked_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    locked_at = db.Column(db.DateTime)
    
    # Relationships for locking
    locked_by_user = db.relationship('User', foreign_keys=[locked_by_id])
    
    submission_date = db.Column(db.DateTime, default=datetime.utcnow)
    review_date = db.Column(db.DateTime)
    
    remarks = db.Column(db.Text) # For rejection or approval notes
    
    # Storing flexible form data (Farm profile, boat details, etc.)
    # Using Text for compatibility, but could be JSON type in Postgres/MySQL
    data_json = db.Column(db.Text)
    geo_data = db.Column(db.Text)
    
    # Soft Delete
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def data(self):
        if self.data_json:
            return json.loads(self.data_json)
        return {}

    @data.setter
    def data(self, value):
        self.data_json = json.dumps(value)

    def to_dict(self):
        # Safely check lock status — locked_at can be None
        is_locked = False
        if self.locked_by_id is not None and self.locked_at is not None:
            is_locked = (datetime.utcnow() - self.locked_at).total_seconds() < 900

        return {
            'id': self.id,
            'beneficiary': self.beneficiary.to_dict() if self.beneficiary else None,
            'form_type': self.form_type,
            'status': self.status,
            'submission_date': self.submission_date.isoformat() if self.submission_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'remarks': self.remarks,
            'data': self.data,
            'lock': {
                'is_locked': is_locked,
                'user_id': self.locked_by_id,
                'user_name': self.locked_by_user.full_name if self.locked_by_user else None,
                'locked_at': self.locked_at.isoformat() if self.locked_at else None
            },
            'is_deleted': self.is_deleted or False,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }

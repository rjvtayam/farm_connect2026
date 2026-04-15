"""
Farm Connect - Application Configuration
"""

import os
import secrets
import logging
from datetime import timedelta

class Config:
    """Base configuration"""
    
    # Secret key for session management
    # Falls back to a random key if not set — safe but forces re-login on restarts
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    if not os.environ.get('SECRET_KEY'):
        logging.getLogger(__name__).warning(
            'SECRET_KEY not set in environment — using auto-generated key. '
            'Sessions will not persist across restarts. Set SECRET_KEY in .env for production.'
        )
    
    # Database configuration for PostgreSQL (synchronous psycopg2 driver)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'postgresql://postgres:postgre021600@localhost:5432/farm_connect_project2026'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False  # Set to True for SQL debugging
    SQLALCHEMY_POOL_PRE_PING = True  # Test connections before using them
    
    # Session configuration
    SESSION_COOKIE_SECURE = False  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)
    
    # Upload folder configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx'}
    
    # Flask-Mail configuration (for email notifications)
    MAIL_SERVER = os.environ.get('MAIL_SERVER') or 'smtp.gmail.com'
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER')
    
    # Pagination
    ITEMS_PER_PAGE = 20
    
    # CSRF protection
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
    
    # Rate Limiting
    RATELIMIT_STORAGE_URI = 'memory://'

    # OTP Configuration
    OTP_EXPIRATION_SECONDS = 300  # 5 minutes — OTPs expire instead of living until session dies

    # Flask-Caching Configuration
    # SimpleCache: in-process memory cache, ideal for single-server production
    # Switch to 'RedisCache' and add CACHE_REDIS_URL for multi-server scaling
    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 300  # 5 minutes default

    # Google OAuth Configuration
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
    GOOGLE_DISCOVERY_URL = os.environ.get('GOOGLE_DISCOVERY_URL') or \
        "https://accounts.google.com/.well-known/openid-configuration"

    
class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    
class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True  # Require HTTPS
    SESSION_COOKIE_SAMESITE = 'Lax'
    
class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'postgresql://postgres:POSTGRESQL021600@localhost:5432/farm_connect_test'
    WTF_CSRF_ENABLED = False

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

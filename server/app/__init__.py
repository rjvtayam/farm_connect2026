"""
Farm Connect - Flask Application Factory
"""

from flask import Flask
from datetime import datetime
from app.config.config import config
from app.extensions import db, migrate, login_manager, csrf, mail, limiter, socketio, cache
import os

def create_app(config_name='development'):
    """
    Application factory pattern
    Creates and configures the Flask application
    """
    
    app = Flask(__name__, 
                template_folder='../../client/src/pages',
                static_folder='../../client/src')
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    socketio.init_app(app)
    cache.init_app(app)
    
    @app.before_request
    def update_last_activity():
        from flask_login import current_user
        if current_user.is_authenticated:
            try:
                current_user.last_activity = datetime.utcnow()
                db.session.commit()
            except Exception:
                db.session.rollback()
    
    # User loader for Flask-Login
    from app.models.user import User
    from app.models.audit_log import AuditLog
    from app.models.notification import Notification
    from app.models.community import CommunityPost, PostReaction, PostComment
    
    @login_manager.user_loader
    def load_user(user_id):
        from flask import session
        if session.get('is_community'):
            from app.models.community_member import CommunityMember
            return CommunityMember.query.get(int(user_id))
        return User.query.get(int(user_id))
    
    # Register blueprints
    from app.routes.main import main_bp
    from app.routes.auth import auth_bp
    from app.routes.roles import admin_bp, encoder_bp, verifier_bp, mao_bp
    from app.routes.forms import forms_bp
    from app.routes.community import community_bp
    from app.routes.auth.community_auth import community_auth_bp
    from app.routes.nfc_qr_feature.scanner import scanner_bp
    from flask import Blueprint
    
    # Register public folder as static asset source
    public_bp = Blueprint('public', __name__, 
                         static_folder='../../client/public',
                         static_url_path='/public')
    app.register_blueprint(public_bp)

    # Register uploads folder as static asset source
    uploads_bp = Blueprint('uploads', __name__, 
                          static_folder='../client/src/uploads',
                          static_url_path='/uploads')
    app.register_blueprint(uploads_bp)
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(encoder_bp, url_prefix='/encoder')
    app.register_blueprint(verifier_bp, url_prefix='/verifier')
    app.register_blueprint(mao_bp, url_prefix='/mao')
    app.register_blueprint(forms_bp, url_prefix='/forms')
    app.register_blueprint(community_bp, url_prefix='/community')
    app.register_blueprint(community_auth_bp, url_prefix='/auth')
    app.register_blueprint(scanner_bp, url_prefix='/api/scanner')
    
    # Error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        from flask import render_template
        return render_template('errors/404.html'), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        from flask import render_template
        db.session.rollback()
        return render_template('errors/500.html'), 500
    
    return app

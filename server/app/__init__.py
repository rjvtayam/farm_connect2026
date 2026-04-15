"""
Farm Connect - Flask Application Factory
"""

from flask import Flask
from datetime import datetime
from app.config.config import config
from app.extensions import db, migrate, login_manager, csrf, mail, limiter, socketio, cache
from app.config.logging_config import configure_logging, assign_request_id
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

    # ── Security Headers ─────────────────────────────────────────────────
    @app.after_request
    def set_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Permissions-Policy'] = 'geolocation=(self), camera=(), microphone=()'
        # CSP: allow same-origin + all CDNs actually used by the application
        # Audited across: encoder, verifier, mao, admin panels + forms + community + id-card
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' "
                "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com "
                "https://unpkg.com https://cdn.socket.io; "
            "style-src 'self' 'unsafe-inline' "
                "https://fonts.googleapis.com https://cdn.jsdelivr.net "
                "https://unpkg.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' ws: wss: "
                "https://accounts.google.com "
                "https://nominatim.openstreetmap.org "
                "https://*.tile.openstreetmap.org "
                "https://*.basemaps.cartocdn.com; "
            "frame-src 'self' blob: https://accounts.google.com; "
            "object-src 'self' blob:; "
            "base-uri 'self'"
        )
        response.headers['Content-Security-Policy'] = csp
        return response

    # ── Structured Logging ────────────────────────────────────────────────
    configure_logging(app)

    @app.before_request
    def _assign_request_id():
        assign_request_id()

    @app.before_request
    def update_last_activity():
        from flask_login import current_user
        from flask import session
        if current_user.is_authenticated:
            now = datetime.utcnow()
            # Throttle: only write to DB once per 60 seconds to reduce load
            last_ts = session.get('_last_activity_ts')
            if last_ts is None or (now - datetime.fromisoformat(last_ts)).total_seconds() > 60:
                try:
                    current_user.last_activity = now
                    db.session.commit()
                    session['_last_activity_ts'] = now.isoformat()
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
    
    # ── Error Handlers ────────────────────────────────────────────────────
    @app.errorhandler(400)
    def bad_request_error(error):
        from flask import render_template, request as req
        if req.accept_mimetypes.accept_json and not req.accept_mimetypes.accept_html:
            from flask import jsonify
            return jsonify({'success': False, 'message': 'Bad Request'}), 400
        return render_template('errors/400.html'), 400

    @app.errorhandler(403)
    def forbidden_error(error):
        from flask import render_template, request as req
        if req.accept_mimetypes.accept_json and not req.accept_mimetypes.accept_html:
            from flask import jsonify
            return jsonify({'success': False, 'message': 'Forbidden'}), 403
        return render_template('errors/403.html'), 403

    @app.errorhandler(404)
    def not_found_error(error):
        from flask import render_template, request as req
        if req.accept_mimetypes.accept_json and not req.accept_mimetypes.accept_html:
            from flask import jsonify
            return jsonify({'success': False, 'message': 'Not Found'}), 404
        return render_template('errors/404.html'), 404

    @app.errorhandler(429)
    def ratelimit_error(error):
        from flask import render_template, request as req
        if req.accept_mimetypes.accept_json and not req.accept_mimetypes.accept_html:
            from flask import jsonify
            return jsonify({'success': False, 'message': 'Too many requests. Please try again later.'}), 429
        return render_template('errors/429.html'), 429

    @app.errorhandler(500)
    def internal_error(error):
        from flask import render_template
        db.session.rollback()
        return render_template('errors/500.html'), 500

    # ── Health Check Endpoint ────────────────────────────────────────────
    @app.route('/health')
    def health_check():
        from flask import jsonify
        from datetime import datetime
        status = {'status': 'ok', 'timestamp': datetime.utcnow().isoformat()}
        try:
            db.session.execute(db.text('SELECT 1'))
            status['database'] = 'connected'
        except Exception:
            status['database'] = 'error'
            status['status'] = 'degraded'
        return jsonify(status), 200 if status['status'] == 'ok' else 503
    
    return app

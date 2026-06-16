"""
Farm Connect - Main Routes
Serves general pages and handles role-based redirects
"""

import os
from flask import Blueprint, render_template, redirect, url_for, send_file, make_response
from flask_login import current_user

main_bp = Blueprint('main', __name__)


@main_bp.route('/sw.js')
def service_worker():
    """Serve the service worker from root path (required for SW scope)."""
    sw_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'client', 'public', 'sw.js')
    sw_path = os.path.normpath(sw_path)
    response = make_response(send_file(sw_path, mimetype='application/javascript'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

@main_bp.route('/')
def index():
    """Home page - redirect to appropriate panel if logged in, otherwise show landing page"""
    if current_user.is_authenticated:
        # Community members don't have role-checking methods
        if not hasattr(current_user, 'is_admin'):
            return redirect(url_for('community.feed_page'))
        # Redirect to role-specific dashboard
        if current_user.is_admin():
            return redirect(url_for('admin.dashboard'))
        elif current_user.is_mao():
            return redirect(url_for('mao.dashboard'))
        elif current_user.is_encoder():
            return redirect(url_for('encoder.dashboard'))
        elif current_user.is_verifier():
            return redirect(url_for('verifier.dashboard'))
    
    # Not logged in - show landing page
    return render_template('index.html')

@main_bp.route('/privacy-policy')
def privacy_policy():
    return render_template('legal/privacy-policy.html')

@main_bp.route('/cookie-policy')
def cookie_policy():
    return render_template('legal/cookie-policy.html')

@main_bp.route('/terms-of-service')
def terms_of_service():
    return render_template('legal/terms-of-service.html')
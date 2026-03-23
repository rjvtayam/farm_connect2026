"""
Farm Connect - Authentication Blueprint
Handles login, logout, role-based access, and trusted device management.
"""

from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, session, current_app, make_response
from flask_login import login_user, logout_user, login_required, current_user
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from functools import wraps
from threading import Thread
import random
import string
import re
import os
import secrets
import pyotp
import qrcode
import io
import base64
from datetime import datetime, timedelta

from app.models.user import User, NFCCard
from app.models.auth import PasswordResetToken
from app.extensions import db, limiter, mail
from flask_mail import Message
from werkzeug.utils import secure_filename
from app.utils.logging_helpers import log_activity

auth_bp = Blueprint('auth', __name__)

TRUST_COOKIE_PREFIX = 'trusted_device_'
TRUST_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days in seconds


def _trust_cookie_name(user_id):
    """Per-user cookie name so multiple accounts can be trusted on the same browser."""
    return f"{TRUST_COOKIE_PREFIX}{user_id}"


def generate_trust_token(user_id):
    """Generate a signed trust token for the given user ID."""
    s = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return s.dumps({'uid': user_id}, salt='trusted-device')


def verify_trust_token(token, user_id):
    """Verify a trust token matches the user ID and is not expired (30 days)."""
    s = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        data = s.loads(token, salt='trusted-device', max_age=TRUST_COOKIE_MAX_AGE)
        # Robust comparison: convert both to strings to avoid potential type mismatches (int vs str)
        matches = str(data.get('uid')) == str(user_id)
        return matches
    except (BadSignature, SignatureExpired) as e:
        current_app.logger.warning(f"Trust token verification failed: {str(e)}")
        return False

# Role-based decorators
def admin_required(f):
    """Decorator to require admin role"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin():
            flash('Access denied. Admin privileges required.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

def mao_required(f):
    """Decorator to require MAO role"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_mao():
            flash('Access denied. MAO privileges required.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

def encoder_required(f):
    """Decorator to require encoder role"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_encoder():
            flash('Access denied. Encoder privileges required.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

def verifier_required(f):
    """Decorator to require verifier role"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_verifier():
            flash('Access denied. Verifier privileges required.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def login():
    """Login page and handler"""
    
    # Redirect if already logged in
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user.role)
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        email = request.form.get('email', '').strip()
        selected_role = request.form.get('role', '').lower().strip()
        selected_municipality = request.form.get('municipality', '').strip()
        remember = request.form.get('remember', '') in ('true', 'on', '1', 'True')
        
        if not (username or email) or not password:
            flash('Please enter your credentials.', 'warning')
            return render_template('auth/login.html')
        
        try:
            # Find user by username OR email
            user = None
            if username:
                user = User.query.filter_by(username=username).first()
            
            if not user and email:
                user = User.query.filter_by(email=email).first()
            
            if user is None:
                current_app.logger.warning(f"Login failed: No user found for username='{username}' email='{email}'")
                flash('Invalid credentials.', 'danger')
                return render_template('auth/login.html')
            
            # Account Lockout Check
            if user.locked_until and user.locked_until > datetime.utcnow():
                flash(f'Account is locked due to too many failed attempts. Try again later.', 'danger')
                return render_template('auth/login.html')
            
            if not user.check_password(password):
                user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
                if user.failed_login_attempts >= 5:
                    user.locked_until = datetime.utcnow() + timedelta(minutes=15)
                    flash('Account locked for 15 minutes due to too many failed attempts.', 'danger')
                else:
                    flash('Invalid credentials.', 'danger')
                db.session.commit()
                current_app.logger.warning(f"Login failed: Password mismatch for user '{user.username}' (ID: {user.id})")
                return render_template('auth/login.html')
            
            if not user.is_active:
                flash('Your account has been deactivated. Please contact an administrator.', 'danger')
                return render_template('auth/login.html')
                
            # Reset lockout counters on success
            if user.failed_login_attempts > 0 or user.locked_until:
                user.failed_login_attempts = 0
                user.locked_until = None
                db.session.commit()
            
            # ── Trusted/2FA Flow ──────────────────────────────────────
            trust_cookie = request.cookies.get(_trust_cookie_name(user.id))
            is_trusted = trust_cookie and verify_trust_token(trust_cookie, user.id)
            
            can_do_2fa = user.two_factor_enabled or bool(user.email)
            
            # Skip 2FA if device is trusted OR user has no way to do 2FA
            if is_trusted or not can_do_2fa:
                login_user(user, remember=remember)
                current_app.logger.info(f"Direct login for '{user.username}' (Trusted: {is_trusted}, 2FA Capable: {can_do_2fa})")
                log_activity('Login', 'Standard login entry points', user)
                
                response = make_response(redirect_to_dashboard(user.role))
                # Set/Refresh trust cookie if remember-me is requested
                if remember:
                    trust_token = generate_trust_token(user.id)
                    response.set_cookie(
                        _trust_cookie_name(user.id),
                        trust_token,
                        max_age=TRUST_COOKIE_MAX_AGE,
                        httponly=True,
                        samesite='Lax',
                        path='/',
                        secure=request.is_secure
                    )
                return response

            # ── Standard 2FA Flow (if enabled and not trusted) ────────
            otp_code = ''.join(random.choices(string.digits, k=6))
            
            # Store in session
            session['2fa_user_id'] = user.id
            session['remember_me'] = remember
            
            # Only map and send email OTP if they have an email
            if user.email:
                session['login_otp'] = otp_code
                current_app.logger.info(f"Login OTP generated for user '{user.username}'")
                
                # Send Email Asynchronously
                def send_async_email(app, msg):
                    with app.app_context():
                        try:
                            mail.send(msg)
                        except Exception as e:
                            app.logger.error(f"Error sending OTP email: {e}")

                msg = Message('Login Verification Code - Farm Connect',
                              sender=current_app.config.get('MAIL_DEFAULT_SENDER'),
                              recipients=[user.email])
                msg.body = f"Your verification code is: {otp_code}"
                msg.html = f"<h3>Your Login Verification Code</h3><p>Use the following code to complete your login:</p><h2>{otp_code}</h2>"
                Thread(target=send_async_email, args=(current_app._get_current_object(), msg)).start()
            else:
                session.pop('login_otp', None)
                
            return redirect(url_for('auth.verify_2fa'))
            
        except Exception as e:
            current_app.logger.error(f"Login error: {e}", exc_info=True)
            flash('An error occurred during login. Please try again.', 'danger')
            return render_template('auth/login.html')
    
    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    """Logout handler — keeps trusted-device cookie so returning users skip 2FA."""
    username = current_user.username
    log_activity('Logout', 'User signed out', current_user)
    logout_user()
    flash('You have been logged out successfully.', 'success')
    return redirect(url_for('auth.login'))

@auth_bp.route('/nfc-login', methods=['POST'])
def nfc_login():
    """NFC card based login"""
    data = request.get_json()
    card_uid = data.get('card_uid')
    
    if not card_uid:
        return jsonify({'success': False, 'message': 'No card UID provided'}), 400
    
    nfc_card = NFCCard.query.filter_by(card_uid=card_uid, is_active=True).first()
    
    if not nfc_card or not nfc_card.user:
        return jsonify({'success': False, 'message': 'Invalid card or card not assigned'}), 404
    
    user = nfc_card.user
    
    if not user.is_active:
        return jsonify({'success': False, 'message': 'Account deactivated'}), 403
    
    # Update last used time
    nfc_card.last_used_at = datetime.utcnow()
    db.session.commit()
    
    # Log user in
    login_user(user)
    
    # Get redirect URL based on role
    dashboard_url = get_dashboard_url(user.role)
    
    return jsonify({
        'success': True,
        'message': f'Welcome, {user.full_name}',
        'redirect': dashboard_url,
        'role': user.role
    })

def redirect_to_dashboard(role):
    """Redirect user to their role-specific dashboard"""
    dashboard_url = get_dashboard_url(role)
    return redirect(dashboard_url)

def get_dashboard_url(role):
    """Get the dashboard URL for a given role"""
    role_dashboards = {
        'admin': url_for('admin.dashboard'),
        'mao': url_for('mao.dashboard'),
        'encoder': url_for('encoder.dashboard'),
        'verifier': url_for('verifier.dashboard')
    }
    return role_dashboards.get(role, url_for('main.index'))

# Removed debug route as part of security review

# ============================================================
# JSON Login API (for AJAX front-end)
# ============================================================
@auth_bp.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def api_login():
    """JSON-based login handler for AJAX requests.
    Supports trusted-device cookies to skip 2FA on remembered devices.
    """
    
    if current_user.is_authenticated:
        return jsonify({
            'success': True,
            'redirect': get_dashboard_url(current_user.role),
            'message': 'Already logged in'
        })
    
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '')
    email = request.form.get('email', '').strip()
    selected_role = request.form.get('role', '').lower().strip()
    remember = request.form.get('remember', '') in ('true', 'on', '1', 'True')
    
    if not (username or email) or not password:
        return jsonify({'success': False, 'message': 'Please enter your credentials.'}), 400
    
    try:
        # Find user by username OR email
        user = None
        if username:
            user = User.query.filter_by(username=username).first()
        if not user and email:
            user = User.query.filter_by(email=email).first()
        
        if user is None:
            current_app.logger.warning(f"API Login failed: No user found for username='{username}' email='{email}'")
            return jsonify({'success': False, 'message': 'Invalid credentials. Please check your username and password.'}), 401
        
        # Account Lockout Check
        if user.locked_until and user.locked_until > datetime.utcnow():
            return jsonify({'success': False, 'message': 'Account is locked due to too many failed attempts. Try again later.'}), 403
            
        if not user.check_password(password):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
                db.session.commit()
                return jsonify({'success': False, 'message': 'Account locked for 15 minutes due to too many failed attempts.'}), 403
            
            db.session.commit()
            current_app.logger.warning(f"API Login failed: Password mismatch for user '{user.username}' (ID: {user.id})")
            return jsonify({'success': False, 'message': 'Invalid credentials. Please check your username and password.'}), 401
        
        if not user.is_active:
            return jsonify({'success': False, 'message': 'Your account has been deactivated. Please contact an administrator.'}), 403
            
        # Reset lockout counters on success
        if user.failed_login_attempts > 0 or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
            db.session.commit()
        
        # Validate selected role
        if selected_role and selected_role != user.role:
            return jsonify({
                'success': False,
                'message': f'Role mismatch: You selected "{selected_role.capitalize()}" but your account role is "{user.role.capitalize()}". Please select the correct role.'
            }), 403
        
        # ── Trusted/2FA Flow ──────────────────────────────────────
        trust_cookie = request.cookies.get(_trust_cookie_name(user.id))
        is_trusted = trust_cookie and verify_trust_token(trust_cookie, user.id)
        
        can_do_2fa = user.two_factor_enabled or bool(user.email)
        
        # Skip 2FA if device is trusted OR user has no way to do 2FA
        if is_trusted or not can_do_2fa:
            login_user(user, remember=remember)
            current_app.logger.info(f"API Direct login for '{user.username}' (Trusted: {is_trusted}, 2FA Capable: {can_do_2fa})")
            log_activity('Login', 'Ajax API login', user)
            
            resp_data = {
                'success': True,
                'skip_2fa': True,
                'is_trusted': bool(is_trusted),
                'message': 'Welcome back! Logging in...',
                'redirect': get_dashboard_url(user.role),
                'role': user.role
            }
            resp = make_response(jsonify(resp_data))
            
            # Set/Refresh trust cookie if remember-me is requested
            if remember:
                trust_token = generate_trust_token(user.id)
                resp.set_cookie(
                    _trust_cookie_name(user.id),
                    trust_token,
                    max_age=TRUST_COOKIE_MAX_AGE,
                    httponly=True,
                    samesite='Lax',
                    path='/',
                    secure=request.is_secure
                )
            return resp

        # ── Standard 2FA Flow (if enabled and not trusted) ────────
        otp_code = ''.join(random.choices(string.digits, k=6))
        
        # Store in session
        session['2fa_user_id'] = user.id
        session['remember_me'] = remember
        
        response_message = 'Please enter your Authenticator code. Redirecting to 2FA...'
        
        # Only map and send email OTP if they have an email
        if user.email:
            session['login_otp'] = otp_code
            current_app.logger.info(f"API Login OTP generated for user '{user.username}'")
            
            # Send Email Asynchronously
            def send_async_email(app, msg):
                with app.app_context():
                    try:
                        mail.send(msg)
                    except Exception as e:
                        app.logger.error(f"Error sending OTP email: {e}")

            msg = Message('Login Verification Code - Farm Connect',
                          sender=current_app.config.get('MAIL_DEFAULT_SENDER') or 'no-reply@farmconnect.com',
                          recipients=[user.email])
            msg.body = f"Your verification code is: {otp_code}"
            msg.html = f"<h3>Your Login Verification Code</h3><p>Use the following code to complete your login:</p><h2>{otp_code}</h2>"
            Thread(target=send_async_email, args=(current_app._get_current_object(), msg)).start()
            
            response_message = 'Verification code sent to email. Redirecting to 2FA...'
        else:
            session.pop('login_otp', None)
        
        return jsonify({
            'success': True,
            'skip_2fa': False,
            'message': response_message,
            'redirect': url_for('auth.verify_2fa'),
            'role': user.role
        })
        
    except Exception as e:
        current_app.logger.error(f"API Login error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred during login. Please try again.'}), 500


@auth_bp.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        
        if not email or not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            flash('Please enter a valid email address.', 'warning')
            return render_template('auth/forgot_password.html')

        # 2. Check if user exists with this email
        user = User.query.filter_by(email=email).first()
        
        if user:
            # Generate reset token
            token = secrets.token_urlsafe(32)
            
            # Store token in database
            from app.models.auth import PasswordResetToken
            from datetime import datetime, timedelta
            
            # Invalidate any existing tokens
            PasswordResetToken.query.filter_by(user_id=user.id, is_used=False).update({'is_used': True})
            
            # Create new token
            reset_token = PasswordResetToken(
                user_id=user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=1)
            )
            db.session.add(reset_token)
            db.session.commit()
            
            # Send email
            try:
                send_reset_email(user.email, token)
                # Success case
            except Exception as e:
                current_app.logger.error(f"Error sending email: {e}")
                flash('An error occurred while sending the email. Please try again later.', 'danger')
                return render_template('auth/forgot_password.html')
            
        # 3. Show standard security message (whether user exists or not) 
        # and STAY on the page so user isn't confused by a redirect.
        flash('If an account exists with that email, a password reset link has been sent.', 'info')
        return render_template('auth/forgot_password.html')
        
    return render_template('auth/forgot_password.html')

def send_reset_email(to_email, token):
    """Send password reset email"""
    from flask_mail import Message
    from app.extensions import mail
    
    reset_url = url_for('auth.reset_password', token=token, _external=True)
    
    msg = Message('Password Reset Request - Farm Connect',
                  recipients=[to_email])
                  
    msg.body = f'''To reset your password, visit the following link:
{reset_url}

If you did not make this request then simply ignore this email and no changes will be made.
'''
    msg.html = f'''
<p>To reset your password, click the following link:</p>
<p><a href="{reset_url}">{reset_url}</a></p>
<p>If you did not make this request then simply ignore this email and no changes will be made.</p>
'''
    mail.send(msg)


@auth_bp.route('/enable-2fa', methods=['GET', 'POST'])
@login_required
def enable_2fa():
    """Enable Two-Factor Authentication"""
    
    if request.method == 'POST':
        # Verify the token to enable 2FA
        verification_code = request.form.get('verification_code')
        secret = session.get('2fa_secret')
        
        if not secret:
            flash('Session expired. Please try again.', 'danger')
            return redirect(url_for('auth.enable_2fa'))
            
        totp = pyotp.TOTP(secret)
        if totp.verify(verification_code):
            # Enable 2FA for user
            current_user.two_factor_secret = secret
            current_user.two_factor_enabled = True
            db.session.commit()
            
            flash('Two-Factor Authentication has been enabled successfully.', 'success')
            return redirect_to_dashboard(current_user.role)
        else:
            flash('Invalid verification code. Please try again.', 'danger')
            
    # Generate new secret if not in session
    if '2fa_secret' not in session:
        session['2fa_secret'] = pyotp.random_base32()
        
    secret = session['2fa_secret']
    
    # Generate QR Code
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=current_user.email or current_user.username,
        issuer_name="Farm Connect"
    )
    
    # Create QR code image
    img = qrcode.make(provisioning_uri)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_code = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    return render_template('auth/enable_2fa.html', qr_code=qr_code, secret=secret)

@auth_bp.route('/verify-2fa', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def verify_2fa():
    """Verify 2FA code during login.
    On success with remember_me, sets a trusted-device cookie to skip 2FA next time.
    """
    current_app.logger.info(f"Verify 2FA accessed. Method: {request.method}. Session keys: {list(session.keys())}")
    
    if '2fa_user_id' not in session:
        current_app.logger.warning("Verify 2FA failed: '2fa_user_id' missing from session. Redirecting to login.")
        return redirect(url_for('auth.login'))
        
    # Get user from session (temporary storage during 2FA check)
    user_id = session['2fa_user_id']
    user = User.query.get(user_id)
    
    if not user:
        current_app.logger.warning(f"Verify 2FA failed: User ID {user_id} not found in DB.")
        session.pop('2fa_user_id', None)
        return redirect(url_for('auth.login'))
        
    if request.method == 'POST':
        verification_code = request.form.get('verification_code')
        remember = session.get('remember_me', False)
        
        session_otp = session.get('login_otp')
        
        # Check TOTP (Authenticator App)
        is_totp_valid = False
        if user.two_factor_enabled and user.two_factor_secret:
            try:
                totp = pyotp.TOTP(user.two_factor_secret)
                is_totp_valid = totp.verify(verification_code)
            except Exception as e:
                current_app.logger.error(f"TOTP verification error: {e}")
                
        # Check Email OTP
        is_email_valid = session_otp and verification_code == session_otp
        
        current_app.logger.info(f"Verifying 2FA for user {user.username}. Input: {verification_code}, Email OTP Valid: {is_email_valid}, TOTP Valid: {is_totp_valid}")
        
        if is_email_valid or is_totp_valid:
            # Complete login
            login_user(user, remember=remember)
            current_app.logger.info(f"User {user.username} logged in successfully via 2FA.")
            log_activity('Login', '2FA verified login', user)
            
            # Clear 2FA session data including attempt history
            session.pop('2fa_user_id', None)
            session.pop('remember_me', None)
            session.pop('login_otp', None)
            session.pop('2fa_attempts', None)
            
            # ── Set Trusted Device Cookie if Remember Me was checked ──
            response = make_response(redirect(get_dashboard_url(user.role)))
            if remember:
                trust_token = generate_trust_token(user.id)
                response.set_cookie(
                    _trust_cookie_name(user.id),
                    trust_token,
                    max_age=TRUST_COOKIE_MAX_AGE,
                    httponly=True,
                    samesite='Lax',
                    path='/',
                    secure=request.is_secure,  # True in production (HTTPS)
                )
                current_app.logger.info(f"Trusted device cookie set for user '{user.username}' (path=/).")            
            return response
        else:
            current_app.logger.warning(f"OTP verification failed for user {user.username}.")
            
            # Record failed attempt
            attempts = session.get('2fa_attempts', 0) + 1
            if attempts >= 3:
                session.pop('login_otp', None)
                session.pop('2fa_attempts', None)
                flash('Too many failed attempts. Verification code invalidated. Please request a new one.', 'danger')
            else:
                session['2fa_attempts'] = attempts
                flash('Invalid verification code.', 'danger')
            
    return render_template('auth/verify_2fa.html')

@auth_bp.route('/resend-2fa', methods=['POST'])
@limiter.limit("3 per minute")
def resend_2fa():
    """Resend 2FA verification code via email"""
    if '2fa_user_id' not in session:
        return jsonify({'success': False, 'message': 'Session expired. Please login again.'}), 401
    
    user_id = session['2fa_user_id']
    user = User.query.get(user_id)
    
    if not user:
        session.pop('2fa_user_id', None)
        return jsonify({'success': False, 'message': 'User not found. Please login again.'}), 404
    
    try:
        import random
        import string
        from threading import Thread
        from flask_mail import Message
        from app.extensions import mail
        
        # Generate new OTP
        otp_code = ''.join(random.choices(string.digits, k=6))
        session['login_otp'] = otp_code
        
        current_app.logger.info(f"Resend OTP for user '{user.username}' (role: {user.role})")
        
        def send_async_email(app, msg):
            with app.app_context():
                try:
                    mail.send(msg)
                except Exception as e:
                    app.logger.error(f"Error resending OTP email: {e}")
        
        if user.email:
            msg = Message('Login Verification Code - Farm Connect',
                          sender=current_app.config.get('MAIL_DEFAULT_SENDER') or 'no-reply@farmconnect.com',
                          recipients=[user.email])
            msg.body = f"Your new verification code is: {otp_code}"
            msg.html = f"<h3>Your New Verification Code</h3><p>Use the following code to complete your login:</p><h2>{otp_code}</h2><p>This code will expire shortly.</p>"
            Thread(target=send_async_email, args=(current_app._get_current_object(), msg)).start()
            
            return jsonify({
                'success': True,
                'message': 'A new verification code has been sent to your email.'
            })
        else:
            current_app.logger.warning(f"User '{user.username}' has no email - OTP: {otp_code}")
            return jsonify({
                'success': True,
                'message': 'Verification code regenerated (no email on file).'
            })
            
    except Exception as e:
        current_app.logger.error(f"Resend 2FA error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to resend code. Please try again.'}), 500


@auth_bp.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    """Reset password using token"""
    if current_user.is_authenticated:
        return redirect_to_dashboard(current_user.role)
        
    from datetime import datetime
    
    # Verify token
    reset_token = PasswordResetToken.query.filter_by(token=token, is_used=False).first()
    
    if not reset_token or reset_token.expires_at < datetime.utcnow():
        flash('Invalid or expired password reset link.', 'danger')
        return redirect(url_for('auth.login'))
        
    if request.method == 'POST':
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if not password or not confirm_password:
            flash('Please fill in all fields.', 'warning')
            return render_template('auth/reset_password.html')
            
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return render_template('auth/reset_password.html')
            
        # Update password
        user = reset_token.user
        user.set_password(password)
        
        # Mark token as used
        reset_token.is_used = True
        db.session.commit()
        
        flash('Your password has been reset successfully. You can now login.', 'success')
        return redirect(url_for('auth.login'))
        
    return render_template('auth/reset_password.html')

@auth_bp.route('/update-profile', methods=['POST'])
@login_required
def update_profile():
    """Update user profile (Name, Password, Avatar)"""
    # Check if this is a multipart request (file upload) or JSON
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form

    try:
        # Update Full Name
        if 'full_name' in data and data['full_name']:
            current_user.full_name = data['full_name']
            
        # Update Password if provided
        if 'new_password' in data and data['new_password']:
            if len(data['new_password']) < 8:
                return jsonify({'success': False, 'message': 'Password must be at least 8 characters'}), 400
            current_user.set_password(data['new_password'])

        # Handle Profile Image Upload
        if 'profile_image' in request.files:
            file = request.files['profile_image']
            if file and file.filename != '':
                # Validation
                ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
                def allowed_file(filename):
                    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
                
                if allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    # Unique filename to prevent cache issues
                    import uuid
                    unique_filename = f"{current_user.id}_{str(uuid.uuid4().hex)[:8]}_{filename}"
                    
                    upload_folder = os.path.abspath(os.path.join(current_app.root_path, '..', 'client', 'src', 'uploads', 'roles', 'avatars'))
                    os.makedirs(upload_folder, exist_ok=True)
                    
                    file_path = os.path.join(upload_folder, unique_filename)
                    file.save(file_path)
                    
                    # Store URL path using the 'uploads' blueprint
                    current_user.avatar_url = url_for('uploads.static', filename=f'roles/avatars/{unique_filename}')
                else:
                    return jsonify({'success': False, 'message': 'Invalid file type. Allowed: png, jpg, jpeg, gif'}), 400

        db.session.commit()
        return jsonify({
            'success': True, 
            'message': 'Profile updated successfully',
            'avatar_url': current_user.avatar_url
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Profile update error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred while updating profile'}), 500

@auth_bp.route('/delete-account', methods=['DELETE'])
@login_required
def delete_account():
    """Delete current user account"""
    data = request.get_json()
    password = data.get('password')
    
    if not password:
        return jsonify({'success': False, 'message': 'Password is required to confirm deletion'}), 400
        
    # Verify password
    if not current_user.check_password(password):
        return jsonify({'success': False, 'message': 'Incorrect password'}), 403
        
    try:
        # Delete user
        db.session.delete(current_user)
        db.session.commit()
        
        # Logout
        logout_user()
        
        return jsonify({'success': True, 'message': 'Account deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Account deletion error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred during account deletion'}), 500

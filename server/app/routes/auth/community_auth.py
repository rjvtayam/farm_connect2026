"""
Farm Connect - Community Authentication
Handles Google and Facebook OAuth for public members
"""

import requests
import json
import os
import secrets
from flask import Blueprint, redirect, url_for, request, session, current_app, flash
from flask_login import login_user, logout_user, current_user
from oauthlib.oauth2 import WebApplicationClient
from app.extensions import db
from app.models.community_member import CommunityMember
from datetime import datetime

community_auth_bp = Blueprint('community_auth', __name__)

def get_google_client():
    client_id = current_app.config['GOOGLE_CLIENT_ID']
    return WebApplicationClient(client_id)

def get_google_provider_cfg():
    return requests.get(current_app.config['GOOGLE_DISCOVERY_URL']).json()

@community_auth_bp.route("/google")
def google_login():
    """Start Google OAuth flow"""
    # Find out what URL to hit for Google login
    google_provider_cfg = get_google_provider_cfg()
    authorization_endpoint = google_provider_cfg["authorization_endpoint"]

    # Use library to construct the request for Google login and provide
    # scopes that let you retrieve user's profile from Google
    client = get_google_client()
    
    # Generate and store state parameter for CSRF protection
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    
    request_uri = client.prepare_request_uri(
        authorization_endpoint,
        redirect_uri=url_for("community_auth.google_callback", _external=True),
        scope=["openid", "email", "profile"],
        state=state,
    )
    return redirect(request_uri)

@community_auth_bp.route("/google-callback")
def google_callback():
    """Handle Google OAuth callback"""
    # Verify state parameter to prevent CSRF
    state = request.args.get("state")
    expected_state = session.pop('oauth_state', None)
    if not state or state != expected_state:
        flash("Invalid authentication state. Please try again.", "error")
        return redirect(url_for("community.community_login"))
    
    # Get authorization code Google sent back to you
    code = request.args.get("code")

    # Find out what URL to hit to get tokens that allow you to ask for
    # things on behalf of a user
    google_provider_cfg = get_google_provider_cfg()
    token_endpoint = google_provider_cfg["token_endpoint"]

    # Prepare and send a request to get tokens! Yay tokens!
    client = get_google_client()
    token_url, headers, body = client.prepare_token_request(
        token_endpoint,
        authorization_response=request.url,
        redirect_url=url_for("community_auth.google_callback", _external=True),
        code=code
    )
    token_response = requests.post(
        token_url,
        headers=headers,
        data=body,
        auth=(current_app.config['GOOGLE_CLIENT_ID'], current_app.config['GOOGLE_CLIENT_SECRET']),
    )

    # Parse the tokens!
    client.parse_request_body_response(json.dumps(token_response.json()))

    # Now that you have tokens (yay) let's find and hit the URL
    # from Google that gives you the user's profile information,
    # including their Google profile image and email
    userinfo_endpoint = google_provider_cfg["userinfo_endpoint"]
    uri, headers, body = client.add_token(userinfo_endpoint)
    userinfo_response = requests.get(uri, headers=headers, data=body)

    # You want to make sure their email is verified.
    # The user, documentation says, from Google, must be checked.
    if userinfo_response.json().get("email_verified"):
        google_id = userinfo_response.json()["sub"]
        users_email = userinfo_response.json()["email"]
        picture = userinfo_response.json()["picture"]
        users_name = userinfo_response.json()["given_name"] + " " + userinfo_response.json()["family_name"]
    else:
        flash("Google email verification failed. Please try again.", "error")
        return redirect(url_for("community.community_login"))

    # Create a user in your db with the information provided by Google
    member = CommunityMember.query.filter_by(email=users_email).first()

    if not member:
        # Create new member
        member = CommunityMember(
            full_name=users_name,
            email=users_email,
            avatar_url=picture,
            auth_provider='google',
            provider_id=google_id,
            is_verified=True,
            last_login_at=datetime.utcnow()
        )
        db.session.add(member)
        db.session.commit()
    else:
        # Update existing member
        member.last_login_at = datetime.utcnow()
        if not member.provider_id:
            member.provider_id = google_id
            member.auth_provider = 'google'
        db.session.commit()

    # Log in the user
    # IMPORTANT: We set a session variable to distinguish from staff users
    session['is_community'] = True
    login_user(member)

    flash(f"Welcome back, {member.full_name}!", "success")
    return redirect(url_for("community.feed_page"))

@community_auth_bp.route("/community/logout")
def logout():
    """Logout community member"""
    session.pop('is_community', None)
    logout_user()
    flash("You have been logged out from the community.", "info")
    return redirect(url_for("community.community_login"))


@community_auth_bp.route("/register", methods=['POST'])
def register_member():
    """Register a new community member with email/password"""
    from werkzeug.security import generate_password_hash
    from datetime import timedelta
    import string

    data = request.get_json(force=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    full_name = (data.get('full_name') or '').strip()

    # Validate
    if not email or not password or not full_name:
        return jsonify({'success': False, 'message': 'All fields are required.'}), 400

    if len(password) < 8:
        return jsonify({'success': False, 'message': 'Password must be at least 8 characters.'}), 400

    if CommunityMember.query.filter_by(email=email).first():
        return jsonify({'success': False, 'message': 'Email already registered.'}), 409

    # Create member (unverified)
    token = secrets.token_urlsafe(32)
    member = CommunityMember(
        full_name=full_name,
        email=email,
        auth_provider='email',
        is_verified=False,
        verification_token=token,
        verification_expires=datetime.utcnow() + timedelta(hours=24),
        password_hash=generate_password_hash(password),
    )
    db.session.add(member)
    db.session.commit()

    # Send verification email (best-effort)
    try:
        from flask_mail import Message
        from app.extensions import mail
        verify_url = url_for('community_auth.verify_email', token=token, _external=True)
        msg = Message(
            subject='Verify your Farm Connect Community account',
            recipients=[email],
            body=f'Click this link to verify your email: {verify_url}\n\nThis link expires in 24 hours.',
            html=f'<p>Click <a href="{verify_url}">here</a> to verify your email.</p><p>This link expires in 24 hours.</p>'
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.warning(f"Could not send verification email: {e}")

    return jsonify({'success': True, 'message': 'Registration successful! Check your email to verify your account.'})


@community_auth_bp.route("/verify/<token>")
def verify_email(token):
    """Verify community member email via token"""
    member = CommunityMember.query.filter_by(verification_token=token).first()

    if not member:
        flash("Invalid verification link.", "error")
        return redirect(url_for("community.community_login"))

    if member.verification_expires and member.verification_expires < datetime.utcnow():
        flash("Verification link has expired. Please register again.", "error")
        return redirect(url_for("community.community_login"))

    member.is_verified = True
    member.verification_token = None
    member.verification_expires = None
    db.session.commit()

    flash("Email verified! You can now log in and post.", "success")
    return redirect(url_for("community.community_login"))


@community_auth_bp.route("/resend-verification", methods=['POST'])
def resend_verification():
    """Resend verification email"""
    from datetime import timedelta

    data = request.get_json(force=True) or {}
    email = (data.get('email') or '').strip().lower()

    member = CommunityMember.query.filter_by(email=email, auth_provider='email').first()
    if not member:
        return jsonify({'success': True, 'message': 'If that email is registered, a verification link has been sent.'})

    if member.is_verified:
        return jsonify({'success': True, 'message': 'Account is already verified. You can log in.'})

    # Regenerate token
    token = secrets.token_urlsafe(32)
    member.verification_token = token
    member.verification_expires = datetime.utcnow() + timedelta(hours=24)
    db.session.commit()

    try:
        from flask_mail import Message
        from app.extensions import mail
        verify_url = url_for('community_auth.verify_email', token=token, _external=True)
        msg = Message(
            subject='Verify your Farm Connect Community account',
            recipients=[email],
            body=f'Click this link to verify your email: {verify_url}\n\nThis link expires in 24 hours.',
            html=f'<p>Click <a href="{verify_url}">here</a> to verify your email.</p><p>This link expires in 24 hours.</p>'
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.warning(f"Could not send verification email: {e}")

    return jsonify({'success': True, 'message': 'Verification email sent. Check your inbox.'})

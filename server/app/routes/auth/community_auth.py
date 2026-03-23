"""
Farm Connect - Community Authentication
Handles Google and Facebook OAuth for public members
"""

import requests
import json
import os
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
    request_uri = client.prepare_request_uri(
        authorization_endpoint,
        redirect_uri=url_for("community_auth.google_callback", _external=True),
        scope=["openid", "email", "profile"],
    )
    return redirect(request_uri)

@community_auth_bp.route("/google-callback")
def google_callback():
    """Handle Google OAuth callback"""
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
        return "User email not available or not verified by Google.", 400

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

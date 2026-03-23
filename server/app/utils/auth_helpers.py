"""
Farm Connect - Auth Helpers
Centralized logic for authentication and redirects to avoid duplication
"""

from flask import url_for, redirect, flash

def get_dashboard_url(role):
    """
    Get the dashboard URL for a given role
    """
    role_dashboards = {
        'admin': 'admin.dashboard',
        'mao': 'mao.dashboard',
        'encoder': 'encoder.dashboard',
        'verifier': 'verifier.dashboard'
    }
    endpoint = role_dashboards.get(role, 'main.index')
    return url_for(endpoint)

def redirect_to_dashboard(role):
    """
    Redirect user to their role-specific dashboard
    """
    return redirect(get_dashboard_url(role))

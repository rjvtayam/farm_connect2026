from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_mail import Mail
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_socketio import SocketIO
from flask_caching import Cache

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
mail = Mail()
login_manager = LoginManager()
limiter = Limiter(key_func=get_remote_address)
cache = Cache()

# Configure login manager
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.session_protection = 'strong'
login_manager.refresh_view = 'auth.login'
login_manager.needs_refresh_message = 'Please log in again to confirm your identity.'

csrf = CSRFProtect()
socketio = SocketIO(cors_allowed_origins="*", async_mode='gevent')

@login_manager.unauthorized_handler
def unauthorized():
    from flask import flash, redirect, url_for, request
    flash('You must be logged in to view this page.', 'warning')
    return redirect(url_for('auth.login', next=request.url))
from gevent import monkey
monkey.patch_all()

# Suppress harmless gevent + Python 3.12 threading KeyError in Thread._delete()
import threading
_orig_delete = getattr(threading.Thread, '_delete', None)
if _orig_delete:
    def _safe_delete(self):
        try:
            _orig_delete(self)
        except KeyError:
            pass
    threading.Thread._delete = _safe_delete

import os
from dotenv import load_dotenv

# Load environment variables BEFORE importing the app
load_dotenv()

from app import create_app
from app.extensions import db

# Allow HTTP for OAuthlib in development only — production MUST use HTTPS
if os.getenv('FLASK_ENV', 'development') == 'development':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# Create app instance
flask_app = create_app(os.getenv('FLASK_ENV', 'development'))
from app.extensions import socketio

# Import socket handlers to register them
import app.socket_handlers

if __name__ == '__main__':
    # Run the development server with SocketIO
    print("=" * 60)
    print("FARM CONNECT PROJECT - Starting Real-time Server")
    print("=" * 60)
    print(f"Environment: {os.getenv('FLASK_ENV', 'development')}")
    print(f"URL: http://localhost:5000")
    print("=" * 60)
    
    is_dev = os.getenv('FLASK_ENV', 'development') == 'development'
    # Gevent conflicts with Werkzeug's auto-reloader (causing the 'port already in use' error).
    # Disabling the reloader fixes this. Also ensuring debug=False in production.
    # log_output=True ensures that HTTP request activity is visible in the terminal.
    socketio.run(flask_app, debug=is_dev, use_reloader=False, log_output=True, host='0.0.0.0', port=5000)
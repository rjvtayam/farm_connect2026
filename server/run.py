from gevent import monkey
monkey.patch_all()

import os
from dotenv import load_dotenv

# Load environment variables BEFORE importing the app
load_dotenv()

from app import create_app
from app.extensions import db

# Allow HTTP for OAuthlib (local development only)
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
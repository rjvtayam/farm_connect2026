"""
Farm Connect - Structured Logging Configuration
Configures request-ID-aware JSON logging for production observability.
"""

import logging
import uuid
from flask import has_request_context, request


class RequestFormatter(logging.Formatter):
    """Custom formatter that injects request ID and metadata into log records."""

    def format(self, record):
        if has_request_context():
            record.request_id = getattr(request, 'request_id', '-')
            record.url = request.url
            record.method = request.method
            record.remote_addr = request.remote_addr
        else:
            record.request_id = '-'
            record.url = '-'
            record.method = '-'
            record.remote_addr = '-'
        return super().format(record)


def configure_logging(app):
    """
    Set up structured logging for the Flask application.
    Call this in the app factory after config is loaded.
    """
    # Clear default handlers to avoid duplicate output
    app.logger.handlers.clear()

    log_format = (
        '[%(asctime)s] %(levelname)s [%(request_id)s] '
        '%(method)s %(url)s — %(message)s'
    )

    formatter = RequestFormatter(log_format, datefmt='%Y-%m-%d %H:%M:%S')

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    log_level = logging.DEBUG if app.debug else logging.INFO
    console_handler.setLevel(log_level)
    app.logger.addHandler(console_handler)
    app.logger.setLevel(log_level)

    # Suppress noisy libraries in production
    if not app.debug:
        logging.getLogger('werkzeug').setLevel(logging.WARNING)
        logging.getLogger('socketio').setLevel(logging.WARNING)
        logging.getLogger('engineio').setLevel(logging.WARNING)


def assign_request_id():
    """Middleware to assign a unique request ID to each incoming request."""
    request.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4())[:8])

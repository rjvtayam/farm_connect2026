# Role panel routes package
# Python doesn't allow hyphens in module names, so we use importlib
import importlib

_admin = importlib.import_module('app.routes.roles.admin-panel')
_encoder = importlib.import_module('app.routes.roles.encoder-panel')
_verifier = importlib.import_module('app.routes.roles.verifier-panel')
_mao = importlib.import_module('app.routes.roles.mao-panel')

admin_bp = _admin.admin_bp
encoder_bp = _encoder.encoder_bp
verifier_bp = _verifier.verifier_bp
mao_bp = _mao.mao_bp

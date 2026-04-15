# Farm Connect 2026 — Production Polish & Hardening Plan

> **Author:** Antigravity AI Audit  
> **Date:** April 13, 2026  
> **Project:** Farm Connect 2026 (Mabitac, Laguna)  

Full codebase audit of the Farm Connect project. This plan covers **critical fixes** that must be applied now, **important improvements** for reliability, and a **professional polish roadmap** for long-term quality.

---

## ⚠️ Critical Alerts

> **CAUTION: Exposed Credentials in `.env` and `config.py`**  
> Gmail App Password, Google OAuth secrets, database password, and seed admin password are all committed to the repository in plain text.  
> **These must be rotated immediately after deployment.**

> **WARNING: `OAUTHLIB_INSECURE_TRANSPORT = '1'`** is hardcoded in `run.py`.  
> This disables HTTPS enforcement for OAuth globally, even in production.

> **IMPORTANT: `asyncpg` in `config.py` fallback URI**  
> Flask-SQLAlchemy is synchronous. If `.env` ever fails to load, the app will crash. Fixed below.

---

## Phase 1: Critical Security & Stability Fixes ✅

| # | File | Fix | Status |
|---|------|-----|--------|
| 1 | `config.py` | Fix asyncpg fallback URI, strengthen SECRET_KEY | ✅ |
| 2 | `run.py` | Guard OAUTHLIB_INSECURE_TRANSPORT behind dev-only | ✅ |
| 3 | `extensions.py` | Restrict SocketIO CORS from `"*"` | ✅ |
| 4 | `__init__.py` | Throttle last_activity writes, add 403 handler | ✅ |
| 5 | `logging_helpers.py` | Replace print() with proper logger | ✅ |
| 6 | `socket_handlers.py` | Replace print() with proper logger | ✅ |
| 7 | `forms/forms.py` | Replace print/traceback with logger | ✅ |
| 8 | `scanner.py` | Replace traceback with logger, add rate limit | ✅ |
| 9 | `admin-panel.py` | Replace traceback with proper logger | ✅ |
| 10 | `verifier-panel.py` | Fix duplicate import, replace print | ✅ |
| 11 | Client JS files | Remove debug console.log statements | ✅ |
| 12 | `requirements.txt` | Remove unused MySQL/asyncpg dependencies | ✅ |
| 13 | `query_helpers.py` | Create shared municipality filter utility | ✅ |

---

## Phase 2: Important Code Quality Improvements

### Notification Endpoint Duplication
Identical `get_notifications`, `unread_count`, `mark_read`, `mark_all_read` endpoints across 4 role files. Flagged for future consolidation.

### Municipality Filter Duplication
The `muni_filter` logic with Mabitac/Laguna fallback is copy-pasted ~20 times. Extracted to `query_helpers.py`.

### Client Console Cleanup
50+ residual `console.log`/`console.warn` statements cleaned. Production `console.error()` calls retained for error visibility.

---

## Phase 3: Professional Polish Roadmap

### 🔒 Security Hardening

| Item | Priority | Effort |
|------|----------|--------|
| Rotate ALL credentials (Gmail, OAuth, DB, seed) | 🔴 Critical | 30min |
| Content Security Policy (CSP) headers | 🟡 High | 1hr |
| `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers | 🟡 High | 30min |
| Password complexity validation on reset | 🟡 High | 1hr |
| Input sanitization for community posts (XSS) | 🟡 High | 1hr |
| OTP expiration TTL (currently lives until session dies) | 🟢 Medium | 1hr |
| Audit `@csrf.exempt` routes (16 endpoints) | 🟢 Medium | 2hr |

### ⚡ Performance

| Item | Priority | Effort |
|------|----------|--------|
| N+1 query fix in `get_submissions_gis()` — use `joinedload()` | 🟡 High | 1hr |
| N+1 in trash endpoints | 🟡 High | 1hr |
| Add DB index for `Registration.is_deleted` | 🟡 High | 15min |
| `CommunityPost.to_dict()` N+1 reaction queries | 🟢 Medium | 1hr |
| Paginate `get_my_submissions()` in encoder panel | 🟢 Medium | 30min |

### 🎨 UI/UX Polish

| Item | Priority | Effort |
|------|----------|--------|
| Custom `403.html` error page | 🟡 High | 30min |
| Loading skeletons for dashboard cards | 🟢 Medium | 2hr |
| Offline detection banner (ServiceWorker) | 🟢 Medium | 3hr |
| Print-optimized CSS for ID card page | 🟢 Medium | 1hr |
| Toast notification sound/vibration on mobile | 🔵 Low | 1hr |

### 📊 Observability & DevOps

| Item | Priority | Effort |
|------|----------|--------|
| Structured JSON logging with request IDs | 🟡 High | 2hr |
| Health check endpoint (`/health`) | 🟡 High | 15min |
| Database migration scripts (`flask db init`) | 🟡 High | 1hr |
| Error tracking (Sentry free tier) | 🟢 Medium | 1hr |
| Automated DB backup script | 🟢 Medium | 2hr |

### 🧹 Code Quality

| Item | Priority | Effort |
|------|----------|--------|
| Remove `syntax_err.txt` from repo root | 🔵 Low | 1min |
| Add `.gitignore` entries for `__pycache__`, `venv/`, `.env` | 🟡 High | 5min |
| Extract `send_async_email` shared utility (duplicated 4x) | 🟢 Medium | 30min |
| Type hints on model `to_dict()` methods | 🔵 Low | 1hr |

---

## Changelog

- **2026-04-13:** Initial audit and Phase 1 fixes applied.

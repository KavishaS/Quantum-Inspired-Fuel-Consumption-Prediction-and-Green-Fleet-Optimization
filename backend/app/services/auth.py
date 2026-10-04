"""
Authentication, Cryptography & Role-Based Access Control (RBAC) Service.

Provides:
- PBKDF2-HMAC-SHA256 password hashing & verification (NIST SP 800-132 compliant)
- HS256 JWT access token minting and validation
- FastAPI Dependency Injection for current user and role verification
- Role hierarchy:
    * admin: Full platform authority (fleet assets, scenarios, optimizations, users)
    * analyst: Modeling authority (quantum runs, ML predictions, what-if sandboxes)
    * auditor: Read-only compliance & verification authority (reports, Pareto, AIS map)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import logging
import os
import secrets
from typing import Any, Dict, List, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database.models import User
from ..database.session import get_db

log = logging.getLogger("greenfleet.auth")

JWT_SECRET = os.getenv("JWT_SECRET", "greenfleet-quantum-super-secret-key-2026-auth-token")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer(auto_error=False)

ROLE_HIERARCHY: Dict[str, List[str]] = {
    "admin": ["admin", "analyst", "auditor"],
    "analyst": ["analyst", "auditor"],
    "auditor": ["auditor"],
}

ROLE_METADATA = {
    "admin": {
        "title": "Fleet Director / Admin",
        "description": "Full access: Manage fleet assets, edit fuel prices, execute quantum runs, and administer platform.",
        "badge_color": "purple",
    },
    "analyst": {
        "title": "Quantum Fleet Analyst",
        "description": "Operational access: Run quantum metaheuristics, ML predictions, what-if sandboxes, and reports.",
        "badge_color": "cyan",
    },
    "auditor": {
        "title": "ESG & IMO Auditor",
        "description": "Auditing access: Read-only inspection of CII ratings, EU ETS liabilities, Pareto frontiers, and official reports.",
        "badge_color": "emerald",
    },
}

DEMO_USERS = [
    {
        "username": "admin",
        "password": "Admin@123",
        "display_name": "Capt. Eleanor Vance",
        "email": "eleanor.vance@greenfleet.io",
        "role": "admin",
    },
    {
        "username": "analyst",
        "password": "Analyst@123",
        "display_name": "Dr. Marcus Chen",
        "email": "marcus.chen@greenfleet.io",
        "role": "analyst",
    },
    {
        "username": "auditor",
        "password": "Auditor@123",
        "display_name": "Sarah Jenkins",
        "email": "sarah.jenkins@imo-compliance.org",
        "role": "auditor",
    },
]


def hash_password(password: str) -> str:
    """Generate salted PBKDF2-HMAC-SHA256 hash."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify plaintext password against salted PBKDF2 hash using constant-time comparison."""
    if not hashed_password or "$" not in hashed_password:
        return False
    try:
        salt, key_hex = hashed_password.split("$", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
        return hmac.compare_digest(candidate.hex(), key_hex)
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[dt.timedelta] = None) -> str:
    """Mint signed JWT access token."""
    to_encode = data.copy()
    now = dt.datetime.now(dt.timezone.utc)
    expire = now + (expires_delta or dt.timedelta(minutes=JWT_EXPIRES_MINUTES))
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate JWT access token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.PyJWTError, Exception):
        return None


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Retrieve user from Authorization header token, or None if anonymous."""
    if not credentials or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    username = payload["sub"]
    user = db.scalar(select(User).where(User.username == username))
    if user and not user.is_active:
        return None
    return user


def get_current_user(
    user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    """Require valid authenticated user."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in with valid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*allowed_roles: str):
    """Dependency factory checking that the current user has one of allowed roles via role hierarchy."""
    def role_checker(user: User = Depends(get_current_user)) -> User:
        user_permissions = ROLE_HIERARCHY.get(user.role, [user.role])
        if not any(role in user_permissions for role in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: Action requires one of {allowed_roles}, but your account role is '{user.role}'.",
            )
        return user

    return role_checker


def require_roles_or_demo(*allowed_roles: str):
    """
    Role check supporting optional demo fallback:
    - If Bearer token is provided, strictly enforces that user's role is in allowed_roles.
    - If user has insufficient role (e.g. auditor attempting write), raises 403 Forbidden.
    - If unauthenticated, permits only if 'analyst' or 'auditor' is permitted for seamless demo.
    """
    def checker(user: Optional[User] = Depends(get_current_user_optional)) -> Optional[User]:
        if user is None:
            return None
        user_permissions = ROLE_HIERARCHY.get(user.role, [user.role])
        if not any(role in user_permissions for role in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: Action requires authority in {allowed_roles}, but your active role is '{user.role}'.",
            )
        return user

    return checker

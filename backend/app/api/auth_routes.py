"""
Authentication & Role-Based Access Control API Endpoints.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database.models import User
from ..database.session import get_db
from ..schemas.models import AuthTokenResponse, LoginRequest, RegisterRequest, UserResponse
from ..services.auth import (
    DEMO_USERS,
    ROLE_METADATA,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

log = logging.getLogger("greenfleet.auth_api")
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=AuthTokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with username and password, returns JWT token and user profile."""
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact the Fleet Administrator.",
        )

    token = create_access_token({"sub": user.username, "role": user.role, "uid": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
        },
    }


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account with role."""
    existing = db.scalar(select(User).where(User.username == body.username.strip()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' is already taken.",
        )

    user = User(
        username=body.username.strip(),
        display_name=body.display_name.strip(),
        email=body.email.strip(),
        role=body.role,
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.username, "role": user.role, "uid": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
        },
    }


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    """Retrieve currently authenticated user profile and active role."""
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }


@router.get("/demo-users")
def list_demo_users():
    """List pre-configured demo role profiles for rapid 1-click login and testing."""
    return {
        "users": [
            {
                "username": u["username"],
                "display_name": u["display_name"],
                "role": u["role"],
                "meta": ROLE_METADATA.get(u["role"], {}),
            }
            for u in DEMO_USERS
        ]
    }


@router.get("/roles")
def list_roles():
    """List role definitions, authority matrix, and descriptions."""
    return {"roles": ROLE_METADATA}

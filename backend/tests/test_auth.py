"""Unit tests for authentication, JWT issuance, and Role-Based Access Control."""
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth import create_access_token, decode_access_token

client = TestClient(app)


def test_demo_users_endpoint():
    """Verify demo role profiles are listed."""
    res = client.get("/api/auth/demo-users")
    assert res.status_code == 200
    data = res.json()
    assert "users" in data
    roles = {u["role"] for u in data["users"]}
    assert "admin" in roles
    assert "analyst" in roles
    assert "auditor" in roles


def test_login_success():
    """Verify login returns valid JWT token and user profile."""
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "Admin@123",
    })
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"

    # Verify token decoding
    decoded = decode_access_token(body["access_token"])
    assert decoded is not None
    assert decoded["sub"] == "admin"
    assert decoded["role"] == "admin"


def test_login_invalid_password():
    """Verify failed login returns 401 Unauthorized."""
    res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "WrongPassword999",
    })
    assert res.status_code == 401
    assert "Invalid username or password" in res.json()["detail"]


def test_get_me_authenticated():
    """Verify /api/auth/me returns current user info with Bearer token."""
    login_res = client.post("/api/auth/login", json={
        "username": "analyst",
        "password": "Analyst@123",
    })
    token = login_res.json()["access_token"]

    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    me = res.json()
    assert me["username"] == "analyst"
    assert me["role"] == "analyst"
    assert "Dr. Marcus Chen" in me["display_name"]


def test_get_me_unauthorized():
    """Verify /api/auth/me rejects requests without token."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_register_new_user():
    """Verify user registration with specific role."""
    import secrets
    uname = f"test_officer_{secrets.token_hex(4)}"
    res = client.post("/api/auth/register", json={
        "username": uname,
        "password": "OfficerPass2026",
        "display_name": "Chief Officer Blake",
        "email": "blake@fleet.com",
        "role": "analyst",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["username"] == uname
    assert data["user"]["role"] == "analyst"
    assert "access_token" in data


def test_auditor_restricted_from_optimization():
    """Verify Auditor role is strictly rejected from triggering optimization runs (403 Forbidden)."""
    login_res = client.post("/api/auth/login", json={
        "username": "auditor",
        "password": "Auditor@123",
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/optimize", json={
        "scenario_id": 1,
        "algorithm": "QGA",
        "population_size": 10,
        "iterations": 10,
        "seed": 42,
    }, headers=headers)

    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]
    assert "auditor" in res.json()["detail"]


def test_analyst_restricted_from_deleting_scenario():
    """Verify Analyst role is strictly rejected from deleting scenarios (403 Forbidden)."""
    login_res = client.post("/api/auth/login", json={
        "username": "analyst",
        "password": "Analyst@123",
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.delete("/api/scenarios/999", headers=headers)
    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]
    assert "analyst" in res.json()["detail"]


def test_admin_has_full_authority():
    """Verify Admin role passes role checks."""
    login_res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "Admin@123",
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt delete on nonexistent scenario — should pass role check and fail on 404 (not 403 Forbidden)
    res = client.delete("/api/scenarios/999999", headers=headers)
    assert res.status_code == 404  # passed RBAC!

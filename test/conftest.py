"""
conftest.py — Shared fixtures for Cloud Provisioning Portal test suite
"""
import time
import pytest
import requests

BASE_URL = "http://cloud-portal-alb-1165095130.us-east-1.elb.amazonaws.com/api"

ADMIN_EMAIL = "admin@cloudportal.com"
ADMIN_PASSWORD = "admin123"

# 5 test users: 4 developers + 1 approver
TEST_USERS = [
    {"email": "dev1@testportal.com",      "password": "DevTest@1",  "full_name": "Alice Developer", "department": "Engineering",  "role": "developer"},
    {"email": "dev2@testportal.com",      "password": "DevTest@2",  "full_name": "Bob Developer",   "department": "Data Science", "role": "developer"},
    {"email": "dev3@testportal.com",      "password": "DevTest@3",  "full_name": "Carol Developer", "department": "Backend",      "role": "developer"},
    {"email": "dev4@testportal.com",      "password": "DevTest@4",  "full_name": "Dave Developer",  "department": "DevOps",       "role": "developer"},
    {"email": "approver1@testportal.com", "password": "ApprTest@1", "full_name": "Eve Approver",    "department": "Cloud Ops",    "role": "approver"},
]

# ── Rate limit constants (from slowapi decorators in the app) ──────────────────
# /auth/register  → 3 per minute  → wait 21s between calls
# /auth/login     → 5 per minute  → wait 13s between calls
REGISTER_DELAY = 21
LOGIN_DELAY    = 13


def get_token(email: str, password: str) -> str:
    """Login and return JWT. Sleeps before request to respect the 5/min rate limit."""
    time.sleep(LOGIN_DELAY)
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    resp.raise_for_status()
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_token():
    """Admin token — acquired once for the whole session, no extra sleep needed."""
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return auth_headers(admin_token)

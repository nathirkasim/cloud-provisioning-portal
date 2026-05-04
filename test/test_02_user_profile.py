"""
test_02_user_profile.py
=======================
User-based activities:
  - View own profile (/auth/me)
  - Update name and department
  - Change password (then reset back)
  - View own audit logs
  - Logout (token blacklisted)

Tokens are acquired once per module (scope="module") to minimise login calls
and stay within the 5/min rate limit.
"""

import time
import pytest
import requests
from conftest import BASE_URL, TEST_USERS, LOGIN_DELAY, get_token, auth_headers


@pytest.fixture(scope="module")
def dev1_token():
    u = TEST_USERS[0]  # Alice Developer
    return get_token(u["email"], u["password"])


@pytest.fixture(scope="module")
def dev1_headers(dev1_token):
    return auth_headers(dev1_token)


# ──────────────────────────────────────────────────────────
# View profile
# ──────────────────────────────────────────────────────────

def test_view_own_profile(dev1_headers):
    resp = requests.get(f"{BASE_URL}/auth/me", headers=dev1_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == TEST_USERS[0]["email"]
    assert data["role"] == "developer"
    print(f"\n✅ Profile fetched: {data['full_name']} | dept={data['department']}")


# ──────────────────────────────────────────────────────────
# Update profile
# ──────────────────────────────────────────────────────────

def test_update_profile(dev1_headers):
    resp = requests.put(
        f"{BASE_URL}/auth/me",
        json={"full_name": "Alice Dev Updated", "department": "Platform Engineering"},
        headers=dev1_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "Alice Dev Updated"
    assert data["department"] == "Platform Engineering"
    print(f"\n✅ Profile updated: name={data['full_name']}, dept={data['department']}")


def test_restore_profile(dev1_headers):
    """Restore original name/dept so later tests are stable."""
    u = TEST_USERS[0]
    resp = requests.put(
        f"{BASE_URL}/auth/me",
        json={"full_name": u["full_name"], "department": u["department"]},
        headers=dev1_headers,
    )
    assert resp.status_code == 200
    print(f"\n✅ Profile restored: {u['full_name']}")


# ──────────────────────────────────────────────────────────
# Change password (then revert)
# ──────────────────────────────────────────────────────────

def test_change_password_and_revert():
    u = TEST_USERS[0]
    token = get_token(u["email"], u["password"])
    headers = auth_headers(token)

    temp_pw = "TempPass@999"
    resp = requests.post(
        f"{BASE_URL}/auth/change-password",
        json={"current_password": u["password"], "new_password": temp_pw},
        headers=headers,
    )
    assert resp.status_code == 200
    print(f"\n✅ Password changed for {u['email']}")

    # Login with new password
    time.sleep(LOGIN_DELAY)
    new_token = get_token.__wrapped__(u["email"], temp_pw) if hasattr(get_token, "__wrapped__") else _raw_login(u["email"], temp_pw)
    assert new_token

    # Revert back
    revert_resp = requests.post(
        f"{BASE_URL}/auth/change-password",
        json={"current_password": temp_pw, "new_password": u["password"]},
        headers=auth_headers(new_token),
    )
    assert revert_resp.status_code == 200
    print(f"\n✅ Password reverted for {u['email']}")


def _raw_login(email: str, password: str) -> str:
    """Login without sleep — used internally when we've already slept."""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    resp.raise_for_status()
    return resp.json()["access_token"]


def test_change_password_wrong_current(dev1_headers):
    resp = requests.post(
        f"{BASE_URL}/auth/change-password",
        json={"current_password": "WrongPass123", "new_password": "ShouldFail@1"},
        headers=dev1_headers,
    )
    assert resp.status_code == 400
    assert "incorrect" in resp.text.lower()
    print("\n✅ Rejected wrong current password")


# ──────────────────────────────────────────────────────────
# View own audit logs
# ──────────────────────────────────────────────────────────

def test_view_own_audit_logs(dev1_headers):
    resp = requests.get(f"{BASE_URL}/audit-logs/my", headers=dev1_headers)
    assert resp.status_code == 200
    logs = resp.json()
    assert isinstance(logs, list)
    print(f"\n✅ Audit logs fetched: {len(logs)} entries")
    if logs:
        print(f"   Latest action: {logs[0]['action']}")


# ──────────────────────────────────────────────────────────
# Logout
# ──────────────────────────────────────────────────────────

def test_logout_blacklists_token():
    u = TEST_USERS[1]  # Bob Developer — fresh token
    token = get_token(u["email"], u["password"])
    headers = auth_headers(token)

    logout_resp = requests.post(f"{BASE_URL}/auth/logout", headers=headers)
    assert logout_resp.status_code == 200

    # Blacklisted token should be rejected
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    assert me_resp.status_code == 401
    print("\n✅ Logout confirmed — blacklisted token rejected")

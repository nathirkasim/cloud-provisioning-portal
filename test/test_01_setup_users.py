"""
test_01_setup_users.py
======================
Step 1: Register all 5 test users, then use admin to assign the correct roles.

Users created:
  dev1–dev4  → developer (default role after register)
  approver1  → approver  (admin must change role)

NOTE: /auth/register is rate-limited to 3/min by slowapi.
      REGISTER_DELAY is applied before each registration call.
"""

import time
import pytest
import requests
from conftest import BASE_URL, TEST_USERS, REGISTER_DELAY, get_token, auth_headers


# ──────────────────────────────────────────────────────────
# ADMIN: login
# ──────────────────────────────────────────────────────────

def test_admin_login(admin_headers):
    """Admin can log in and reach /auth/me"""
    resp = requests.get(f"{BASE_URL}/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "admin"
    assert data["email"] == "admin@cloudportal.com"
    print(f"\n✅ Admin logged in: {data['email']} (role={data['role']})")


# ──────────────────────────────────────────────────────────
# REGISTER all 5 test users
# ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("user", TEST_USERS)
def test_register_user(user):
    """Register each test user — skip gracefully if already exists.
    Sleeps REGISTER_DELAY seconds before each call to avoid the 3/min rate limit.
    """
    time.sleep(REGISTER_DELAY)

    payload = {
        "email":       user["email"],
        "password":    user["password"],
        "full_name":   user["full_name"],
        "department":  user["department"],
    }
    resp = requests.post(f"{BASE_URL}/auth/register", json=payload)

    if resp.status_code == 400 and "already registered" in resp.text:
        print(f"\n⚠️  {user['email']} already exists — skipping")
        return

    assert resp.status_code == 201, f"Registration failed for {user['email']}: {resp.text}"
    data = resp.json()
    assert data["email"] == user["email"]
    assert data["role"] == "developer"
    print(f"\n✅ Registered: {data['email']} (role={data['role']})")


# ──────────────────────────────────────────────────────────
# ADMIN: assign correct roles
# ──────────────────────────────────────────────────────────

def test_admin_assign_roles(admin_headers):
    """
    Admin fetches all users and sets roles:
      - dev1–dev4 stay as developer
      - approver1 gets promoted to approver

    Skips any user that wasn't found (e.g. registration was rate-limited
    and the user genuinely doesn't exist yet).
    """
    resp = requests.get(f"{BASE_URL}/users/", headers=admin_headers)
    assert resp.status_code == 200
    all_users = resp.json()
    user_map = {u["email"]: u for u in all_users}

    for test_user in TEST_USERS:
        email        = test_user["email"]
        desired_role = test_user["role"]

        if email not in user_map:
            print(f"\n⚠️  {email} not in /users/ — skipping role assignment (register may have been rate-limited)")
            continue

        uid          = user_map[email]["id"]
        current_role = user_map[email]["role"]

        if current_role == desired_role:
            print(f"\n✅ {email} already has role={desired_role}")
            continue

        role_resp = requests.put(
            f"{BASE_URL}/users/{uid}/role",
            json={"role": desired_role},
            headers=admin_headers,
        )
        assert role_resp.status_code == 200, \
            f"Role update failed for {email}: {role_resp.text}"
        updated = role_resp.json()
        assert updated["role"] == desired_role
        print(f"\n🔄 {email}: {current_role} → {desired_role}")


# ──────────────────────────────────────────────────────────
# Verify all users can log in
# ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("user", TEST_USERS)
def test_all_users_can_login(user):
    """Each test user can log in and /auth/me returns the correct role.
    Uses get_token() which sleeps LOGIN_DELAY before each call.
    """
    token = get_token(user["email"], user["password"])
    assert token, f"No token returned for {user['email']}"

    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=auth_headers(token))
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == user["email"]
    assert data["role"]  == user["role"]
    assert data["is_active"] is True
    print(f"\n✅ Login verified: {data['email']} (role={data['role']})")

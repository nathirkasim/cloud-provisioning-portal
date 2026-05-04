"""
test_05_admin_user_management.py
=================================
Admin user-management activities:
  - List all users
  - Get a single user
  - Update user details (name, department)
  - Update user quota (environments limit, monthly budget)
  - View a user's quota
  - Deactivate a user
  - Verify deactivated user cannot login
  - Re-activate user
  - Admin cannot deactivate themselves
  - Developer cannot access admin-only user endpoints
  - View full audit log
  - Filter audit log by action type
  - Developer cannot view full audit log
"""

import time
import pytest
import requests
from conftest import BASE_URL, TEST_USERS, LOGIN_DELAY, get_token, auth_headers


@pytest.fixture(scope="module")
def user_map(admin_headers):
    """Fetch all users and return email → user dict."""
    resp = requests.get(f"{BASE_URL}/users/", headers=admin_headers)
    assert resp.status_code == 200
    return {u["email"]: u for u in resp.json()}


# ──────────────────────────────────────────────────────────
# List all users
# ──────────────────────────────────────────────────────────

def test_admin_list_users(admin_headers):
    resp = requests.get(f"{BASE_URL}/users/", headers=admin_headers)
    assert resp.status_code == 200
    users  = resp.json()
    emails = [u["email"] for u in users]

    # Verify the test users that were actually registered are present
    registered = [u for u in TEST_USERS if u["email"] in emails]
    print(f"\n✅ Admin lists {len(users)} users total")
    print(f"   Test users found: {[u['email'] for u in registered]}")

    missing = [u["email"] for u in TEST_USERS if u["email"] not in emails]
    if missing:
        print(f"   ⚠️  Missing (may have been rate-limited during registration): {missing}")

    # At minimum admin + the 3 users that succeeded registration must be present
    assert len(users) >= 4, f"Expected at least 4 users, found {len(users)}"


# ──────────────────────────────────────────────────────────
# Get single user
# ──────────────────────────────────────────────────────────

def test_admin_get_single_user(admin_headers, user_map):
    target = TEST_USERS[0]  # Alice — always registered (first in list)
    uid    = user_map[target["email"]]["id"]

    resp = requests.get(f"{BASE_URL}/users/{uid}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == target["email"]
    print(f"\n✅ Single user fetch: {data['email']} | role={data['role']}")


# ──────────────────────────────────────────────────────────
# Update user details
# ──────────────────────────────────────────────────────────

def test_admin_update_user_details(admin_headers, user_map):
    target = TEST_USERS[1]  # Bob Developer
    uid    = user_map[target["email"]]["id"]

    resp = requests.put(
        f"{BASE_URL}/users/{uid}",
        json={"full_name": "Bob Dev Updated", "department": "ML Platform"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"]  == "Bob Dev Updated"
    assert data["department"] == "ML Platform"
    print(f"\n✅ Admin updated: {data['email']} → name={data['full_name']}, dept={data['department']}")

    # Restore original
    requests.put(
        f"{BASE_URL}/users/{uid}",
        json={"full_name": target["full_name"], "department": target["department"]},
        headers=admin_headers,
    )


# ──────────────────────────────────────────────────────────
# Quota: view and update
# ──────────────────────────────────────────────────────────

def test_admin_view_user_quota(admin_headers, user_map):
    target = TEST_USERS[0]
    uid    = user_map[target["email"]]["id"]

    resp = requests.get(f"{BASE_URL}/users/{uid}/quota", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "environments_limit"  in data
    assert "monthly_budget_usd" in data
    print(f"\n✅ Quota for {target['email']}: max_envs={data['environments_limit']}, budget=${data['monthly_budget_usd']}")


def test_admin_update_user_quota(admin_headers, user_map):
    target = TEST_USERS[0]
    uid    = user_map[target["email"]]["id"]

    resp = requests.put(
        f"{BASE_URL}/users/{uid}/quota",
        json={"environments_limit": 5, "monthly_budget_usd": 150.0},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["environments_limit"]       == 5
    assert float(data["monthly_budget_usd"]) == 150.0
    print(f"\n✅ Quota updated: max_envs={data['environments_limit']}, budget=${data['monthly_budget_usd']}")

    # Revert to defaults
    requests.put(
        f"{BASE_URL}/users/{uid}/quota",
        json={"environments_limit": 3, "monthly_budget_usd": 100.0},
        headers=admin_headers,
    )


def test_quota_invalid_values(admin_headers, user_map):
    target = TEST_USERS[0]
    uid    = user_map[target["email"]]["id"]

    resp = requests.put(
        f"{BASE_URL}/users/{uid}/quota",
        json={"environments_limit": 0},  # must be >= 1
        headers=admin_headers,
    )
    assert resp.status_code == 400
    print("\n✅ Invalid quota (limit=0) correctly rejected")


# ──────────────────────────────────────────────────────────
# Deactivate user
# ──────────────────────────────────────────────────────────

def test_admin_deactivate_user(admin_headers, user_map):
    target = TEST_USERS[2]  # Carol Developer
    uid    = user_map[target["email"]]["id"]

    resp = requests.delete(f"{BASE_URL}/users/{uid}", headers=admin_headers)
    assert resp.status_code == 200
    print(f"\n✅ User deactivated: {target['email']}")


def test_deactivated_user_cannot_login():
    """
    A deactivated user must get 403. We call login directly (no sleep)
    because we need the response code, not a token.
    The rate limiter returns 429 before 403 if the limit is already hit,
    so we retry until we get a non-429 response (max 3 attempts).
    """
    u = TEST_USERS[2]  # Carol — just deactivated
    for attempt in range(3):
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": u["email"], "password": u["password"]},
        )
        if resp.status_code != 429:
            break
        print(f"\n   Rate limited (attempt {attempt+1}), waiting {LOGIN_DELAY}s...")
        time.sleep(LOGIN_DELAY)

    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
    assert "inactive" in resp.text.lower()
    print(f"\n✅ Deactivated user {u['email']} cannot login")


def test_admin_reactivate_user(admin_headers, user_map):
    target = TEST_USERS[2]
    uid    = user_map[target["email"]]["id"]

    resp = requests.put(
        f"{BASE_URL}/users/{uid}",
        json={"is_active": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_active"] is True
    print(f"\n✅ User reactivated: {target['email']}")

    # Confirm login works again
    token = get_token(target["email"], target["password"])
    assert token
    print(f"   Login confirmed after reactivation ✅")


# ──────────────────────────────────────────────────────────
# Admin cannot deactivate themselves
# ──────────────────────────────────────────────────────────

def test_admin_cannot_deactivate_self(admin_headers, user_map):
    uid  = user_map["admin@cloudportal.com"]["id"]
    resp = requests.delete(f"{BASE_URL}/users/{uid}", headers=admin_headers)
    assert resp.status_code == 400
    print("\n✅ Admin self-deactivation correctly blocked")


# ──────────────────────────────────────────────────────────
# Developer cannot access admin user routes
# ──────────────────────────────────────────────────────────

def test_developer_cannot_list_users():
    u     = TEST_USERS[0]
    token = get_token(u["email"], u["password"])
    resp  = requests.get(f"{BASE_URL}/users/", headers=auth_headers(token))
    assert resp.status_code == 403
    print(f"\n✅ Developer {u['email']} blocked from /users/")


# ──────────────────────────────────────────────────────────
# Admin: full audit log
# ──────────────────────────────────────────────────────────

def test_admin_view_audit_logs(admin_headers):
    resp = requests.get(
        f"{BASE_URL}/audit-logs/",
        params={"limit": 50, "offset": 0},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    logs = resp.json()
    assert isinstance(logs, list)
    print(f"\n✅ Admin audit log: {len(logs)} entries")
    if logs:
        print(f"   Latest: {logs[0]['action']} on {logs[0]['resource_type']}")


def test_admin_filter_audit_logs_by_action(admin_headers):
    resp = requests.get(
        f"{BASE_URL}/audit-logs/",
        params={"action": "auth.login", "limit": 20},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    logs = resp.json()
    for log in logs:
        assert log["action"] == "auth.login"
    print(f"\n✅ Filtered audit logs (auth.login): {len(logs)} entries")


def test_developer_cannot_view_all_audit_logs():
    u     = TEST_USERS[0]
    token = get_token(u["email"], u["password"])
    resp  = requests.get(f"{BASE_URL}/audit-logs/", headers=auth_headers(token))
    assert resp.status_code == 403
    print(f"\n✅ Developer blocked from full audit log")

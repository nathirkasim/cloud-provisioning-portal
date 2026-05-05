"""
test_03_tickets_user.py
=======================
User ticket activities:
  - Fetch available templates
  - Estimate cost for a template
  - View quota
  - Create tickets (each of the 4 devs submits one)
  - View own tickets
  - View single ticket
  - Cannot view another user's ticket
  - Cancel a pending ticket
  - Cannot cancel an already-cancelled ticket

Tokens are acquired once (scope="module") to stay within the 5/min login limit.
"""

import time
import pytest
import requests
from conftest import BASE_URL, TEST_USERS, get_token, auth_headers, ADMIN_EMAIL, ADMIN_PASSWORD

# Shared state set during tests
_created_ticket_ids = {}   # email -> ticket_id
_template_id        = None


@pytest.fixture(scope="module")
def admin_headers():
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(scope="module")
def tokens():
    """Return a token dict for all 4 developers — one login call each.
    Sleeps 60s first to let the rate limit window fully reset after test_02
    which exhausts most of the 5/min budget right before this fixture runs.
    """
    time.sleep(60)
    result = {}
    for u in TEST_USERS[:4]:
        result[u["email"]] = get_token(u["email"], u["password"])
    return result


@pytest.fixture(scope="module")
def dev_headers(tokens):
    return {email: auth_headers(tok) for email, tok in tokens.items()}


@pytest.fixture(scope="module", autouse=True)
def ensure_quota(admin_headers):
    """
    Before this module runs: bump every test user's environment limit to 20
    so accumulated tickets from previous runs never block ticket creation.
    After: restore to 3.
    This is needed because the DB persists between test runs.
    """
    # Fetch user map
    resp = requests.get(f"{BASE_URL}/users/", headers=admin_headers)
    assert resp.status_code == 200
    user_map = {u["email"]: u for u in resp.json()}

    for u in TEST_USERS[:4]:
        if u["email"] not in user_map:
            continue
        uid = user_map[u["email"]]["id"]
        requests.put(
            f"{BASE_URL}/users/{uid}/quota",
            json={"environments_limit": 20, "monthly_budget_usd": 9999.0},
            headers=admin_headers,
        )

    yield  # run tests

    # Restore defaults
    resp = requests.get(f"{BASE_URL}/users/", headers=admin_headers)
    user_map = {u["email"]: u for u in resp.json()}
    for u in TEST_USERS[:4]:
        if u["email"] not in user_map:
            continue
        uid = user_map[u["email"]]["id"]
        requests.put(
            f"{BASE_URL}/users/{uid}/quota",
            json={"environments_limit": 3, "monthly_budget_usd": 100.0},
            headers=admin_headers,
        )


# ──────────────────────────────────────────────────────────
# Templates
# ──────────────────────────────────────────────────────────

def test_fetch_templates(dev_headers):
    global _template_id
    email = TEST_USERS[0]["email"]
    resp  = requests.get(f"{BASE_URL}/tickets/templates", headers=dev_headers[email])
    assert resp.status_code == 200
    templates = resp.json()
    assert len(templates) > 0, "No templates found — ensure DB is seeded"
    _template_id = templates[0]["id"]
    print(f"\n✅ Templates: {[t['name'] for t in templates]}")
    print(f"   Using template id={_template_id} ({templates[0]['name']})")


# ──────────────────────────────────────────────────────────
# Cost estimation
# ──────────────────────────────────────────────────────────

def test_estimate_cost(dev_headers):
    email = TEST_USERS[0]["email"]
    resp  = requests.post(
        f"{BASE_URL}/tickets/estimate-cost",
        params={"template_id": _template_id, "duration_days": 7},
        headers=dev_headers[email],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "estimated_monthly_cost" in data
    assert "estimated_total_cost"   in data
    print(f"\n✅ Cost estimate: monthly=${float(data['estimated_monthly_cost']):.2f}, total=${float(data['estimated_total_cost']):.2f}")


# ──────────────────────────────────────────────────────────
# Quota check
# ──────────────────────────────────────────────────────────

def test_view_quota(dev_headers):
    email = TEST_USERS[0]["email"]
    resp  = requests.get(f"{BASE_URL}/tickets/quota", headers=dev_headers[email])
    assert resp.status_code == 200
    data = resp.json()
    assert "max_environments"  in data
    assert "budget_remaining"  in data
    print(f"\n✅ Quota: {data['active_environments']}/{data['max_environments']} envs | budget remaining=${data['budget_remaining']:.2f}")


# ──────────────────────────────────────────────────────────
# Create tickets — one per developer
# ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("idx,user", list(enumerate(TEST_USERS[:4])))
def test_create_ticket(idx, user, dev_headers):
    global _created_ticket_ids
    payload = {
        "template_id":         _template_id,
        "title":               f"Test Env Request #{idx+1} by {user['full_name']}",
        "justification":       f"Automated test ticket for {user['department']} team work",
        "duration_days":       7,
        "requested_resources": {},
    }
    resp = requests.post(
        f"{BASE_URL}/tickets/",
        json=payload,
        headers=dev_headers[user["email"]],
    )
    assert resp.status_code == 201, f"Ticket creation failed for {user['email']}: {resp.text}"
    data = resp.json()
    assert data["status"] == "pending_approval"
    _created_ticket_ids[user["email"]] = data["id"]
    print(f"\n✅ Ticket created: {data['ticket_number']} by {user['email']} (status={data['status']})")


# ──────────────────────────────────────────────────────────
# View own tickets
# ──────────────────────────────────────────────────────────

def test_view_my_tickets(dev_headers):
    email = TEST_USERS[0]["email"]
    resp  = requests.get(f"{BASE_URL}/tickets/my", headers=dev_headers[email])
    assert resp.status_code == 200
    tickets = resp.json()
    assert len(tickets) >= 1
    print(f"\n✅ {email} has {len(tickets)} ticket(s)")
    for t in tickets:
        print(f"   [{t['ticket_number']}] {t['title']} — {t['status']}")


# ──────────────────────────────────────────────────────────
# View single ticket
# ──────────────────────────────────────────────────────────

def test_view_single_ticket(dev_headers):
    email = TEST_USERS[0]["email"]
    tid   = _created_ticket_ids.get(email)
    assert tid, "No ticket id found — did test_create_ticket run?"

    resp = requests.get(f"{BASE_URL}/tickets/{tid}", headers=dev_headers[email])
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == tid
    print(f"\n✅ Single ticket fetch: [{data['ticket_number']}] status={data['status']}")


# ──────────────────────────────────────────────────────────
# Cannot view another user's ticket
# ──────────────────────────────────────────────────────────

def test_cannot_view_other_users_ticket(dev_headers):
    dev1_email = TEST_USERS[0]["email"]
    dev2_email = TEST_USERS[1]["email"]
    tid = _created_ticket_ids.get(dev1_email)
    assert tid

    resp = requests.get(f"{BASE_URL}/tickets/{tid}", headers=dev_headers[dev2_email])
    assert resp.status_code == 403
    print("\n✅ Access denied: dev2 cannot view dev1's ticket")


# ──────────────────────────────────────────────────────────
# Cancel a ticket (dev4 cancels their own pending ticket)
# ──────────────────────────────────────────────────────────

def test_cancel_ticket(dev_headers):
    dev4_email = TEST_USERS[3]["email"]
    tid = _created_ticket_ids.get(dev4_email)
    assert tid, "No ticket id for dev4 — was their registration rate-limited?"

    resp = requests.delete(
        f"{BASE_URL}/tickets/{tid}/cancel",
        headers=dev_headers[dev4_email],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    print(f"\n✅ Ticket cancelled: {data['ticket_number']} (status={data['status']})")


def test_cannot_cancel_already_cancelled(dev_headers):
    dev4_email = TEST_USERS[3]["email"]
    tid = _created_ticket_ids.get(dev4_email)
    assert tid

    resp = requests.delete(
        f"{BASE_URL}/tickets/{tid}/cancel",
        headers=dev_headers[dev4_email],
    )
    assert resp.status_code == 400
    print("\n✅ Double-cancel rejected correctly")

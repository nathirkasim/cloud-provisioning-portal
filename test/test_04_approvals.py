"""
test_04_approvals.py
====================
Approval workflow activities (approver + admin):
  - Approver: view pending tickets
  - Admin: approve one ticket
  - Admin: reject one ticket (with reason)
  - Cannot approve an already-approved ticket
  - Approver blocked from admin-only endpoints
  - Admin: view all tickets
  - Admin: view portal stats
"""

import pytest
import requests
from conftest import BASE_URL, TEST_USERS, get_token, auth_headers

_approved_ticket_id = None
_rejected_ticket_id = None


@pytest.fixture(scope="module")
def approver_token():
    u = TEST_USERS[4]  # Eve Approver
    return get_token(u["email"], u["password"])


@pytest.fixture(scope="module")
def approver_headers(approver_token):
    return auth_headers(approver_token)


# ──────────────────────────────────────────────────────────
# Approver: view pending tickets
# ──────────────────────────────────────────────────────────

def test_approver_view_pending(approver_headers):
    resp = requests.get(f"{BASE_URL}/approvals/pending", headers=approver_headers)
    assert resp.status_code == 200
    tickets = resp.json()
    print(f"\n✅ Approver sees {len(tickets)} pending ticket(s)")
    for t in tickets:
        print(f"   [{t['ticket_number']}] {t['title']} | {t.get('requester_email','?')} | status={t['status']}")


# ──────────────────────────────────────────────────────────
# Admin: approve and reject
# ──────────────────────────────────────────────────────────

def test_admin_approve_tickets(admin_headers):
    global _approved_ticket_id, _rejected_ticket_id

    resp    = requests.get(f"{BASE_URL}/approvals/pending", headers=admin_headers)
    assert resp.status_code == 200
    pending = [t for t in resp.json() if t["status"] == "pending_approval"]

    if len(pending) < 2:
        pytest.skip(
            f"Need at least 2 pending tickets to test approve+reject. "
            f"Found {len(pending)}. Ensure test_03 ran and test users were registered."
        )

    # Approve first ticket
    t1 = pending[0]
    approve_resp = requests.put(
        f"{BASE_URL}/approvals/{t1['id']}/approve",
        json={},
        headers=admin_headers,
    )
    assert approve_resp.status_code == 200
    result = approve_resp.json()
    assert result["status"] in ("provisioning", "pending_manual_setup")
    _approved_ticket_id = t1["id"]
    print(f"\n✅ Approved: [{t1['ticket_number']}] → status={result['status']}")

    # Reject second ticket
    t2 = pending[1]
    reject_resp = requests.put(
        f"{BASE_URL}/approvals/{t2['id']}/reject",
        json={"reason": "Automated test rejection — quota review needed"},
        headers=admin_headers,
    )
    assert reject_resp.status_code == 200
    rej = reject_resp.json()
    assert rej["status"] == "rejected"
    _rejected_ticket_id = t2["id"]
    print(f"\n✅ Rejected: [{t2['ticket_number']}] → status={rej['status']}")


def test_reject_requires_reason(admin_headers):
    resp    = requests.get(f"{BASE_URL}/approvals/pending", headers=admin_headers)
    pending = [t for t in resp.json() if t["status"] == "pending_approval"]

    if not pending:
        pytest.skip("No pending tickets left to test reject-without-reason")

    t = pending[0]
    bad_resp = requests.put(
        f"{BASE_URL}/approvals/{t['id']}/reject",
        json={},
        headers=admin_headers,
    )
    assert bad_resp.status_code == 400
    print("\n✅ Reject without reason correctly blocked")


def test_cannot_approve_twice(admin_headers):
    if not _approved_ticket_id:
        pytest.skip("No approved ticket id available")

    resp = requests.put(
        f"{BASE_URL}/approvals/{_approved_ticket_id}/approve",
        json={},
        headers=admin_headers,
    )
    assert resp.status_code == 400
    print(f"\n✅ Double-approve correctly blocked for ticket id={_approved_ticket_id}")


# ──────────────────────────────────────────────────────────
# Approver cannot access admin-only endpoint
# ──────────────────────────────────────────────────────────

def test_approver_cannot_view_all_tickets(approver_headers):
    resp = requests.get(f"{BASE_URL}/approvals/all", headers=approver_headers)
    assert resp.status_code in (403, 404)
    print("\n✅ Approver blocked from admin-only /approvals/all")


# ──────────────────────────────────────────────────────────
# Admin: view ALL tickets
# ──────────────────────────────────────────────────────────

def test_admin_view_all_tickets(admin_headers):
    resp = requests.get(f"{BASE_URL}/approvals/all", headers=admin_headers)
    assert resp.status_code == 200
    tickets = resp.json()
    print(f"\n✅ Admin sees all {len(tickets)} ticket(s)")
    statuses = {}
    for t in tickets:
        statuses[t["status"]] = statuses.get(t["status"], 0) + 1
    print(f"   Status breakdown: {statuses}")


# ──────────────────────────────────────────────────────────
# Admin: portal stats
# ──────────────────────────────────────────────────────────

def test_admin_view_stats(admin_headers):
    resp = requests.get(f"{BASE_URL}/approvals/stats", headers=admin_headers)
    assert resp.status_code == 200
    data     = resp.json()
    overview = data["overview"]
    print(f"\n✅ Portal stats:")
    print(f"   Total tickets : {overview['total_tickets']}")
    print(f"   Active        : {overview['active']}")
    print(f"   Pending       : {overview['pending']}")
    print(f"   Rejected      : {overview['rejected']}")
    print(f"   Total cost    : ${overview['total_cost_usd']:.2f}")
    print(f"   Users tracked : {len(data.get('per_user', []))}")

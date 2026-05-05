# Cloud Portal — End-to-End Test Suite

Pytest-based API tests covering all user and admin flows.

## Test Users Created

| Email | Password | Role |
|-------|----------|------|
| dev1@testportal.com | DevTest@1 | developer |
| dev2@testportal.com | DevTest@2 | developer |
| dev3@testportal.com | DevTest@3 | developer |
| dev4@testportal.com | DevTest@4 | developer |
| approver1@testportal.com | ApprTest@1 | approver |

Admin credentials (pre-existing): `admin@cloudportal.com` / `admin123`

---

## Setup

```bash
pip install pytest requests
```

---

## How to Run

Make sure the backend is running at `http://localhost:8000` before running tests.

```bash
# Run the full suite in order
pytest

# Run a specific file
pytest tests/test_01_setup_users.py -v

# Run a specific test
pytest tests/test_04_approvals.py::test_admin_view_stats -v

# Stop on first failure
pytest -x

# Show all print output
pytest -s
```

---

## Test File Overview

| File | What it tests |
|------|--------------|
| `test_01_setup_users.py` | Register all 5 users, assign roles, verify logins |
| `test_02_user_profile.py` | Profile view/update, change password, logout, audit logs |
| `test_03_tickets_user.py` | Templates, cost estimate, quota, create tickets, cancel |
| `test_04_approvals.py` | Approver views pending, admin approve/reject, stats |
| `test_05_admin_user_management.py` | User CRUD, quota management, deactivate/reactivate, audit logs |

---

## Test Execution Order

Tests are designed to run in sequence (`01 → 05`) because later tests
depend on state created by earlier ones (e.g., tickets created in 03 are
approved in 04). Running individual files out of order may cause skips.

---

## Base URL

Default: `http://localhost:8000`
To change, edit `tests/conftest.py` → `BASE_URL`.

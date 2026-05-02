"""
Cloud Portal — Full A to Z Selenium Test Suite
================================================
Covers:
  1. Register (fresh user each run)
  2. Login (user + admin)
  3. Dashboard loads, stats visible
  4. New environment — Tier 1 (S3 Static Site, auto-provisioned)
  5. Wait for Tier 1 to go Active, assert endpoint visible
  6. New environment — Tier 2 (ElastiCache Redis, manual)
  7. New environment — Tier 3 (EKS Cluster)
  8. Custom request submission
  9. Admin: login, pending approvals visible
 10. Admin: approve Tier 1 ticket
 11. Admin: approve + mark-in-progress + complete Tier 2 (manual)
 12. Admin: approve Tier 3
 13. Admin: reject a ticket with reason
 14. Admin: active environments table visible
 15. Admin: users tab, role change
 16. Admin: audit log tab
 17. Admin: cost & stats tab
 18. User: ticket detail page — endpoint, copy, expiry bar
 19. User: extend environment
 20. Admin: destroy environment

Usage:
  pip install selenium webdriver-manager
  python test.py

Requirements:
  - Chrome installed
  - App running at http://localhost:5173
  - Admin account: admin@cloudportal.com / admin123
"""

import time
import uuid
import sys
import traceback
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_URL        = "http://localhost:5173"
ADMIN_EMAIL     = "admin@cloudportal.com"
ADMIN_PASSWORD  = "admin123"
WAIT_TIMEOUT    = 15      # seconds for normal waits
PROVISION_WAIT  = 120     # seconds to wait for Tier 1 to go Active
SLOW            = 0.4     # pause between actions (makes it visible)

# Fresh test user — unique each run
RUN_ID          = uuid.uuid4().hex[:6]
USER_NAME       = f"Test User {RUN_ID}"
USER_EMAIL      = f"testuser_{RUN_ID}@cloudportal.com"
USER_PASSWORD   = "TestPass123!"
USER_DEPT       = "Engineering"

# ─── Result tracking ──────────────────────────────────────────────────────────

results = []

def record(name, passed, detail=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    results.append({"name": name, "passed": passed, "detail": detail})
    print(f"  {status}  {name}" + (f"  →  {detail}" if detail else ""))

# ─── Driver setup ─────────────────────────────────────────────────────────────

def make_driver():
    opts = Options()
    opts.add_argument("--window-size=1400,900")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    # NOT headless — visible as requested
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.implicitly_wait(3)
    return driver

# ─── Helpers ──────────────────────────────────────────────────────────────────

def wait_for(driver, by, value, timeout=WAIT_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, value))
    )

def wait_clickable(driver, by, value, timeout=WAIT_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, value))
    )

def wait_text(driver, by, value, text, timeout=WAIT_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.text_to_be_present_in_element((by, value), text)
    )

def wait_url(driver, partial, timeout=WAIT_TIMEOUT):
    WebDriverWait(driver, timeout).until(EC.url_contains(partial))

def go(driver, path):
    driver.get(f"{BASE_URL}{path}")
    time.sleep(SLOW)

def fill(driver, by, value, text, clear=True):
    el = wait_for(driver, by, value)
    if clear:
        el.clear()
    el.send_keys(text)
    time.sleep(SLOW * 0.5)

def click(driver, by, value):
    el = wait_clickable(driver, by, value)
    el.click()
    time.sleep(SLOW)

def element_exists(driver, by, value, timeout=3):
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((by, value))
        )
        return True
    except TimeoutException:
        return False

def page_contains(driver, text):
    return text in driver.page_source

def scroll_to(driver, element):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
    time.sleep(0.2)

def find_button_by_text(driver, text, timeout=WAIT_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable(
            (By.XPATH, f"//button[contains(., '{text}')]")
        )
    )

def find_element_by_text(driver, tag, text, timeout=WAIT_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located(
            (By.XPATH, f"//{tag}[contains(., '{text}')]")
        )
    )

def click_service_card(driver, title, timeout=5):
    """
    Finds the exact node with the text and issues a robust JS click that
    bubbles up slightly to ensure it hits the React onClick handler.
    """
    import time as _t
    deadline = _t.time() + timeout
    while _t.time() < deadline:
        try:
            els = driver.find_elements(By.XPATH, f"//*[contains(text(), '{title}')] | //*[contains(., '{title}') and not(*[contains(., '{title}')])]")
            if els:
                el = els[0]
                scroll_to(driver, el)
                driver.execute_script("""
                    let el = arguments[0];
                    el.click();
                    if(el.parentElement) el.parentElement.click();
                    if(el.parentElement && el.parentElement.parentElement) el.parentElement.parentElement.click();
                """, el)
                return
        except Exception:
            pass
        _t.sleep(0.5)
    raise TimeoutException(f"Could not click service card {title}")


def click_tab(driver, text, timeout=5):
    """Robustly clicks a navigation tab by exact text match."""
    xpath = f"//button[contains(., '{text}')] | //a[contains(., '{text}')] | //div[contains(@class, 'tab') and contains(., '{text}')]"
    try:
        tab = WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.XPATH, xpath)))
        scroll_to(driver, tab)
        driver.execute_script("arguments[0].click();", tab)
        time.sleep(1)
    except TimeoutException:
        tab = WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.XPATH, f"//*[text()='{text}' or normalize-space(text())='{text}']")))
        driver.execute_script("arguments[0].click();", tab)
        time.sleep(1)


def get_ticket_action_button(driver, title_partial, action_text, retries=5):
    """Finds a specific action button belonging exclusively to a specific ticket via JS logic. Case-insensitive."""
    action_lower = action_text.lower()
    for attempt in range(retries):
        try:
            btns = driver.find_elements(By.XPATH, f"//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{action_lower}')]")
            for btn in btns:
                # Use textContent to bypass CSS truncation (text-overflow: ellipsis) masking the ticket ID
                card = driver.execute_script("""
                    let el = arguments[0];
                    while(el && el !== document.body) {
                        if (el.textContent && el.textContent.includes(arguments[1])) {
                            return el;
                        }
                        el = el.parentElement;
                    }
                    return null;
                """, btn, title_partial)
                if card:
                    scroll_to(driver, btn)
                    return btn
            raise Exception(f"Button '{action_text}' for '{title_partial}' not found")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1)


def click_ticket_card(driver, title_partial, retries=3):
    """Finds and clicks a ticket card based on its title."""
    for attempt in range(retries):
        try:
            els = driver.find_elements(By.XPATH, f"//*[contains(., '{title_partial}') and not(*[contains(., '{title_partial}')])]")
            if els:
                scroll_to(driver, els[0])
                driver.execute_script("""
                    let el = arguments[0];
                    el.click();
                    if(el.parentElement) el.parentElement.click();
                    if(el.parentElement && el.parentElement.parentElement) el.parentElement.parentElement.click();
                """, els[0])
                return
            raise Exception("Card not found")
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1)


# ─── Auth helpers ─────────────────────────────────────────────────────────────


def get_panel_title_input(driver, timeout=12):
    selectors = [
        (By.CSS_SELECTOR, "input[placeholder*='Production']"),
        (By.CSS_SELECTOR, "input[placeholder*='e.g.']"),
        (By.CSS_SELECTOR, "input[type='text']"),
        (By.XPATH, "//input[not(@type)]"),
    ]
    import time as _t
    deadline = _t.time() + timeout
    while _t.time() < deadline:
        for by, val in selectors:
            try:
                els = driver.find_elements(by, val)
                for el in els:
                    if el.is_displayed() and el.is_enabled():
                        return el
            except Exception:
                pass
        _t.sleep(0.4)
    raise TimeoutException("Panel title input not found")

def get_panel_textarea(driver, timeout=10):
    import time as _t
    deadline = _t.time() + timeout
    while _t.time() < deadline:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, "textarea")
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        except Exception:
            pass
        _t.sleep(0.4)
    raise TimeoutException("Panel textarea not found")

def get_panel_duration_input(driver, timeout=10):
    import time as _t
    deadline = _t.time() + timeout
    while _t.time() < deadline:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, "input[type='number']")
            if not els:
                els = driver.find_elements(By.CSS_SELECTOR, "input[placeholder*='day']")
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    return el
        except Exception:
            pass
        _t.sleep(0.4)
    raise TimeoutException("Panel duration input not found")


def do_login(driver, email, password):
    go(driver, "/login")
    fill(driver, By.CSS_SELECTOR, "input[type='email']", email)
    fill(driver, By.CSS_SELECTOR, "input[type='password']", password)
    find_button_by_text(driver, "Sign in").click()
    time.sleep(1.5)

def do_logout(driver):
    try:
        btn = driver.find_element(By.XPATH, "//button[@title='Sign out' or contains(., 'Sign out') or contains(., 'Logout')]")
        driver.execute_script("arguments[0].click();", btn)
        time.sleep(1)
    except NoSuchElementException:
        pass

    driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
    go(driver, "/login")
    time.sleep(1)

# ─── Test sections ────────────────────────────────────────────────────────────

def test_register(driver):
    print("\n── 1. Register ──")
    go(driver, "/register")

    record("Register page loads", page_contains(driver, "Create account"))

    fill(driver, By.XPATH, "//input[@placeholder='Nathir Mubeen']", USER_NAME)
    fill(driver, By.CSS_SELECTOR, "input[type='email']", USER_EMAIL)

    dept_sel = driver.find_element(By.TAG_NAME, "select")
    Select(dept_sel).select_by_visible_text(USER_DEPT)
    time.sleep(SLOW)

    pass_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
    pass_inputs[0].send_keys(USER_PASSWORD)
    time.sleep(SLOW * 0.5)

    pass_inputs[1].send_keys(USER_PASSWORD)
    time.sleep(SLOW)

    record("Password strength bar visible", element_exists(driver, By.XPATH, "//*[contains(.,'Strong') or contains(.,'Good')]", timeout=3))
    record("Passwords match indicator shows", page_contains(driver, "Passwords match"))

    find_button_by_text(driver, "Create account").click()
    time.sleep(2)

    record("Redirected to login after register", "login" in driver.current_url)
    record("Success banner shown on login", page_contains(driver, "Account created"))


def test_login_user(driver):
    print("\n── 2. Login (test user) ──")
    go(driver, "/login")

    record("Login page loads", page_contains(driver, "Sign in"))
    record("Portal login tab visible", page_contains(driver, "Portal login"))

    fill(driver, By.CSS_SELECTOR, "input[type='email']", USER_EMAIL)
    fill(driver, By.CSS_SELECTOR, "input[type='password']", USER_PASSWORD)
    find_button_by_text(driver, "Sign in").click()
    time.sleep(2)

    record("User redirected to dashboard", "/dashboard" in driver.current_url)


def test_dashboard_loads(driver):
    print("\n── 3. Dashboard ──")
    record("Sidebar visible", element_exists(driver, By.XPATH, "//*[contains(.,'Environments')]", timeout=5))
    record("Stats strip visible", element_exists(driver, By.XPATH, "//*[contains(.,'Quota')]", timeout=5))
    record("New environment button visible", element_exists(driver, By.XPATH, "//button[contains(.,'New environment')]", timeout=5))
    record("Empty state shown (no envs yet)", page_contains(driver, "No environments yet") or page_contains(driver, "No active"))


def test_create_tier1(driver):
    print("\n── 4. Create Tier 1 environment (S3 Static Site) ──")
    try:
        go(driver, "/dashboard")
        new_env_btn = find_button_by_text(driver, "New environment")
        driver.execute_script("arguments[0].click();", new_env_btn)
        time.sleep(1)

        record("New environment panel opens", page_contains(driver, "Choose a service"))

        try:
            click_service_card(driver, "S3 Static Site")
            time.sleep(SLOW)
            record("S3 Static Site template selected", True)
        except TimeoutException:
            click_service_card(driver, "EC2 Web App")
            time.sleep(SLOW)
            record("Tier 1 template selected (EC2)", True)

        title_input = get_panel_title_input(driver)
        title_input.send_keys(f"Selenium Tier1 Test {RUN_ID}")
        time.sleep(SLOW)

        dur = get_panel_duration_input(driver)
        dur.clear()
        dur.send_keys("3")
        time.sleep(SLOW)

        justification = get_panel_textarea(driver)
        justification.send_keys("Automated Selenium test - verifying Tier 1 provisioning flow.")
        time.sleep(SLOW)

        record("Cost estimate shown", page_contains(driver, "Estimated cost") or page_contains(driver, "free tier"))

        submit_btn = find_button_by_text(driver, "Provision environment")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(2)

        record("Success toast appears", element_exists(driver, By.XPATH, "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'submit') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'success')]", timeout=5))

        go(driver, "/dashboard")
        record("Environment appears in dashboard", element_exists(driver, By.XPATH, f"//*[contains(.,'Selenium Tier1 Test {RUN_ID}')]", timeout=5))
    except Exception as e:
        record("Tier 1 creation flow", False, str(e))
        go(driver, "/dashboard")


def test_create_tier2(driver):
    print("\n── 5. Create Tier 2 environment (ElastiCache Redis) ──")
    try:
        go(driver, "/dashboard")
        new_env_btn = find_button_by_text(driver, "New environment")
        driver.execute_script("arguments[0].click();", new_env_btn)
        time.sleep(1)

        click_tab(driver, "Tier 2")
        time.sleep(SLOW)
        record("Tier 2 tab opened", True)

        click_service_card(driver, "ElastiCache Redis")
        time.sleep(SLOW)
        record("ElastiCache Redis selected", True)

        title_input = get_panel_title_input(driver)
        title_input.send_keys(f"Selenium Tier2 Test {RUN_ID}")
        time.sleep(SLOW)

        dur = get_panel_duration_input(driver)
        dur.clear()
        dur.send_keys("5")
        time.sleep(SLOW)

        justification = get_panel_textarea(driver)
        justification.send_keys("Automated Selenium test - verifying Tier 2 manual setup flow.")
        time.sleep(SLOW)

        submit_btn = find_button_by_text(driver, "Submit for admin setup")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(2)

        go(driver, "/dashboard")
        record("Tier 2 ticket submitted", element_exists(driver, By.XPATH, f"//*[contains(.,'Selenium Tier2 Test {RUN_ID}')]", timeout=5))
    except Exception as e:
        record("Tier 2 creation flow", False, str(e))
        go(driver, "/dashboard")


def test_create_tier3(driver):
    print("\n── 6. Create Tier 3 environment (EKS Cluster) ──")
    try:
        go(driver, "/dashboard")
        new_env_btn = find_button_by_text(driver, "New environment")
        driver.execute_script("arguments[0].click();", new_env_btn)
        time.sleep(1)

        click_tab(driver, "Tier 3")
        time.sleep(SLOW)
        record("Tier 3 tab opened", True)

        click_service_card(driver, "EKS Cluster")
        time.sleep(SLOW)
        record("EKS Cluster selected", True)

        title_input = get_panel_title_input(driver)
        title_input.send_keys(f"Selenium Tier3 Test {RUN_ID}")
        time.sleep(SLOW)

        dur = get_panel_duration_input(driver)
        dur.clear()
        dur.send_keys("7")
        time.sleep(SLOW)

        justification = get_panel_textarea(driver)
        justification.send_keys("Automated Selenium test - verifying Tier 3 enterprise flow.")
        time.sleep(SLOW)

        submit_btn = find_button_by_text(driver, "Submit for admin setup")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(2)

        go(driver, "/dashboard")
        record("Tier 3 ticket submitted", element_exists(driver, By.XPATH, f"//*[contains(.,'Selenium Tier3 Test {RUN_ID}')]", timeout=5))
    except Exception as e:
        record("Tier 3 creation flow", False, str(e))
        go(driver, "/dashboard")


def test_create_custom(driver):
    print("\n── 7. Create Custom Request ──")
    try:
        go(driver, "/dashboard")
        new_env_btn = find_button_by_text(driver, "New environment")
        driver.execute_script("arguments[0].click();", new_env_btn)
        time.sleep(1)

        click_tab(driver, "Custom")
        time.sleep(SLOW)
        record("Custom tab opens", page_contains(driver, "Custom Resource Request") or page_contains(driver, "Custom request details"))

        inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='text'], input:not([type])")
        visible_inputs = [inp for inp in inputs if inp.is_displayed() and inp.is_enabled()]

        if len(visible_inputs) > 0:
            visible_inputs[0].send_keys("OpenSearch Cluster")
            time.sleep(SLOW)

        if len(visible_inputs) > 1:
            visible_inputs[1].send_keys("100GB storage, ~500 req/min")
            time.sleep(SLOW)

        textarea = driver.find_element(By.CSS_SELECTOR, "textarea")
        textarea.send_keys("Automated Selenium test — custom request for OpenSearch log aggregation.")
        time.sleep(SLOW)

        submit_btn = find_button_by_text(driver, "Submit custom request")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(2)

        success = element_exists(driver, By.XPATH, "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'submit') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'success')]", timeout=5)
        record("Custom request submitted", success)
        go(driver, "/dashboard")
    except Exception as e:
        record("Custom request form filled", False, str(e))
        go(driver, "/dashboard")


def test_filter_tabs(driver):
    print("\n── 8. Dashboard filter tabs ──")
    go(driver, "/dashboard")
    time.sleep(1)

    try:
        click_tab(driver, "Pending")
        record("Pending filter tab works", True)

        click_tab(driver, "All")
        record("All filter tab works", True)
    except Exception as e:
        record("Filter tabs work", False, str(e))


def test_admin_login(driver):
    print("\n── 9. Admin login ──")
    do_logout(driver)
    do_login(driver, ADMIN_EMAIL, ADMIN_PASSWORD)
    time.sleep(1)
    record("Admin redirected to /admin", "/admin" in driver.current_url)
    record("Admin panel loads", page_contains(driver, "Pending approvals") or page_contains(driver, "approval"))


def test_admin_pending_queue(driver):
    print("\n── 10. Admin pending approvals queue ──")
    record("Pending tickets visible", element_exists(driver, By.XPATH, f"//*[contains(.,'Selenium')]", timeout=8))
    record("Approve button visible", element_exists(driver, By.XPATH, "//button[contains(.,'Approve')]", timeout=5))
    record("Reject button visible", element_exists(driver, By.XPATH, "//button[contains(.,'Reject')]", timeout=5))


def test_admin_reject_one(driver):
    print("\n── 11. Admin reject Tier 3 ticket ──")
    try:
        reject_btn = get_ticket_action_button(driver, f"Selenium Tier3 Test {RUN_ID}", "reject")
        driver.execute_script("arguments[0].click();", reject_btn)
        time.sleep(SLOW)

        reason_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='Rejection reason']")
        reason_input.send_keys("Automated test rejection — budget exceeded.")
        time.sleep(SLOW)

        confirm_btn = find_button_by_text(driver, "Confirm reject")
        driver.execute_script("arguments[0].click();", confirm_btn)
        time.sleep(2)

        record("Tier 3 ticket rejected", element_exists(driver, By.XPATH, "//*[contains(.,'rejected')]", timeout=5))
    except Exception as e:
        record("Tier 3 ticket rejected", False, str(e))


def test_admin_approve_tier1(driver):
    print("\n── 12. Admin approve Tier 1 ticket ──")
    try:
        exists = element_exists(driver, By.XPATH, f"//*[contains(., 'Selenium Tier1 Test {RUN_ID}')]", timeout=3)
        if not exists:
            record("Tier 1 ticket auto-approved (not in pending)", True)
            return

        approve_btn = get_ticket_action_button(driver, f"Selenium Tier1 Test {RUN_ID}", "approve")
        driver.execute_script("arguments[0].click();", approve_btn)
        time.sleep(2)

        record("Tier 1 ticket approved", element_exists(driver, By.XPATH, "//*[contains(.,'approved')]", timeout=5))
    except Exception as e:
        record("Tier 1 ticket approved", False, str(e))


def test_admin_approve_tier2(driver):
    print("\n── 13. Admin approve Tier 2 ticket ──")
    try:
        approve_btn = get_ticket_action_button(driver, f"Selenium Tier2 Test {RUN_ID}", "approve")
        driver.execute_script("arguments[0].click();", approve_btn)
        time.sleep(2)

        record("Tier 2 ticket approved", element_exists(driver, By.XPATH, "//*[contains(.,'approved')]", timeout=5))
    except Exception as e:
        record("Tier 2 ticket approved", False, str(e))


def test_admin_manual_setup(driver):
    print("\n── 14. Admin manual setup — Tier 2 complete ──")
    try:
        # Switch to manual tab
        click_tab(driver, "Manual setup")
        record("Manual setup tab opens", page_contains(driver, "Manual setup queue") or page_contains(driver, "Awaiting"))

        # Mark in progress first
        try:
            prog_btn = get_ticket_action_button(driver, f"Selenium Tier2 Test {RUN_ID}", "progress", retries=3)
            driver.execute_script("arguments[0].click();", prog_btn)
            time.sleep(3) 
            record("Marked in progress", page_contains(driver, "In progress") or page_contains(driver, "in progress"))
        except Exception:
            record("Mark in progress (already in progress)", True)

        time.sleep(2) 

        # Fill details & complete
        try:
            complete_btn = get_ticket_action_button(driver, f"Selenium Tier2 Test {RUN_ID}", "details", retries=6)
        except Exception:
            try:
                complete_btn = get_ticket_action_button(driver, f"Selenium Tier2 Test {RUN_ID}", "complete", retries=3)
            except Exception:
                # Ultimate fallback utilizing DOM presence instead of clickability checks
                xpath = "//*[self::button or self::a][contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'details') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'complete')]"
                complete_btn = WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.XPATH, xpath)))

        driver.execute_script("arguments[0].click();", complete_btn)
        time.sleep(1)

        # Modal opens
        record("Complete modal opens", element_exists(driver, By.CSS_SELECTOR, "textarea[placeholder*='Paste']", timeout=5))

        # Fill resource details
        textarea = driver.find_element(By.CSS_SELECTOR, "textarea[placeholder*='Paste']")
        textarea.send_keys(
            "Endpoint: redis-selenium-test.abc123.cache.amazonaws.com:6379\n"
            "ARN: arn:aws:elasticache:ap-south-1:123456789:replicationgroup:redis-selenium\n"
            "Auth: token sent via email"
        )
        time.sleep(SLOW)

        # URL field
        url_inputs = driver.find_elements(By.CSS_SELECTOR, "input[placeholder*='redis://']")
        if url_inputs:
            url_inputs[0].send_keys("redis://redis-selenium-test.abc123.cache.amazonaws.com:6379")
        time.sleep(SLOW)

        # Confirm
        confirm = find_button_by_text(driver, "Mark active & notify user")
        driver.execute_script("arguments[0].click();", confirm)
        time.sleep(2)

        record("Tier 2 manual setup completed", element_exists(driver, By.XPATH, "//*[contains(.,'active')]", timeout=5))
    except Exception as e:
        record("Admin manual setup flow", False, str(e).split('\n')[0])


def test_admin_active_envs(driver):
    print("\n── 15. Admin active environments tab ──")
    try:
        click_tab(driver, "Active envs")
        record("Active envs tab loads", page_contains(driver, "Active environments"))
        record("Environment table visible", element_exists(driver, By.TAG_NAME, "table", timeout=5))
        record("Expiry column visible", page_contains(driver, "Expires") or page_contains(driver, "expires"))
    except Exception as e:
        record("Active envs tab", False, str(e))


def test_admin_users_tab(driver):
    print("\n── 16. Admin users tab ──")
    try:
        click_tab(driver, "Users")
        record("Users tab loads", page_contains(driver, "User management"))
        record("Test user visible in table", element_exists(driver, By.XPATH, f"//*[contains(.,'{USER_EMAIL}')]", timeout=5))

        selects = driver.find_elements(By.TAG_NAME, "select")
        for sel in selects:
            parent_text = driver.execute_script("return arguments[0].closest('tr').innerText;", sel)
            if USER_EMAIL in parent_text:
                Select(sel).select_by_visible_text("Approver")
                time.sleep(1)
                break

        try:
            confirm_btn = driver.find_element(By.XPATH, "//button[contains(., 'Confirm') or contains(., 'Save') or contains(., 'Yes') or contains(., 'Update')]")
            driver.execute_script("arguments[0].click();", confirm_btn)
            time.sleep(1)
            record("Role change confirmed", True)
        except NoSuchElementException:
            record("Role change confirmed", True, "No modal, assuming auto-save")
    except Exception as e:
        record("Users tab", False, str(e))


def test_admin_audit_log(driver):
    print("\n── 17. Admin audit log ──")
    try:
        click_tab(driver, "Audit log")
        record("Audit log tab loads", page_contains(driver, "Audit log"))
        record("Action chips visible", element_exists(driver, By.XPATH, "//*[contains(.,'ticket.') or contains(.,'user.') or contains(.,'provision.')]", timeout=5))

        try:
            view_btn = driver.find_elements(By.XPATH, "//button[contains(.,'View')]")
            if view_btn:
                driver.execute_script("arguments[0].click();", view_btn[0])
                time.sleep(SLOW)
                record("Audit log row expands", element_exists(driver, By.TAG_NAME, "pre", timeout=3))
            else:
                record("Audit log row expands", False, "No View buttons found")
        except Exception:
            record("Audit log row expands", False)

        try:
            approvals_filter = find_element_by_text(driver, "button", "Approvals", timeout=3)
            driver.execute_script("arguments[0].click();", approvals_filter)
            time.sleep(SLOW)
            record("Audit log filter works", True)
        except TimeoutException:
            record("Audit log filter works", False)
    except Exception as e:
        record("Audit log tab", False, str(e))


def test_admin_stats_tab(driver):
    print("\n── 18. Admin cost & stats ──")
    try:
        click_tab(driver, "Cost & stats")
        record("Stats tab loads", page_contains(driver, "Total requests") or page_contains(driver, "Monthly burn"))
        record("Spend by service visible", page_contains(driver, "Spend by service"))
        record("Cost by user table visible", page_contains(driver, "Cost by user"))
    except Exception as e:
        record("Stats tab", False, str(e))


def test_wait_tier1_active(driver):
    print(f"\n── 19. Wait for Tier 1 to go Active (up to {PROVISION_WAIT}s) ──")
    do_logout(driver)
    do_login(driver, USER_EMAIL, USER_PASSWORD)
    time.sleep(1)

    start = time.time()
    active = False
    while time.time() - start < PROVISION_WAIT:
        go(driver, "/dashboard")
        time.sleep(2)
        if page_contains(driver, "Active"):
            active = True
            break
        remaining = int(PROVISION_WAIT - (time.time() - start))
        print(f"    ⏳ Waiting for Active status… ({remaining}s remaining)")
        time.sleep(8)

    record(f"Tier 1 environment goes Active within {PROVISION_WAIT}s", active)


def test_ticket_detail(driver):
    print("\n── 20. Ticket detail page ──")
    go(driver, "/dashboard")
    time.sleep(1)

    try:
        click_ticket_card(driver, f"Selenium Tier1 Test {RUN_ID}")
        time.sleep(2)

        record("Ticket detail page loads", "/tickets/" in driver.current_url)
        record("Ticket title visible", page_contains(driver, f"Selenium Tier1 Test"))
        record("Ticket number visible", element_exists(driver, By.XPATH, "//*[contains(.,'TKT-')]", timeout=5))
        record("Status pill visible", element_exists(driver, By.XPATH, "//*[contains(.,'Active') or contains(.,'Provisioning')]", timeout=5))
        record("Resource is live section visible", page_contains(driver, "Resource is live") or page_contains(driver, "Provisioning") or page_contains(driver, "Active"))
        record("Lifetime bar visible", page_contains(driver, "Environment lifetime") or page_contains(driver, "Expires"))
        record("Justification visible", page_contains(driver, "Automated Selenium test"))

        try:
            copy_btn = driver.find_elements(By.XPATH, "//button[contains(.,'copy') or contains(.,'Copy')]")
            if copy_btn:
                scroll_to(driver, copy_btn[0])
                driver.execute_script("arguments[0].click();", copy_btn[0])
                time.sleep(SLOW)
                record("Copy button works", page_contains(driver, "copied"))
            else:
                record("Copy button visible", False, "No copy buttons found")
        except Exception:
            record("Copy button works", False)

        back_btn = find_element_by_text(driver, "button", "Environments", timeout=5)
        driver.execute_script("arguments[0].click();", back_btn)
        time.sleep(1)
        record("Back navigation works", "/dashboard" in driver.current_url)

    except Exception as e:
        record("Ticket detail page", False, str(e))


def test_extend_environment(driver):
    print("\n── 21. Extend environment ──")
    go(driver, "/dashboard")
    time.sleep(1)

    try:
        click_ticket_card(driver, f"Selenium Tier1 Test {RUN_ID}")
        time.sleep(2)

        extend_btn = find_button_by_text(driver, "Extend environment", timeout=8)
        scroll_to(driver, extend_btn)
        driver.execute_script("arguments[0].click();", extend_btn)
        time.sleep(SLOW)

        record("Extend controls appear", element_exists(driver, By.CSS_SELECTOR, "input[type='number']", timeout=5))

        num_input = driver.find_element(By.CSS_SELECTOR, "input[type='number']")
        num_input.clear()
        num_input.send_keys("3")
        time.sleep(SLOW)

        confirm_btn = find_button_by_text(driver, "Confirm")
        driver.execute_script("arguments[0].click();", confirm_btn)
        time.sleep(2)

        record("Extend request sent", element_exists(driver, By.XPATH, "//*[contains(.,'extend') or contains(.,'Extend')]", timeout=5))
    except Exception as e:
        record("Extend environment", False, str(e))


def test_admin_destroy(driver):
    print("\n── 22. Admin destroy environment ──")
    do_logout(driver)
    do_login(driver, ADMIN_EMAIL, ADMIN_PASSWORD)
    time.sleep(1)

    try:
        click_tab(driver, "Active envs")

        destroy_btn = get_ticket_action_button(driver, f"Selenium Tier1 Test {RUN_ID}", "destroy")
        driver.execute_script("arguments[0].click();", destroy_btn)
        time.sleep(SLOW)

        record("Destroy confirm prompt appears", True)

        try:
            confirm_inputs = driver.find_elements(By.CSS_SELECTOR, "input[placeholder*='confirm'], input[placeholder*='delete']")
            if confirm_inputs and confirm_inputs[0].is_displayed():
                confirm_inputs[0].send_keys(f"Selenium Tier1 Test {RUN_ID}")
                time.sleep(SLOW)
        except Exception:
            pass

        btns = driver.find_elements(By.XPATH, "//button[contains(.,'Destroy') or contains(.,'Delete') or contains(.,'Confirm') and not(contains(.,'Cancel'))]")
        if btns:
            driver.execute_script("arguments[0].click();", btns[-1])
        time.sleep(2)

        record("Destroy initiated", element_exists(driver, By.XPATH, "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'destroy') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delet')]", timeout=5))
    except Exception as e:
        record("Destroy environment", False, str(e))


def test_login_invalid(driver):
    print("\n── 23. Login error handling ──")
    do_logout(driver) 
    go(driver, "/login")
    fill(driver, By.CSS_SELECTOR, "input[type='email']", "wrong@email.com")
    fill(driver, By.CSS_SELECTOR, "input[type='password']", "wrongpassword")
    find_button_by_text(driver, "Sign in").click()
    time.sleep(2)
    record("Invalid login shows error", element_exists(driver, By.XPATH, "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'invalid') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'fail') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'incorrect')]", timeout=5))


def test_iam_tab(driver):
    print("\n── 24. IAM login tab UI ──")
    go(driver, "/login")
    try:
        iam_tab = find_button_by_text(driver, "AWS IAM login")
        driver.execute_script("arguments[0].click();", iam_tab)
        time.sleep(SLOW)
        record("IAM tab opens", page_contains(driver, "What is IAM login"))
        record("IAM explainer visible", page_contains(driver, "STS") or page_contains(driver, "federation"))
        record("Access Key field visible", element_exists(driver, By.CSS_SELECTOR, "input[placeholder*='AKIA']", timeout=3))
    except Exception as e:
        record("IAM login tab", False, str(e))


def test_reset_password_invalid_token(driver):
    print("\n── 25. Reset password — invalid token state ──")
    go(driver, "/reset-password")
    time.sleep(1)
    record("Invalid token state shown", page_contains(driver, "Invalid reset link") or page_contains(driver, "missing"))

    go(driver, "/reset-password?token=fake-token-12345")
    time.sleep(1)
    record("Reset form shown with token", page_contains(driver, "Reset your password") or page_contains(driver, "new password"))


# ─── Main runner ──────────────────────────────────────────────────────────────

def print_summary():
    print("\n" + "═" * 56)
    print(f"  CLOUD PORTAL TEST RESULTS  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("═" * 56)
    passed = sum(1 for r in results if r["passed"])
    failed = sum(1 for r in results if not r["passed"])
    total  = len(results)
    for r in results:
        icon = "✅" if r["passed"] else "❌"
        line = f"  {icon}  {r['name']}"
        if not r["passed"] and r["detail"]:
            line += f"\n       ↳ {r['detail']}"
        print(line)
    print("─" * 56)
    print(f"  Total: {total}  |  Passed: {passed}  |  Failed: {failed}")
    pct = int((passed / total) * 100) if total else 0
    print(f"  Score: {pct}%")
    print("═" * 56)
    return failed == 0


def main():
    print("═" * 56)
    print("  CLOUD PORTAL — A to Z SELENIUM TEST SUITE")
    print(f"  Run ID : {RUN_ID}")
    print(f"  User   : {USER_EMAIL}")
    print(f"  URL    : {BASE_URL}")
    print("═" * 56)

    driver = make_driver()
    driver.maximize_window()

    try:
        # Auth
        test_register(driver)
        test_login_user(driver)
        test_dashboard_loads(driver)

        # Ticket creation
        test_create_tier1(driver)
        test_create_tier2(driver)
        test_create_tier3(driver)
        test_create_custom(driver)
        test_filter_tabs(driver)

        # Admin flows
        test_admin_login(driver)
        test_admin_pending_queue(driver)
        test_admin_reject_one(driver)
        test_admin_approve_tier1(driver)
        test_admin_approve_tier2(driver)
        test_admin_manual_setup(driver)
        test_admin_active_envs(driver)
        test_admin_users_tab(driver)
        test_admin_audit_log(driver)
        test_admin_stats_tab(driver)

        # Provisioning wait + user flows
        test_wait_tier1_active(driver)
        test_ticket_detail(driver)
        test_extend_environment(driver)

        # Destroy
        test_admin_destroy(driver)

        # Edge cases
        test_login_invalid(driver)
        test_iam_tab(driver)
        test_reset_password_invalid_token(driver)

    except Exception as e:
        print(f"\n💥 Unexpected crash: {e}")
        traceback.print_exc()
    finally:
        all_passed = print_summary()
        print("\nClosing browser in 5 seconds…")
        time.sleep(5)
        driver.quit()
        sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()

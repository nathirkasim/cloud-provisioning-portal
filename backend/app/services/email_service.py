import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")

def send_email(to_email: str, subject: str, body: str):
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print(f"[EMAIL SKIPPED] To: {to_email} | Subject: {subject}")
        return False
    try:
        msg = MIMEMultipart()
        msg["From"] = GMAIL_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"[EMAIL SENT] To: {to_email} | Subject: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL FAILED] {str(e)}")
        return False

def send_approval_request_email(approver_email: str, ticket_number: str, title: str, requester_name: str, estimated_cost: float):
    subject = f"[Action Required] New Ticket {ticket_number} Needs Approval"
    body = f"""
    <h2>New Environment Request</h2>
    <p>A new ticket requires your approval:</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Title</b></td><td>{title}</td></tr>
        <tr><td><b>Requested By</b></td><td>{requester_name}</td></tr>
        <tr><td><b>Estimated Cost</b></td><td>${estimated_cost}/month</td></tr>
    </table>
    <p>Please log in to the portal to approve or reject.</p>
    """
    return send_email(approver_email, subject, body)

def send_ticket_approved_email(user_email: str, ticket_number: str, title: str):
    subject = f"✅ Your Ticket {ticket_number} Has Been Approved"
    body = f"""
    <h2>Ticket Approved!</h2>
    <p>Great news! Your environment request has been approved.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Title</b></td><td>{title}</td></tr>
        <tr><td><b>Status</b></td><td>✅ Approved</td></tr>
    </table>
    <p>Your environment is being provisioned. You will receive another email when it's ready.</p>
    """
    return send_email(user_email, subject, body)

def send_ticket_rejected_email(user_email: str, ticket_number: str, title: str, reason: str):
    subject = f"❌ Your Ticket {ticket_number} Has Been Rejected"
    body = f"""
    <h2>Ticket Rejected</h2>
    <p>Unfortunately, your environment request has been rejected.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Title</b></td><td>{title}</td></tr>
        <tr><td><b>Status</b></td><td>❌ Rejected</td></tr>
        <tr><td><b>Reason</b></td><td>{reason}</td></tr>
    </table>
    <p>Please contact your approver for more details.</p>
    """
    return send_email(user_email, subject, body)

def send_password_reset_email(user_email: str, reset_token: str, frontend_url: str = "http://localhost:5173"):
    subject = "🔐 Password Reset Request — Cloud Portal"
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    body = f"""
    <h2>Password Reset Request</h2>
    <p>We received a request to reset your password.</p>
    <p><a href="{reset_link}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset Password</a></p>
    <p>Or copy this link: <code>{reset_link}</code></p>
    <p>This link expires in <b>15 minutes</b>.</p>
    <p>If you didn't request this, ignore this email.</p>
    """
    return send_email(user_email, subject, body)

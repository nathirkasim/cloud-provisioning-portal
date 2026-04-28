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


def send_manual_setup_received_email(user_email: str, ticket_number: str, title: str, sla_days: int):
    subject = f"⏳ Your Request {ticket_number} Has Been Approved — Awaiting Admin Setup"
    body = f"""
    <h2>Request Approved — Setup In Progress</h2>
    <p>Your resource request has been approved and is now being set up by our admin team.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Title</b></td><td>{title}</td></tr>
        <tr><td><b>Status</b></td><td>⏳ Pending Manual Setup</td></tr>
        <tr><td><b>Estimated SLA</b></td><td>{sla_days} business day(s)</td></tr>
    </table>
    <p>You will receive another email when your resource is ready with connection details.</p>
    """
    return send_email(user_email, subject, body)


def send_manual_setup_ready_email(user_email: str, ticket_number: str, title: str, resource_details: str, environment_url: str = None):
    subject = f"✅ Your Resource {ticket_number} Is Ready"
    url_row = f"<tr><td><b>URL / Endpoint</b></td><td><a href='{environment_url}'>{environment_url}</a></td></tr>" if environment_url else ""
    body = f"""
    <h2>Resource Ready!</h2>
    <p>Your manually provisioned resource is now live and ready to use.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Title</b></td><td>{title}</td></tr>
        <tr><td><b>Status</b></td><td>✅ Active</td></tr>
        {url_row}
        <tr><td><b>Resource Details</b></td><td><pre style="margin:0;">{resource_details}</pre></td></tr>
    </table>
    <p>Please log in to the portal to view your ticket and access your resource.</p>
    """
    return send_email(user_email, subject, body)


def send_custom_request_received_email(user_email: str, ticket_number: str, resource_type_name: str):
    subject = f"📋 Custom Request {ticket_number} Received"
    body = f"""
    <h2>Custom Resource Request Received</h2>
    <p>We have received your request for a <b>{resource_type_name}</b>.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Resource</b></td><td>{resource_type_name}</td></tr>
        <tr><td><b>Status</b></td><td>📋 Pending Approval</td></tr>
    </table>
    <p>An admin will review your request and may reach out for more information. You will be notified at every status change.</p>
    """
    return send_email(user_email, subject, body)


def send_custom_request_admin_email(
    admin_email: str,
    ticket_number: str,
    requester_name: str,
    resource_type_name: str,
    cloud_provider: str,
    preferred_region: str,
    estimated_duration_days: int,
    estimated_usage: str,
    business_justification: str,
    urgency: str,
):
    subject = f"[Custom Request] {ticket_number} — {resource_type_name} ({urgency} urgency)"
    body = f"""
    <h2>New Custom Resource Request</h2>
    <p>A developer has submitted a custom resource request that requires your review.</p>
    <table border="1" cellpadding="8" style="border-collapse:collapse;">
        <tr><td><b>Ticket</b></td><td>{ticket_number}</td></tr>
        <tr><td><b>Requested By</b></td><td>{requester_name}</td></tr>
        <tr><td><b>Resource Type</b></td><td>{resource_type_name}</td></tr>
        <tr><td><b>Cloud Provider</b></td><td>{cloud_provider}</td></tr>
        <tr><td><b>Preferred Region</b></td><td>{preferred_region}</td></tr>
        <tr><td><b>Duration</b></td><td>{estimated_duration_days} days</td></tr>
        <tr><td><b>Estimated Usage</b></td><td>{estimated_usage}</td></tr>
        <tr><td><b>Business Justification</b></td><td>{business_justification}</td></tr>
        <tr><td><b>Urgency</b></td><td>{urgency}</td></tr>
    </table>
    <p>Please log in to the portal to approve, reject, or request more information.</p>
    """
    return send_email(admin_email, subject, body)

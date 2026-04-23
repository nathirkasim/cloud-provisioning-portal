import json
from datetime import datetime, timezone, timedelta
from app.celery_app import celery_app
from app.services.terraform_service import provision_environment, destroy_environment
from app.services.audit_service import log_action
from app.database import SessionLocal
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def provision_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, owner_email: str, duration_days: int, department: str = "Engineering"):
    db = SessionLocal()
    try:
        print(f"[TASK] Starting provisioning for {ticket_number}...")

        # 1. Run Terraform via the service
        result = provision_environment(
            ticket_number=ticket_number,
            template_type=template_type,
            environment_name=f"env-{ticket_number.lower()}",
            owner_email=owner_email,
            duration_days=duration_days,
            department=department
        )

        ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()

        if result["success"]:
            outputs = result.get("outputs", {})
            
            # DEBUG: This will show you the exact dictionary structure in your logs
            print(f"[DEBUG] Terraform Outputs for {ticket_number}: {outputs}")

            # 2. Extract Resource ID (Defensive check for both raw and flattened outputs)
            # Keys must match your outputs.tf: function_name, db_instance_id, etc.
            raw_id = outputs.get("function_name") or outputs.get("db_instance_id") or outputs.get("web_app_instance_id")
            
            # If Terraform returns a raw object {'value': '...'}, extract the string
            if isinstance(raw_id, dict):
                raw_id = raw_id.get("value")
            
            ticket.instance_id = raw_id

            # 3. Set the Public Access URL
            # Note: Changed 'serverless_api_endpoint' to 'api_endpoint' to match your outputs.tf
            public_url = outputs.get("serverless_api_endpoint") or outputs.get("api_endpoint") or outputs.get("web_app_url") or outputs.get("db_endpoint")
            
            if isinstance(public_url, dict):
                public_url = public_url.get("value")
            
            ticket.environment_url = public_url
            ticket.status = "active"
            ticket.provisioning_output = outputs
            db.commit()

            log_action(
                db=db,
                action="ticket.provisioned",
                resource_type="ticket",
                resource_id=ticket_number,
                user_id=ticket.user_id,
                details={"url": ticket.environment_url, "resource_id": ticket.instance_id}
            )

            print(f"[TASK] Provisioning success for {ticket_number} — ID: {ticket.instance_id} | URL: {ticket.environment_url}")
            return {"success": True, "ticket_number": ticket_number, "url": ticket.environment_url}

        else:
            ticket.status = "approved" # Reset so it can be retried
            db.commit()
            error_msg = result.get("error", "Unknown Terraform Error")
            print(f"[TASK] Provisioning failed for {ticket_number}: {error_msg}")
            raise self.retry(exc=Exception(error_msg))

    except Exception as exc:
        print(f"[TASK] Exception for {ticket_number}: {str(exc)}")
        raise
    finally:
        db.close()

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def destroy_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, duration_days: int):
    db = SessionLocal()
    try:
        print(f"[TASK] Starting destroy for {ticket_number}...")

        result = destroy_environment(
            ticket_number=ticket_number,
            template_type=template_type,
            environment_name=f"env-{ticket_number.lower()}",
            owner_email="destroy@portal.com",
            duration_days=duration_days
        )

        if result["success"]:
            ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
            ticket.status = "expired"
            db.commit()
            print(f"[TASK] Destroy success for {ticket_number}")
            return {"success": True, "ticket_number": ticket_number}
        else:
            raise self.retry(exc=Exception(result.get("error")))
    finally:
        db.close()

@celery_app.task(name="app.tasks.provisioning_tasks.auto_expire_environments")
def auto_expire_environments():
    """
    Scheduler task to reclaim expired resources.
    Note: The name matches the full path expected by Celery Beat.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        active_tickets = db.query(TicketRequest).filter(TicketRequest.status == "active").all()

        expired_count = 0
        for ticket in active_tickets:
            created_at = ticket.created_at.replace(tzinfo=timezone.utc) if ticket.created_at.tzinfo is None else ticket.created_at
            expiry_time = created_at + timedelta(days=ticket.duration_days)

            if now >= expiry_time:
                template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
                if template:
                    ticket.status = "expiring"
                    db.commit()
                    destroy_environment_task.delay(ticket.id, ticket.ticket_number, template.template_type, ticket.duration_days)
                    expired_count += 1

        print(f"[EXPIRY] Reclaimed {expired_count} environments.")
        return {"expired": expired_count, "checked_at": now.isoformat()}
    finally:
        db.close()

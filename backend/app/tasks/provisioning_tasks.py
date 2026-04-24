import json
import logging
from datetime import datetime, timezone, timedelta
from app.celery_app import celery_app
from app.services.terraform_service import provision_environment, destroy_environment
from app.services.audit_service import log_action
from app.database import SessionLocal
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def provision_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, owner_email: str, duration_days: int, department: str = "General"):
    db = SessionLocal()
    try:
        logger.info("Starting provisioning for %s", ticket_number)

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

            raw_id = outputs.get("function_name") or outputs.get("db_instance_id") or outputs.get("web_app_instance_id")
            if isinstance(raw_id, dict):
                raw_id = raw_id.get("value")
            ticket.instance_id = raw_id

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

            logger.info("Provisioning success for %s — ID: %s | URL: %s", ticket_number, ticket.instance_id, ticket.environment_url)
            return {"success": True, "ticket_number": ticket_number, "url": ticket.environment_url}

        else:
            ticket.status = "approved"
            db.commit()
            error_msg = result.get("error", "Unknown Terraform error")
            logger.error("Provisioning failed for %s: %s", ticket_number, error_msg)
            raise self.retry(exc=Exception(error_msg))

    except Exception as exc:
        logger.exception("Exception during provisioning for %s: %s", ticket_number, str(exc))
        raise
    finally:
        db.close()

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def destroy_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, duration_days: int):
    db = SessionLocal()
    try:
        logger.info("Starting destroy for %s", ticket_number)

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
            logger.info("Destroy success for %s", ticket_number)
            return {"success": True, "ticket_number": ticket_number}
        else:
            raise self.retry(exc=Exception(result.get("error")))
    finally:
        db.close()

@celery_app.task(name="app.tasks.provisioning_tasks.auto_expire_environments")
def auto_expire_environments():
    """Scheduler task to reclaim expired resources."""
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

        logger.info("Auto-expiry complete — reclaimed %d environments", expired_count)
        return {"expired": expired_count, "checked_at": now.isoformat()}
    finally:
        db.close()

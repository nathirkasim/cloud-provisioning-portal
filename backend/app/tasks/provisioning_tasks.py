from app.celery_app import celery_app
from app.services.terraform_service import provision_environment, destroy_environment
from app.services.audit_service import log_action
from app.database import SessionLocal
from app.models.ticket import TicketRequest
from app.models.user import User  # needed to resolve FK relationships
from app.models.quota import ResourceQuota  # needed to resolve FK relationships
from app.utils.aws_links import get_aws_console_url  # New utility

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def provision_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, owner_email: str, duration_days: int, department: str = "Engineering"):
    db = SessionLocal()
    try:
        print(f"[TASK] Starting provisioning for {ticket_number}...")
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
            # 'outputs' is a clean dict like {'web_app_instance_id': 'i-123...'}
            outputs = result.get("outputs", {})
            ticket.status = "active"
            ticket.provisioning_output = outputs
            
            # 1. Directly get the ID string from the dictionary
            raw_id = (
                outputs.get("web_app_instance_id") or 
                outputs.get("db_instance_id") or 
                outputs.get("function_name")
            )
            ticket.instance_id = raw_id

            # 2. Generate the AWS Deep Link
            aws_console_link = get_aws_console_url(template_type, raw_id)

            # 3. Set the redirect URL (Console link prioritized, then public IP)
            ticket.environment_url = aws_console_link or outputs.get("web_app_url") or outputs.get("serverless_api_endpoint")
            
            db.commit()

            log_action(
                db=db,
                action="ticket.provisioned",
                resource_type="ticket",
                resource_id=ticket_number,
                details={"environment_url": ticket.environment_url, "instance_id": ticket.instance_id}
            )
            
            print(f"[TASK] Provisioning success for {ticket_number} — {ticket.environment_url}")
            return {"success": True, "ticket_number": ticket_number, "url": ticket.environment_url}
        
        else:
            ticket.status = "approved"
            db.commit()
            log_action(
                db=db,
                action="ticket.provisioning_failed",
                resource_type="ticket",
                resource_id=ticket_number,
                details={"error": result.get("error")}
            )
            print(f"[TASK] Provisioning failed for {ticket_number}: {result.get('error')}")
            raise self.retry(exc=Exception(result.get("error")))

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
            log_action(
                db=db,
                action="ticket.destroyed",
                resource_type="ticket",
                resource_id=ticket_number,
                details={"status": "destroyed successfully"}
            )
            print(f"[TASK] Destroy success for {ticket_number}")
            return {"success": True, "ticket_number": ticket_number}
        else:
            print(f"[TASK] Destroy failed for {ticket_number}: {result.get('error')}")
            raise self.retry(exc=Exception(result.get("error")))
    except Exception as exc:
        print(f"[TASK] Exception for {ticket_number}: {str(exc)}")
        raise
    finally:
        db.close()

@celery_app.task
def auto_expire_environments():
    from datetime import datetime, timezone, timedelta
    from app.models.ticket import EnvironmentTemplate

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        active_tickets = db.query(TicketRequest).filter(
            TicketRequest.status == "active"
        ).all()

        expired_count = 0
        for ticket in active_tickets:
            created_at = ticket.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)

            expiry_time = created_at + timedelta(days=ticket.duration_days)

            if now >= expiry_time:
                template = db.query(EnvironmentTemplate).filter(
                    EnvironmentTemplate.id == ticket.template_id
                ).first()

                if template:
                    ticket.status = "expired"
                    db.commit()

                    destroy_environment_task.delay(
                        ticket_id=ticket.id,
                        ticket_number=ticket.ticket_number,
                        template_type=template.template_type,
                        duration_days=ticket.duration_days
                    )
                    expired_count += 1

        print(f"[EXPIRY] Check complete — {expired_count} environment(s) expired")
        return {"expired": expired_count, "checked_at": now.isoformat()}

    except Exception as e:
        print(f"[EXPIRY] Error during expiry check: {str(e)}")
        return {"error": str(e)}
    finally:
        db.close()

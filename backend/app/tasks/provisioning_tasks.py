import json
import time
import logging
import boto3
from datetime import datetime, timezone, timedelta
from app.celery_app import celery_app
from app.services.terraform_service import provision_environment, destroy_environment
from app.services.audit_service import log_action
from app.database import SessionLocal
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User

logger = logging.getLogger(__name__)

# Template types that provision via Terraform automatically
AUTO_PROVISION_TYPES = {
    "web_app", "database", "serverless",
    "s3_static_site", "s3_storage", "sns_topic",
    "dynamodb", "ecr_repository", "ecs_container",
}


def _extract_output_value(raw):
    """Unwrap Terraform output dicts of the form {'value': ..., 'type': ...}."""
    if isinstance(raw, dict):
        return raw.get("value")
    return raw


def _backfill_ecs_public_ip(ticket_number: str, cluster_name: str, aws_region: str) -> str | None:
    """
    ECS Fargate assigns a public IP at runtime — it cannot be a Terraform output.
    Poll describe_tasks via boto3 until the ENI is attached and the IP is available.
    Returns the URL string or None if it can't be determined within the timeout.
    """
    ecs = boto3.client("ecs", region_name=aws_region)
    ec2 = boto3.client("ec2", region_name=aws_region)

    for attempt in range(12):  # up to ~60 seconds
        try:
            tasks_resp = ecs.list_tasks(cluster=cluster_name, desiredStatus="RUNNING")
            task_arns = tasks_resp.get("taskArns", [])
            if not task_arns:
                logger.info("[ECS backfill] No running tasks yet for %s (attempt %d)", cluster_name, attempt + 1)
                time.sleep(5)
                continue

            desc_resp = ecs.describe_tasks(cluster=cluster_name, tasks=task_arns)
            for task in desc_resp.get("tasks", []):
                for attachment in task.get("attachments", []):
                    if attachment.get("type") == "ElasticNetworkInterface":
                        eni_id = next(
                            (d["value"] for d in attachment.get("details", []) if d["name"] == "networkInterfaceId"),
                            None,
                        )
                        if eni_id:
                            eni_resp = ec2.describe_network_interfaces(NetworkInterfaceIds=[eni_id])
                            assoc = eni_resp["NetworkInterfaces"][0].get("Association", {})
                            public_ip = assoc.get("PublicIp")
                            if public_ip:
                                logger.info("[ECS backfill] Got public IP %s for %s", public_ip, ticket_number)
                                return f"http://{public_ip}"
        except Exception as exc:
            logger.warning("[ECS backfill] Error on attempt %d for %s: %s", attempt + 1, ticket_number, exc)

        time.sleep(5)

    logger.warning("[ECS backfill] Could not determine public IP for %s after timeout", ticket_number)
    return None


def _parse_outputs(template_type: str, outputs: dict, ticket_number: str, aws_region: str):
    """
    Return (instance_id, environment_url) from Terraform outputs for all supported types.
    ECS public IP is resolved via boto3 since Terraform cannot output runtime-assigned IPs.
    """
    def v(key):
        return _extract_output_value(outputs.get(key))

    if template_type == "web_app":
        return v("web_app_instance_id"), v("web_app_url")

    if template_type == "database":
        return v("db_instance_id"), v("database_endpoint")

    if template_type == "serverless":
        return v("function_name"), v("serverless_api_endpoint")

    if template_type == "s3_static_site":
        return v("s3_static_site_bucket_id"), v("s3_static_site_url")

    if template_type == "s3_storage":
        bucket_id = v("s3_storage_bucket_id")
        return bucket_id, v("s3_storage_bucket_arn")

    if template_type == "sns_topic":
        return v("sns_topic_name"), v("sns_topic_arn")

    if template_type == "dynamodb":
        return v("dynamodb_table_name"), v("dynamodb_table_arn")

    if template_type == "ecr_repository":
        return v("ecr_repository_name"), v("ecr_repository_url")

    if template_type == "ecs_container":
        cluster_name = v("ecs_cluster_name")
        public_url = _backfill_ecs_public_ip(ticket_number, cluster_name, aws_region) if cluster_name else None
        return cluster_name, public_url

    return None, None


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def provision_environment_task(self, ticket_id: int, ticket_number: str, template_type: str, owner_email: str, duration_days: int, department: str = "General", aws_region: str = "ap-south-1"):
    db = SessionLocal()
    try:
        logger.info("Starting provisioning for %s", ticket_number)

        result = provision_environment(
            ticket_number=ticket_number,
            template_type=template_type,
            environment_name=f"env-{ticket_number.lower()}",
            owner_email=owner_email,
            duration_days=duration_days,
            department=department,
        )

        ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()

        if result["success"]:
            outputs = result.get("outputs", {})
            instance_id, environment_url = _parse_outputs(template_type, outputs, ticket_number, aws_region)

            ticket.instance_id = instance_id
            ticket.environment_url = environment_url
            ticket.status = "active"
            ticket.provisioning_output = outputs
            db.commit()

            log_action(
                db=db,
                action="ticket.provisioned",
                resource_type="ticket",
                resource_id=ticket_number,
                user_id=ticket.user_id,
                details={"url": ticket.environment_url, "resource_id": ticket.instance_id},
            )

            logger.info(
                "Provisioning success for %s — ID: %s | URL: %s",
                ticket_number, ticket.instance_id, ticket.environment_url,
            )
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
            duration_days=duration_days,
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
        # Only auto-expire tickets that were provisioned via Terraform
        active_tickets = db.query(TicketRequest).filter(
            TicketRequest.status == "active"
        ).all()

        expired_count = 0
        for ticket in active_tickets:
            created_at = ticket.created_at.replace(tzinfo=timezone.utc) if ticket.created_at.tzinfo is None else ticket.created_at
            expiry_time = created_at + timedelta(days=ticket.duration_days)

            if now >= expiry_time:
                template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
                if template and template.template_type in AUTO_PROVISION_TYPES:
                    ticket.status = "expiring"
                    db.commit()
                    destroy_environment_task.delay(ticket.id, ticket.ticket_number, template.template_type, ticket.duration_days)
                    expired_count += 1

        logger.info("Auto-expiry complete — reclaimed %d environments", expired_count)
        return {"expired": expired_count, "checked_at": now.isoformat()}
    finally:
        db.close()

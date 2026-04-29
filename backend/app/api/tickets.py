import uuid
import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User
from app.models.quota import ResourceQuota
from app.schemas.ticket import TicketCreate, TicketResponse, TemplateResponse, CostEstimate
from app.services.cost_estimator import CostEstimator
from app.services.email_service import send_approval_request_email
from app.services.audit_service import log_action
from app.utils.security import get_current_user
from app.utils.aws_console import generate_federated_console_url

router = APIRouter(prefix="/tickets", tags=["Tickets"])

class UploadRequest(BaseModel):
    filename: str

def check_quota(user_id: int, estimated_cost: float, db: Session):
    quota = db.query(ResourceQuota).filter(ResourceQuota.user_id == user_id).first()
    if not quota:
        return
    active_statuses = ["pending_approval", "approved", "provisioning", "active"]
    active_count = db.query(TicketRequest).filter(
        TicketRequest.user_id == user_id,
        TicketRequest.status.in_(active_statuses)
    ).count()
    if active_count >= quota.environments_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Environment limit reached ({active_count}/{quota.environments_limit}). Close an existing environment first."
        )
    if estimated_cost > float(quota.monthly_budget_usd):
        raise HTTPException(
            status_code=400,
            detail=f"Estimated cost ${estimated_cost:.2f}/month exceeds your budget limit of ${float(quota.monthly_budget_usd):.2f}."
        )

def attach_requester(ticket, db: Session):
    """Attach requester name, email, and template details to a ticket object."""
    requester = db.query(User).filter(User.id == ticket.user_id).first()
    ticket.requester_name = requester.full_name if requester else None
    ticket.requester_email = requester.email if requester else None

    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
    if template:
        ticket.template = template
        ticket.template_type = template.template_type

    return ticket

@router.get("/templates", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    return db.query(EnvironmentTemplate).filter(EnvironmentTemplate.is_active == True).all()

@router.post("/estimate-cost", response_model=CostEstimate)
def estimate_cost(template_id: int, duration_days: int = 14, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Get dynamic estimate
    estimate = CostEstimator().estimate_cost(template.template_type, template.resources or {}, duration_days)
    
    # Combine with template base cost
    final_monthly = estimate["estimated_monthly_cost"] + template.base_cost_usd
    final_total = float(final_monthly) * (estimate["duration_days"] / 30)
    
    return {
        "estimated_monthly_cost": final_monthly,
        "estimated_total_cost": round(final_total, 2),
        "duration_days": estimate["duration_days"],
        "breakdown": estimate["breakdown"],
        "free_tier_eligible": final_monthly == 0
    }

@router.post("/", response_model=TicketResponse, status_code=201)
def create_ticket(ticket: TicketCreate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    resources = ticket.requested_resources or template.resources or {}
    
    # Calculate costs combining Estimator logic and Template Base Cost
    raw_estimate = CostEstimator().estimate_cost(template.template_type, resources, ticket.duration_days)
    final_cost_usd = raw_estimate["estimated_monthly_cost"] + template.base_cost_usd

    check_quota(current_user["id"], float(final_cost_usd), db)

    ticket_number = f"TKT-{uuid.uuid4().hex[:8].upper()}"
    new_ticket = TicketRequest(
        ticket_number=ticket_number,
        user_id=current_user["id"],
        template_id=ticket.template_id,
        title=ticket.title,
        justification=ticket.justification,
        duration_days=ticket.duration_days,
        requested_resources=resources,
        estimated_cost_usd=final_cost_usd,
        status="pending_approval"
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    requester = db.query(User).filter(User.id == current_user["id"]).first()
    approvers = db.query(User).filter(User.role.in_(["admin", "approver"])).all()
    for approver in approvers:
        send_approval_request_email(
            approver.email,
            new_ticket.ticket_number,
            new_ticket.title,
            requester.full_name if requester else current_user["email"],
            float(new_ticket.estimated_cost_usd)
        )

    log_action(
        db=db,
        action="ticket.created",
        resource_type="ticket",
        resource_id=new_ticket.ticket_number,
        user_id=current_user["id"],
        details={
            "title": new_ticket.title,
            "template": template.name,
            "estimated_cost": float(new_ticket.estimated_cost_usd),
            "duration_days": new_ticket.duration_days
        },
        ip_address=request.client.host
    )
    return attach_requester(new_ticket, db)

@router.get("/my", response_model=list[TicketResponse])
def get_my_tickets(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    tickets = db.query(TicketRequest).filter(
        TicketRequest.user_id == current_user["id"]
    ).order_by(TicketRequest.created_at.desc()).all()
    return [attach_requester(t, db) for t in tickets]

@router.get("/quota")
def get_my_quota(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    quota = db.query(ResourceQuota).filter(ResourceQuota.user_id == user_id).first()

    active_statuses = ["pending_approval", "approved", "provisioning", "active"]
    active_count = db.query(TicketRequest).filter(
        TicketRequest.user_id == user_id,
        TicketRequest.status.in_(active_statuses)
    ).count()

    from sqlalchemy import func
    monthly_cost = db.query(func.sum(TicketRequest.estimated_cost_usd)).filter(
        TicketRequest.user_id == user_id,
        TicketRequest.status.in_(active_statuses)
    ).scalar() or 0

    return {
        "active_environments": active_count,
        "max_environments": quota.environments_limit if quota else 3,
        "monthly_cost_usd": float(monthly_cost),
        "monthly_budget_usd": float(quota.monthly_budget_usd) if quota else 100.0,
        "environments_remaining": (quota.environments_limit if quota else 3) - active_count,
        "budget_remaining": float(quota.monthly_budget_usd if quota else 100) - float(monthly_cost)
    }

@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != current_user["id"] and current_user["role"] not in ["admin", "approver"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return attach_requester(ticket, db)

class ExtendRequest(BaseModel):
    additional_days: int = Field(gt=0, le=30, description="Days to extend (1-30)")

@router.put("/{ticket_id}/extend")
def extend_environment(
    ticket_id: int,
    extend: ExtendRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != current_user["id"] and current_user["role"] not in ["admin", "approver"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if ticket.status != "active":
        raise HTTPException(status_code=400, detail="Only active environments can be extended")

    old_duration = ticket.duration_days
    ticket.duration_days += extend.additional_days
    db.commit()
    db.refresh(ticket)

    log_action(
        db=db,
        action="ticket.extended",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={
            "extended_by": current_user["email"],
            "old_duration_days": old_duration,
            "new_duration_days": ticket.duration_days,
            "additional_days": extend.additional_days
        },
        ip_address=request.client.host
    )

    return {
        "message": f"Environment extended by {extend.additional_days} days",
        "ticket_number": ticket.ticket_number,
        "new_duration_days": ticket.duration_days,
        "status": ticket.status
    }

@router.delete("/{ticket_id}/cancel")
def cancel_ticket(
    ticket_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only cancel your own tickets")
    if ticket.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Only pending tickets can be cancelled. Current status: {ticket.status}")

    ticket.status = "cancelled"
    db.commit()

    log_action(
        db=db,
        action="ticket.cancelled",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"cancelled_by": current_user["email"]},
        ip_address=request.client.host
    )

    return {
        "message": "Ticket cancelled successfully",
        "ticket_number": ticket.ticket_number,
        "status": "cancelled"
    }

@router.get("/{ticket_id}/console-link")
def get_ticket_console_link(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
    aws_access_key = current_user.get("aws_access_key")
    aws_secret_key = current_user.get("aws_secret_key")

    if not aws_access_key or not aws_secret_key:
        raise HTTPException(
            status_code=403,
            detail="AWS Console access requires an active IAM Login session."
        )

    magic_url = generate_federated_console_url(
        access_key=aws_access_key,
        secret_key=aws_secret_key,
        template_type=template.template_type if template else None,
        resource_id=ticket.instance_id
    )

    if not magic_url:
        raise HTTPException(status_code=500, detail="Error generating AWS session.")

    return {"url": magic_url}

@router.post("/{ticket_id}/upload-url")
def generate_presigned_upload_url(
    ticket_id: int,
    payload: UploadRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.user_id != current_user["id"] and current_user.get("role") not in ["admin", "approver"]:
        raise HTTPException(status_code=403, detail="Access denied")

    if ticket.status != "active":
        raise HTTPException(status_code=400, detail="Environment must be active to upload files")

    outputs = ticket.provisioning_output or {}
    bucket_name = None

    if isinstance(outputs.get("s3_static_site_bucket_id"), dict):
        bucket_name = outputs["s3_static_site_bucket_id"].get("value")
    elif isinstance(outputs.get("s3_storage_bucket_id"), dict):
        bucket_name = outputs["s3_storage_bucket_id"].get("value")
    else:
        bucket_name = outputs.get("s3_static_site_bucket_id") or outputs.get("s3_storage_bucket_id")

    if not bucket_name:
        raise HTTPException(status_code=400, detail="No S3 bucket found for this environment")

    try:
        # Strict filename and content type matching
        clean_filename = payload.filename
        if clean_filename.endswith(".html.html"):
            clean_filename = clean_filename.replace(".html.html", ".html")

        ext = clean_filename.split('.')[-1].lower()
        mime_types = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg'
        }
        content_type = mime_types.get(ext, 'application/octet-stream')

        # Use server-side credentials (instance profile / ~/.aws) — NOT the user's
        # federated IAM session. The user's session only has console read access;
        # PutObject permission on portal buckets belongs to the backend role only.
        s3_client = boto3.client(
            's3',
            region_name="ap-south-1",
            endpoint_url="https://s3.ap-south-1.amazonaws.com",
            config=Config(
                signature_version='s3v4',
                s3={'addressing_style': 'virtual'}
            )
        )

        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': clean_filename,
                'ContentType': content_type
            },
            ExpiresIn=300
        )

        return {
            "upload_url": presigned_url,
            "bucket": bucket_name,
            "key": clean_filename,
            "content_type": content_type
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(e)}")

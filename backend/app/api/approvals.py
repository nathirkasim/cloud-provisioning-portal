import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User
from app.utils.security import get_current_user
from app.api.users import require_admin
from app.services.email_service import (
    send_ticket_approved_email,
    send_ticket_rejected_email,
    send_manual_setup_received_email,
    send_manual_setup_ready_email,
    send_custom_request_received_email,
    send_custom_request_admin_email,
)
from app.services.audit_service import log_action
from app.tasks.provisioning_tasks import provision_environment_task, destroy_environment_task
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/approvals", tags=["Approvals"])

AUTO_APPROVE_THRESHOLD = float(os.getenv("AUTO_APPROVE_THRESHOLD", "20.0"))

class ApprovalAction(BaseModel):
    reason: Optional[str] = None

def require_approver(current_user=Depends(get_current_user)):
    if current_user["role"] not in ["approver", "admin"]:
        raise HTTPException(status_code=403, detail="Approver or Admin role required")
    return current_user

def attach_template(ticket, db: Session):
    """Attach the template object so frontend can read is_manual, tier, sla_days."""
    template = db.query(EnvironmentTemplate).filter(
        EnvironmentTemplate.id == ticket.template_id
    ).first()
    ticket.template = template
    return ticket

@router.get("/pending")
def get_pending_tickets(db: Session = Depends(get_db), current_user=Depends(require_approver)):
    tickets = db.query(TicketRequest).filter(
        TicketRequest.status.in_(["pending_approval", "pending_manual_setup", "in_progress"])
    ).order_by(TicketRequest.created_at.asc()).all()
    for ticket in tickets:
        requester = db.query(User).filter(User.id == ticket.user_id).first()
        ticket.requester_name = requester.full_name if requester else None
        ticket.requester_email = requester.email if requester else None
        attach_template(ticket, db)
    return tickets

@router.put("/{ticket_id}/approve")
def approve_ticket(
    ticket_id: int,
    request: Request,
    action: ApprovalAction = ApprovalAction(),
    db: Session = Depends(get_db),
    current_user=Depends(require_approver)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Ticket is already {ticket.status}")

    template = db.query(EnvironmentTemplate).filter(
        EnvironmentTemplate.id == ticket.template_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    requester = db.query(User).filter(User.id == ticket.user_id).first()

    # ── Manual templates (Tier 2, Tier 3, custom_request) ────────────────────
    if template.is_manual or template.template_type == "custom_request":
        ticket.status = "pending_manual_setup"
        db.commit()
        db.refresh(ticket)

        if requester:
            send_manual_setup_received_email(
                user_email=requester.email,
                ticket_number=ticket.ticket_number,
                title=ticket.title,
                sla_days=template.resources.get("sla_days", 2) if template.resources else 2,
            )

        log_action(
            db=db,
            action="ticket.approved_manual",
            resource_type="ticket",
            resource_id=ticket.ticket_number,
            user_id=current_user["id"],
            details={"approved_by": current_user["email"], "requester": requester.email if requester else None},
            ip_address=request.client.host,
        )

        return {
            "message": "Ticket approved — awaiting manual setup by admin",
            "ticket_number": ticket.ticket_number,
            "status": "pending_manual_setup",
        }

    # ── Auto-provisioned templates (Tier 1) ───────────────────────────────────
    ticket.status = "provisioning"
    db.commit()
    db.refresh(ticket)

    if requester:
        send_ticket_approved_email(requester.email, ticket.ticket_number, ticket.title)

    log_action(
        db=db,
        action="ticket.approved",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"approved_by": current_user["email"], "requester": requester.email if requester else None},
        ip_address=request.client.host,
    )

    provision_environment_task.delay(
        ticket_id=ticket.id,
        ticket_number=ticket.ticket_number,
        template_type=template.template_type,
        owner_email=requester.email if requester else "unknown@portal.com",
        duration_days=ticket.duration_days,
        department=requester.department if requester and requester.department else "General",
    )

    return {
        "message": "Ticket approved — provisioning queued",
        "ticket_number": ticket.ticket_number,
        "status": "provisioning",
    }


class ManualSetupComplete(BaseModel):
    resource_details: str  # connection string, ARN, endpoint — free text from admin
    environment_url: Optional[str] = None
    instance_id: Optional[str] = None


@router.put("/{ticket_id}/manual-complete")
def complete_manual_setup(
    ticket_id: int,
    payload: ManualSetupComplete,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_approver),
):
    """Admin marks a manual ticket as active and fills in resource details."""
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status not in ("pending_manual_setup", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Ticket must be in pending_manual_setup or in_progress to complete. Current: {ticket.status}",
        )

    ticket.status = "active"
    ticket.environment_url = payload.environment_url
    ticket.instance_id = payload.instance_id
    ticket.provisioning_output = {"resource_details": payload.resource_details}
    db.commit()
    db.refresh(ticket)

    requester = db.query(User).filter(User.id == ticket.user_id).first()
    if requester:
        send_manual_setup_ready_email(
            user_email=requester.email,
            ticket_number=ticket.ticket_number,
            title=ticket.title,
            resource_details=payload.resource_details,
            environment_url=payload.environment_url,
        )

    log_action(
        db=db,
        action="ticket.manual_completed",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"completed_by": current_user["email"], "resource_details": payload.resource_details},
        ip_address=request.client.host,
    )

    return {
        "message": "Manual setup complete — ticket is now active and user has been notified",
        "ticket_number": ticket.ticket_number,
        "status": "active",
    }


@router.put("/{ticket_id}/mark-in-progress")
def mark_in_progress(
    ticket_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_approver),
):
    """Admin marks a manual ticket as in_progress while working on it."""
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "pending_manual_setup":
        raise HTTPException(status_code=400, detail=f"Ticket must be pending_manual_setup. Current: {ticket.status}")

    ticket.status = "in_progress"
    db.commit()

    log_action(
        db=db,
        action="ticket.in_progress",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"marked_by": current_user["email"]},
        ip_address=request.client.host,
    )

    return {"message": "Ticket marked in progress", "ticket_number": ticket.ticket_number, "status": "in_progress"}

@router.put("/{ticket_id}/reject")
def reject_ticket(
    ticket_id: int,
    action: ApprovalAction,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_approver)
):
    if not action.reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Ticket is already {ticket.status}")
    ticket.status = "rejected"
    db.commit()
    db.refresh(ticket)
    requester = db.query(User).filter(User.id == ticket.user_id).first()
    if requester:
        send_ticket_rejected_email(requester.email, ticket.ticket_number, ticket.title, action.reason)
    log_action(
        db=db,
        action="ticket.rejected",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"rejected_by": current_user["email"], "reason": action.reason},
        ip_address=request.client.host
    )
    return {"message": "Ticket rejected", "ticket_number": ticket.ticket_number, "status": "rejected"}

@router.post("/{ticket_id}/auto-check")
def auto_approve_check(
    ticket_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "pending_approval":
        raise HTTPException(status_code=400, detail=f"Ticket is already {ticket.status}")

    template = db.query(EnvironmentTemplate).filter(
        EnvironmentTemplate.id == ticket.template_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if float(ticket.estimated_cost_usd) <= AUTO_APPROVE_THRESHOLD:
        ticket.status = "provisioning"
        db.commit()
        db.refresh(ticket)

        requester = db.query(User).filter(User.id == ticket.user_id).first()
        if requester:
            send_ticket_approved_email(requester.email, ticket.ticket_number, ticket.title)

        log_action(
            db=db,
            action="ticket.auto_approved",
            resource_type="ticket",
            resource_id=ticket.ticket_number,
            user_id=current_user["id"],
            details={
                "estimated_cost": float(ticket.estimated_cost_usd),
                "threshold": AUTO_APPROVE_THRESHOLD
            }
        )

        provision_environment_task.delay(
            ticket_id=ticket.id,
            ticket_number=ticket.ticket_number,
            template_type=template.template_type,
            owner_email=requester.email if requester else "unknown@portal.com",
            duration_days=ticket.duration_days,
            department=requester.department if requester and requester.department else "General"
        )

        return {
            "message": f"Auto-approved (cost ${float(ticket.estimated_cost_usd):.2f} under ${AUTO_APPROVE_THRESHOLD:.2f} threshold) — provisioning queued",
            "ticket_number": ticket.ticket_number,
            "status": "provisioning"
        }

    return {
        "message": f"Manual approval required (cost ${float(ticket.estimated_cost_usd):.2f} exceeds ${AUTO_APPROVE_THRESHOLD:.2f} threshold)",
        "ticket_number": ticket.ticket_number,
        "status": "pending_approval"
    }

@router.delete("/{ticket_id}/destroy")
def destroy_ticket_environment(
    ticket_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_approver)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status != "active":
        raise HTTPException(status_code=400, detail="Only active environments can be destroyed")

    template = db.query(EnvironmentTemplate).filter(
        EnvironmentTemplate.id == ticket.template_id
    ).first()

    ticket.status = "expiring"
    db.commit()

    log_action(
        db=db,
        action="ticket.destroyed",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"destroyed_by": current_user["email"]},
        ip_address=request.client.host
    )

    destroy_environment_task.delay(
        ticket_id=ticket.id,
        ticket_number=ticket.ticket_number,
        template_type=template.template_type,
        duration_days=ticket.duration_days
    )

    return {
        "message": "Environment destruction queued",
        "ticket_number": ticket.ticket_number,
        "status": "expiring"
    }

@router.get("/all")
def get_all_tickets(
    status: str = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin)
):
    query = db.query(TicketRequest)
    if status:
        query = query.filter(TicketRequest.status == status)
    tickets = query.order_by(TicketRequest.created_at.desc()).all()
    for ticket in tickets:
        requester = db.query(User).filter(User.id == ticket.user_id).first()
        ticket.requester_name = requester.full_name if requester else None
        ticket.requester_email = requester.email if requester else None
        attach_template(ticket, db)
    return tickets

@router.get("/stats")
def get_portal_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin)
):
    from sqlalchemy import func

    total_tickets = db.query(TicketRequest).count()
    active = db.query(TicketRequest).filter(TicketRequest.status == "active").count()
    pending = db.query(TicketRequest).filter(TicketRequest.status == "pending_approval").count()
    provisioning = db.query(TicketRequest).filter(TicketRequest.status == "provisioning").count()
    expired = db.query(TicketRequest).filter(TicketRequest.status == "expired").count()
    rejected = db.query(TicketRequest).filter(TicketRequest.status == "rejected").count()

    total_cost = db.query(func.sum(TicketRequest.estimated_cost_usd)).scalar() or 0
    active_cost = db.query(func.sum(TicketRequest.estimated_cost_usd)).filter(
        TicketRequest.status == "active"
    ).scalar() or 0

    user_stats = db.query(
        User.email,
        User.full_name,
        User.department,
        func.count(TicketRequest.id).label("total_tickets"),
        func.sum(TicketRequest.estimated_cost_usd).label("total_cost")
    ).join(TicketRequest, User.id == TicketRequest.user_id, isouter=True)\
     .group_by(User.id, User.email, User.full_name, User.department)\
     .all()

    return {
        "overview": {
            "total_tickets": total_tickets,
            "active": active,
            "pending": pending,
            "provisioning": provisioning,
            "expired": expired,
            "rejected": rejected,
            "total_cost_usd": float(total_cost),
            "active_cost_usd": float(active_cost),
        },
        "per_user": [
            {
                "email": u.email,
                "full_name": u.full_name,
                "department": u.department,
                "total_tickets": u.total_tickets or 0,
                "total_cost_usd": float(u.total_cost or 0)
            }
            for u in user_stats
        ]
    }

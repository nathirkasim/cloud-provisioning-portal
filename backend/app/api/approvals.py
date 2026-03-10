from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.user import User
from app.utils.security import get_current_user
from app.api.users import require_admin
from app.services.email_service import send_ticket_approved_email, send_ticket_rejected_email
from app.services.audit_service import log_action
from app.tasks.provisioning_tasks import provision_environment_task, destroy_environment_task
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/approvals", tags=["Approvals"])

class ApprovalAction(BaseModel):
    reason: Optional[str] = None

def require_approver(current_user=Depends(get_current_user)):
    if current_user["role"] not in ["approver", "admin"]:
        raise HTTPException(status_code=403, detail="Approver or Admin role required")
    return current_user

@router.get("/pending")
def get_pending_tickets(db: Session = Depends(get_db), current_user=Depends(require_approver)):
    return db.query(TicketRequest).filter(
        TicketRequest.status == "pending_approval"
    ).order_by(TicketRequest.created_at.asc()).all()

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

    ticket.status = "provisioning"
    db.commit()
    db.refresh(ticket)

    requester = db.query(User).filter(User.id == ticket.user_id).first()
    if requester:
        send_ticket_approved_email(requester.email, ticket.ticket_number, ticket.title)

    log_action(
        db=db,
        action="ticket.approved",
        resource_type="ticket",
        resource_id=ticket.ticket_number,
        user_id=current_user["id"],
        details={"approved_by": current_user["email"], "requester": requester.email if requester else None},
        ip_address=request.client.host
    )

    # Dispatch Celery task instead of raw thread
    provision_environment_task.delay(
        ticket_id=ticket.id,
        ticket_number=ticket.ticket_number,
        template_type=template.template_type,
        owner_email=requester.email if requester else "unknown@portal.com",
        duration_days=ticket.duration_days
    )

    return {
        "message": "Ticket approved — provisioning queued",
        "ticket_number": ticket.ticket_number,
        "status": "provisioning"
    }

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
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if float(ticket.estimated_cost_usd) < 50:
        ticket.status = "approved"
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
            details={"estimated_cost": float(ticket.estimated_cost_usd)}
        )
        return {"message": "Auto-approved (cost under $50)", "status": "approved"}
    return {"message": "Manual approval required (cost over $50)", "status": "pending_approval"}

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

    ticket.status = "expired"
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

    # Dispatch Celery task instead of raw thread
    destroy_environment_task.delay(
        ticket_id=ticket.id,
        ticket_number=ticket.ticket_number,
        template_type=template.template_type,
        duration_days=ticket.duration_days
    )

    return {
        "message": "Environment destruction queued",
        "ticket_number": ticket.ticket_number,
        "status": "expired"
    }

@router.get("/all")
def get_all_tickets(
    status: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(TicketRequest)
    if status:
        query = query.filter(TicketRequest.status == status)
    return query.order_by(TicketRequest.created_at.desc()).all()

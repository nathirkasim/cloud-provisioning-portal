from fastapi import APIRouter, Depends, HTTPException, Request
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

router = APIRouter(prefix="/tickets", tags=["Tickets"])

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

@router.get("/templates", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    return db.query(EnvironmentTemplate).filter(EnvironmentTemplate.is_active == True).all()

@router.post("/estimate-cost", response_model=CostEstimate)
def estimate_cost(template_id: int, duration_days: int = 14, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return CostEstimator().estimate_cost(template.template_type, template.resources or {}, duration_days)

@router.post("/", response_model=TicketResponse, status_code=201)
def create_ticket(ticket: TicketCreate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    template = db.query(EnvironmentTemplate).filter(EnvironmentTemplate.id == ticket.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    resources = ticket.requested_resources or template.resources or {}
    cost_estimate = CostEstimator().estimate_cost(template.template_type, resources, ticket.duration_days)

    check_quota(current_user["id"], float(cost_estimate["estimated_monthly_cost"]), db)

    count = db.query(TicketRequest).count()
    ticket_number = f"TKT-2026-{count + 1:03d}"
    new_ticket = TicketRequest(
        ticket_number=ticket_number,
        user_id=current_user["id"],
        template_id=ticket.template_id,
        title=ticket.title,
        justification=ticket.justification,
        duration_days=ticket.duration_days,
        requested_resources=resources,
        estimated_cost_usd=cost_estimate["estimated_monthly_cost"],
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
    return new_ticket

@router.get("/my", response_model=list[TicketResponse])
def get_my_tickets(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(TicketRequest).filter(TicketRequest.user_id == current_user["id"]).order_by(TicketRequest.created_at.desc()).all()

@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket

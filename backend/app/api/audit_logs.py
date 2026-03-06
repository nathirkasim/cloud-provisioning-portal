from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogResponse
from app.utils.security import get_current_user

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

def require_admin(current_user=Depends(get_current_user)):
    from fastapi import HTTPException
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user

@router.get("/", response_model=list[AuditLogResponse])
def get_audit_logs(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    action: str = Query(None),
    resource_type: str = Query(None),
    user_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin)
):
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

@router.get("/my", response_model=list[AuditLogResponse])
def get_my_audit_logs(
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return db.query(AuditLog).filter(
        AuditLog.user_id == current_user["id"]
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()

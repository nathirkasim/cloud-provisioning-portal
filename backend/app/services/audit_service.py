from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

def log_action(
    db: Session,
    action: str,
    resource_type: str,
    resource_id: str = None,
    user_id: int = None,
    details: dict = None,
    ip_address: str = None
):
    """
    Log an action to the audit_logs table.
    
    Actions examples:
        ticket.created, ticket.approved, ticket.rejected,
        ticket.provisioned, ticket.destroyed, user.created,
        user.role_changed, user.deactivated, auth.login, auth.register
    """
    try:
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            details=details,
            ip_address=ip_address
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"[AUDIT] Failed to log action {action}: {str(e)}")

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, RoleUpdate
from app.utils.security import get_current_user
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["Users"])

VALID_ROLES = ["developer", "approver", "admin"]

def require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user

@router.get("/", response_model=list[UserResponse])
def get_all_users(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()

@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, updates: UserUpdate, request: Request, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = {}
    if updates.full_name is not None:
        changes["full_name"] = {"from": user.full_name, "to": updates.full_name}
        user.full_name = updates.full_name
    if updates.department is not None:
        changes["department"] = {"from": user.department, "to": updates.department}
        user.department = updates.department
    if updates.is_active is not None:
        changes["is_active"] = {"from": user.is_active, "to": updates.is_active}
        user.is_active = updates.is_active
    db.commit()
    db.refresh(user)
    log_action(
        db=db,
        action="user.updated",
        resource_type="user",
        resource_id=str(user_id),
        user_id=current_user["id"],
        details={"updated_by": current_user["email"], "changes": changes},
        ip_address=request.client.host
    )
    return user

@router.put("/{user_id}/role", response_model=UserResponse)
def update_role(user_id: int, role_update: RoleUpdate, request: Request, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    if role_update.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    old_role = user.role
    user.role = role_update.role
    db.commit()
    db.refresh(user)
    log_action(
        db=db,
        action="user.role_changed",
        resource_type="user",
        resource_id=str(user_id),
        user_id=current_user["id"],
        details={"changed_by": current_user["email"], "email": user.email, "from": old_role, "to": role_update.role},
        ip_address=request.client.host
    )
    return user

@router.delete("/{user_id}")
def deactivate_user(user_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user.is_active = False
    db.commit()
    log_action(
        db=db,
        action="user.deactivated",
        resource_type="user",
        resource_id=str(user_id),
        user_id=current_user["id"],
        details={"deactivated_by": current_user["email"], "email": user.email},
        ip_address=request.client.host
    )
    return {"message": f"User {user.email} has been deactivated", "user_id": user_id}

import boto3
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, IAMLogin
from pydantic import BaseModel
from app.utils.security import get_password_hash, verify_password, create_access_token, get_current_user, blocklist_token, redis_client
from app.services.audit_service import log_action
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def register(user: UserCreate, request: Request, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email,
        password_hash=hashed_password,
        full_name=user.full_name,
        department=user.department
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    from app.models.quota import ResourceQuota
    quota = ResourceQuota(user_id=new_user.id)
    db.add(quota)
    db.commit()
    log_action(
        db=db,
        action="auth.register",
        resource_type="user",
        resource_id=str(new_user.id),
        user_id=new_user.id,
        details={"email": new_user.email, "full_name": new_user.full_name},
        ip_address=request.client.host
    )
    return new_user

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    token_data = {"sub": str(user.id), "email": user.email, "role": user.role}
    access_token = create_access_token(token_data)
    log_action(
        db=db,
        action="auth.login",
        resource_type="user",
        resource_id=str(user.id),
        user_id=user.id,
        details={"email": user.email, "role": user.role},
        ip_address=request.client.host
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/iam-login", response_model=Token)
@limiter.limit("5/minute")
def iam_login(credentials: IAMLogin, request: Request, db: Session = Depends(get_db)):
    """
    Authenticates an AWS IAM user via STS and creates a federated portal session.
    Keys are embedded in the JWT — never stored in the database.
    """
    try:
        # 1. Verification handshake with AWS
        sts = boto3.client(
            'sts',
            aws_access_key_id=credentials.access_key,
            aws_secret_access_key=credentials.secret_key,
            region_name="ap-south-1"
        )
        identity = sts.get_caller_identity()
        arn = identity.get("Arn")
        account_id = identity.get("Account")

        # 2. Identity mapping: ARN/Account ID -> local shadow user
        shadow_email = f"aws-{account_id}-{arn.split('/')[-1]}@iam.aws"
        user = db.query(User).filter(User.email == shadow_email).first()

        if not user:
            user = User(
                email=shadow_email,
                full_name=f"AWS User ({arn.split('/')[-1]})",
                password_hash="EXTERNAL_IAM_FEDERATION",
                department="Cloud Infrastructure",
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            from app.models.quota import ResourceQuota
            quota = ResourceQuota(user_id=user.id)
            db.add(quota)
            db.commit()

        # 3. Embed keys in JWT — keys never written to DB
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "aws_access_key": credentials.access_key,
            "aws_secret_key": credentials.secret_key
        }
        access_token = create_access_token(token_data)

        log_action(
            db=db,
            action="auth.iam_login",
            resource_type="user",
            resource_id=str(user.id),
            user_id=user.id,
            details={"arn": arn, "account": account_id},
            ip_address=request.client.host
        )

        return {"access_token": access_token, "token_type": "bearer"}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="AWS authentication failed: invalid keys or missing STS permissions."
        )

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/logout")
def logout(current_user=Depends(get_current_user)):
    blocklist_token(current_user["token"])
    return {"message": "Logged out successfully"}

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    from app.services.email_service import send_password_reset_email
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"message": "If that email exists, a reset link has been sent"}
    reset_token = secrets.token_urlsafe(32)
    redis_client.setex(f"reset:{reset_token}", 900, str(user.id))
    send_password_reset_email(user.email, reset_token)
    return {"message": "If that email exists, a reset link has been sent"}

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = redis_client.get(f"reset:{payload.token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    redis_client.delete(f"reset:{payload.token}")
    return {"message": "Password reset successfully"}

class UpdateMeRequest(BaseModel):
    full_name: str | None = None
    department: str | None = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.put("/me")
def update_me(payload: UpdateMeRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.department is not None:
        user.department = payload.department.strip() or None
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "full_name": user.full_name,
            "role": user.role, "department": user.department, "is_active": user.is_active}

@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

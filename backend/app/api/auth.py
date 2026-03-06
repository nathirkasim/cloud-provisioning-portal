from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.utils.security import get_password_hash, verify_password, create_access_token, get_current_user
from app.services.audit_service import log_action

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
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

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

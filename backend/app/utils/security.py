from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import os
import redis

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def blocklist_token(token: str):
    """Add a token to the blocklist with TTL matching its remaining lifetime."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp = payload.get("exp")
        if exp:
            remaining = int(exp - datetime.now(timezone.utc).timestamp())
            if remaining > 0:
                redis_client.setex(f"blocklist:{token}", remaining, "1")
    except JWTError:
        pass

def is_token_blocklisted(token: str) -> bool:
    return redis_client.exists(f"blocklist:{token}") > 0

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        if is_token_blocklisted(token):
            raise HTTPException(status_code=401, detail="Token has been revoked")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Resolve AWS credentials from Redis if a session reference is present.
        # Keys are never stored in the JWT payload.
        aws_access_key = None
        aws_secret_key = None
        aws_session_id = payload.get("aws_session_id")
        if aws_session_id:
            import json as _json
            raw = redis_client.get(f"aws_session:{aws_session_id}")
            if raw:
                creds = _json.loads(raw)
                aws_access_key = creds.get("access_key")
                aws_secret_key = creds.get("secret_key")

        return {
            "id": int(user_id),
            "email": payload.get("email"),
            "role": payload.get("role"),
            "aws_access_key": aws_access_key,
            "aws_secret_key": aws_secret_key,
            "token": token
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

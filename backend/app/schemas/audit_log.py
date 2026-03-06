from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    resource_type: str
    resource_id: Optional[str]
    details: Optional[Dict]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

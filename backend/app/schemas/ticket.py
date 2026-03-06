from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict
from decimal import Decimal

class TicketCreate(BaseModel):
    template_id: int
    title: str
    justification: str
    duration_days: int = 14
    requested_resources: Optional[Dict] = None

class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    user_id: int
    template_id: int
    title: str
    justification: str
    duration_days: int
    estimated_cost_usd: Decimal
    status: str
    provisioning_output: Optional[Dict] = None
    environment_url: Optional[str] = None
    instance_id: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    template_type: str
    base_cost_usd: Decimal
    resources: Optional[Dict]
    class Config:
        from_attributes = True

class CostEstimate(BaseModel):
    estimated_monthly_cost: Decimal
    estimated_total_cost: Decimal
    duration_days: int
    breakdown: Dict
    free_tier_eligible: bool

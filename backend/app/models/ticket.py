from sqlalchemy import Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base

class TicketRequest(Base):
    __tablename__ = "ticket_requests"
    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(50), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    template_id = Column(Integer, ForeignKey("environment_templates.id"))
    title = Column(String(255), nullable=False)
    justification = Column(Text, nullable=False)
    requested_resources = Column(JSONB)
    duration_days = Column(Integer, default=14)
    estimated_cost_usd = Column(Numeric(10, 2), default=0)
    status = Column(String(50), default="pending_approval")
    provisioning_output = Column(JSONB, nullable=True)
    environment_url = Column(String(500), nullable=True)
    instance_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class EnvironmentTemplate(Base):
    __tablename__ = "environment_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    template_type = Column(String(100), nullable=False)
    base_cost_usd = Column(Numeric(10, 2), default=0)
    resources = Column(JSONB)
    is_active = Column(Boolean, default=True)

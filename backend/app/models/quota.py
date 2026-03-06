from sqlalchemy import Column, Integer, ForeignKey, Numeric
from app.database import Base

class ResourceQuota(Base):
    __tablename__ = "resource_quotas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    cpu_limit = Column(Integer, default=4)
    memory_limit_gb = Column(Integer, default=16)
    storage_limit_gb = Column(Integer, default=100)
    monthly_budget_usd = Column(Numeric(10, 2), default=100.00)
    environments_limit = Column(Integer, default=3)

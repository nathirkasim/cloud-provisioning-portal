# backend/app/setup_db.py
from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.ticket import TicketRequest, EnvironmentTemplate 
# NEW: Import ResourceQuota to ensure table creation
from app.models.quota import ResourceQuota 
from app.models.audit_log import AuditLog
from app.utils.security import get_password_hash 

def init_db():
    print("🚀 Starting database initialization...")
    
    # This creates ALL tables for models imported above
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Seed Templates
        if not db.query(EnvironmentTemplate).first():
            templates = [
                EnvironmentTemplate(
                    name='Web Application', template_type='web_app',
                    resources={'instance_type': 't2.micro', 'storage_gb': 20}),
                EnvironmentTemplate(
                    name='Database Server', template_type='database',
                    resources={'instance_type': 'db.t2.micro', 'storage_gb': 20})
            ]
            db.add_all(templates)
            print("✅ Templates seeded.")

        # 2. Create Admin User
        admin_email = "admin@cloudportal.com"
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            admin = User(
                email=admin_email,
                password_hash=get_password_hash('admin123'),
                full_name='Nathirul Mubeen M',
                role='admin', 
                is_active=True
            )
            db.add(admin)
            db.flush() # Get admin.id
            print(f"✅ Admin user created: {admin_email}")
        
        # 3. Seed Default Quota for Admin (Prevents 500 errors on dashboard)
        if admin and not db.query(ResourceQuota).filter(ResourceQuota.user_id == admin.id).first():
            quota = ResourceQuota(
                user_id=admin.id,
                cpu_limit=10,
                memory_limit_gb=20,
                storage_limit_gb=100,
                monthly_budget_usd=50.0,
                environments_limit=5
            )
            db.add(quota)
            print("✅ Default resource quota assigned to Admin.")

        db.commit()
        print("🎉 Database setup complete!")
    except Exception as e:
        print(f"❌ Error during setup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()

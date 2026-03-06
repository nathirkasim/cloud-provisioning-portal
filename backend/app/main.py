from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, tickets, users, audit_logs
from app.api import approvals
from app.database import engine
from sqlalchemy import text

app = FastAPI(title="Cloud Provisioning Portal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(approvals.router)
app.include_router(users.router)
app.include_router(audit_logs.router)

@app.get("/")
def read_root():
    return {"message": "Cloud Portal API 🚀", "version": "1.0"}

@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}

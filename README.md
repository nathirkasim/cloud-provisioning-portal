# Cloud Provisioning Portal

A full-stack cloud environment provisioning system built with FastAPI, React, PostgreSQL, Celery, Redis, and Terraform.

Developers can request cloud environments (EC2, RDS, Lambda) which go through an approval workflow before being automatically provisioned on AWS.

## Tech Stack

**Backend:** FastAPI, PostgreSQL, SQLAlchemy, JWT Auth, Celery, Redis, Terraform  
**Frontend:** React, Vite, Tailwind CSS, Axios  
**Cloud:** AWS (ap-south-1) — EC2 t3.micro, RDS PostgreSQL, Lambda + API Gateway

## Features

- JWT authentication with role-based access (developer / approver / admin)
- Environment request tickets with cost estimation
- Approval workflow with email notifications
- Automated AWS provisioning via Terraform + Celery
- Auto-expiry — environments automatically destroyed when duration expires
- Audit logging for all actions
- Admin panel — approvals, user management, active environments

## Project Structure
```
cloud-provisioning-portal/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI route handlers
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   ├── tasks/        # Celery async tasks
│   │   └── utils/        # Security helpers
│   └── terraform/        # Infrastructure modules
└── frontend/
    └── src/
        ├── pages/        # React pages
        ├── components/   # Shared components
        ├── services/     # API calls
        └── context/      # Auth context
```

## Local Setup

### Prerequisites
- Python 3.12
- Node 20
- PostgreSQL
- Redis
- Terraform
- AWS credentials configured

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Celery Worker + Beat
```bash
# Worker
celery -A app.celery_app worker --loglevel=info

# Beat (auto-expiry scheduler)
celery -A app.celery_app beat --loglevel=info
```

### Database Setup
```bash
sudo -u postgres psql
CREATE DATABASE cloud_portal;
```

Then run `backend/database_schema.sql` to create tables and seed data.

## Default Users

| Email | Password | Role |
|-------|----------|------|
| admin@cloudportal.com | Admin@123 | Admin |
| test@example.com | Dev@123 | Developer |

## API Documentation

FastAPI auto-docs available at `http://localhost:8000/docs`

## Environment Variables

See `.env.example` for all required variables.

## Deployment

- **Backend:** Railway or Render
- **Frontend:** Vercel
- **Database:** Neon.tech (PostgreSQL)

Update `ALLOWED_ORIGINS` in `.env` to include your deployed frontend URL before deploying.

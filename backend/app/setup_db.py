# backend/app/setup_db.py
from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.models.quota import ResourceQuota
from app.models.audit_log import AuditLog
from app.utils.security import get_password_hash


def init_db():
    print("🚀 Starting database initialization...")

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ── 1. Seed Templates ─────────────────────────────────────────────────
        if not db.query(EnvironmentTemplate).first():
            templates = [
                # ── Tier 1 Auto — original three ─────────────────────────────
                EnvironmentTemplate(
                    name="Web Application",
                    description="EC2 t3.micro Ubuntu instance with Apache, Security Group, and 20GB EBS. Free tier eligible for 12 months.",
                    template_type="web_app", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={"instance_type": "t3.micro", "storage_gb": 20},
                ),
                EnvironmentTemplate(
                    name="Database Server",
                    description="RDS PostgreSQL db.t3.micro with 20GB storage and auto-generated password. Free tier eligible for 12 months.",
                    template_type="database", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={"instance_class": "db.t3.micro", "storage_gb": 20},
                ),
                EnvironmentTemplate(
                    name="Lambda Serverless",
                    description="Python 3.11 Lambda function exposed via API Gateway v2 HTTP endpoint. Free tier eligible forever.",
                    template_type="serverless", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                # ── Tier 1 Auto — new ─────────────────────────────────────────
                EnvironmentTemplate(
                    name="S3 Static Site",
                    description="S3 bucket with static website hosting enabled. Public read access, placeholder index.html uploaded automatically. Free tier eligible forever.",
                    template_type="s3_static_site", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                EnvironmentTemplate(
                    name="S3 Storage Bucket",
                    description="Private S3 bucket with versioning enabled and all public access blocked. Ideal for file storage, data lake, and backups. Free tier eligible forever.",
                    template_type="s3_storage", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                EnvironmentTemplate(
                    name="SNS Topic",
                    description="SNS Standard Topic for event notifications and pub/sub messaging. Free tier: 1M requests/month forever.",
                    template_type="sns_topic", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                EnvironmentTemplate(
                    name="DynamoDB Table",
                    description="DynamoDB On-Demand table with a string hash key. Ideal for NoSQL data storage and serverless backends. Free tier: 25GB storage forever.",
                    template_type="dynamodb", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                EnvironmentTemplate(
                    name="ECR Repository",
                    description="Private Elastic Container Registry repository with scan-on-push enabled. Free tier: 500MB/month.",
                    template_type="ecr_repository", is_manual=False, tier=1,
                    base_cost_usd=0.00,
                    resources={},
                ),
                EnvironmentTemplate(
                    name="ECS Fargate Container",
                    description="ECS Fargate containerised service running in the default VPC. ⚠️ Not free tier — estimated ~$9/month. Ideal for microservices and containerised apps.",
                    template_type="ecs_container", is_manual=False, tier=1,
                    base_cost_usd=9.00,
                    resources={"cpu": 256, "memory": 512, "container_image": "nginx:latest", "container_port": 80},
                ),
                # ── Tier 2 Manual ─────────────────────────────────────────────
                EnvironmentTemplate(
                    name="ElastiCache Redis",
                    description="Managed Redis cluster via ElastiCache. Requires admin VPC subnet group and security group coordination. SLA: 1–2 business days.",
                    template_type="elasticache_redis", is_manual=True, tier=2,
                    base_cost_usd=15.00,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                EnvironmentTemplate(
                    name="CloudFront CDN",
                    description="CloudFront distribution with SSL certificate and custom origin configuration. Admin configures domain and origin. Free tier: 1TB/month. SLA: 1–2 business days.",
                    template_type="cloudfront_cdn", is_manual=True, tier=2,
                    base_cost_usd=0.00,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                EnvironmentTemplate(
                    name="RDS Read Replica",
                    description="Read replica of an existing RDS instance. Admin identifies the primary DB to replicate. SLA: 1–2 business days.",
                    template_type="rds_read_replica", is_manual=True, tier=2,
                    base_cost_usd=15.00,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                EnvironmentTemplate(
                    name="Secrets Manager",
                    description="AWS Secrets Manager secret with rotation policy. Admin configures naming conventions. Cost: ~$0.40/secret/month. SLA: 1–2 business days.",
                    template_type="secrets_manager", is_manual=True, tier=2,
                    base_cost_usd=0.40,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                EnvironmentTemplate(
                    name="WAF Rules",
                    description="WAF v2 WebACL with custom rule sets, IP allow/block lists, and rate limiting. Admin configures rule sets. SLA: 1–2 business days.",
                    template_type="waf_rules", is_manual=True, tier=2,
                    base_cost_usd=5.00,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                EnvironmentTemplate(
                    name="Kinesis Stream",
                    description="Kinesis Data Stream with admin-configured shard count and retention period. SLA: 1–2 business days.",
                    template_type="kinesis_stream", is_manual=True, tier=2,
                    base_cost_usd=15.00,
                    resources={"tier": "manual", "sla_days": 2},
                ),
                # ── Tier 3 Manual ─────────────────────────────────────────────
                EnvironmentTemplate(
                    name="EKS Cluster",
                    description="Kubernetes cluster on EKS with worker nodes. Architecture review required. Cost: $0.10/hr control plane + node costs. SLA: 3–5 business days.",
                    template_type="eks_cluster", is_manual=True, tier=3,
                    base_cost_usd=72.00,
                    resources={"tier": "manual", "sla_days": 5},
                ),
                EnvironmentTemplate(
                    name="CodePipeline / CI-CD",
                    description="AWS CodePipeline with CodeBuild for build, test, and deploy. IAM role scoping required. SLA: 3–5 business days.",
                    template_type="codepipeline", is_manual=True, tier=3,
                    base_cost_usd=1.00,
                    resources={"tier": "manual", "sla_days": 5},
                ),
                EnvironmentTemplate(
                    name="OpenSearch",
                    description="OpenSearch Service cluster with admin-configured sizing, index planning, and VPC setup. SLA: 3–5 business days.",
                    template_type="opensearch", is_manual=True, tier=3,
                    base_cost_usd=50.00,
                    resources={"tier": "manual", "sla_days": 5},
                ),
                EnvironmentTemplate(
                    name="Redshift",
                    description="Redshift Serverless data warehouse. Requires cluster type and storage planning. SLA: 3–5 business days.",
                    template_type="redshift", is_manual=True, tier=3,
                    base_cost_usd=90.00,
                    resources={"tier": "manual", "sla_days": 5},
                ),
                # ── Others / Custom ───────────────────────────────────────────
                EnvironmentTemplate(
                    name="Others",
                    description="Request any AWS resource not covered by existing templates. An admin will review your request and provision manually.",
                    template_type="custom_request", is_manual=True, tier=2,
                    base_cost_usd=0.00,
                    resources={"tier": "custom"},
                ),
            ]
            db.add_all(templates)
            print("✅ Templates seeded.")

        # ── 2. Create Admin User ──────────────────────────────────────────────
        admin_email = "admin@cloudportal.com"
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            admin = User(
                email=admin_email,
                password_hash=get_password_hash("admin123"),
                full_name="Nathirul Mubeen M",
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.flush()
            print(f"✅ Admin user created: {admin_email}")

        # ── 3. Seed Default Quota for Admin ───────────────────────────────────
        if admin and not db.query(ResourceQuota).filter(ResourceQuota.user_id == admin.id).first():
            quota = ResourceQuota(
                user_id=admin.id,
                cpu_limit=10,
                memory_limit_gb=20,
                storage_limit_gb=100,
                monthly_budget_usd=50.0,
                environments_limit=5,
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

from celery import Celery
from celery.schedules import crontab
import os

# Redis URL from environment variable (Railway) or localhost for dev
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "cloud_portal",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.provisioning_tasks"]
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "auto-expire-environments": {
            "task": "app.tasks.provisioning_tasks.auto_expire_environments",
            "schedule": crontab(minute=0, hour="*"),
        }
    }
)

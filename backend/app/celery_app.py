from celery import Celery
from celery.schedules import crontab

# Redis is both the broker (task queue) and backend (result storage)
celery_app = Celery(
    "cloud_portal",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
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

    # Celery Beat schedule — runs auto_expire_environments every hour
    beat_schedule={
        "auto-expire-environments": {
            "task": "app.tasks.provisioning_tasks.auto_expire_environments",
            "schedule": crontab(minute=0, hour="*"),  # Every hour on the hour
        }
    }
)

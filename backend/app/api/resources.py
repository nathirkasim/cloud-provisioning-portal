"""
Resource-level API — proxies AWS SDK calls for in-app resource interaction.
All routes resolve AWS credentials from the user's Redis session (set via /auth/iam-login).
Ownership is enforced: a user can only interact with their own tickets (admins/approvers can access all).
"""

import os
import json
import boto3
import logging
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.ticket import TicketRequest, EnvironmentTemplate
from app.utils.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["Resources"])

AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")
EC2_SSH_KEY_NAME = os.getenv("EC2_SSH_KEY_NAME", "cloud-portal-shared-key")
EC2_SSH_USER = os.getenv("EC2_SSH_USER", "ubuntu")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_ticket_and_creds(ticket_id: int, current_user: dict, db: Session):
    """Fetch ticket (with ownership check) and resolve AWS credentials."""
    ticket = db.query(TicketRequest).filter(TicketRequest.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != current_user["id"] and current_user["role"] not in ["admin", "approver"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if ticket.status != "active":
        raise HTTPException(status_code=400, detail="Resource is not active")

    access_key = current_user.get("aws_access_key")
    secret_key = current_user.get("aws_secret_key")
    if not access_key or not secret_key:
        raise HTTPException(
            status_code=403,
            detail="AWS credentials required. Please log in via IAM Login first."
        )
    return ticket, access_key, secret_key


def _boto_client(service: str, access_key: str, secret_key: str, region: str = None):
    return boto3.client(
        service,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region or AWS_REGION,
        config=Config(connect_timeout=5, read_timeout=10),
    )


def _extract(val):
    """Unwrap Terraform output dicts."""
    if isinstance(val, dict) and "value" in val:
        return val["value"]
    return val


def _get_bucket_name(ticket: TicketRequest) -> str:
    out = ticket.provisioning_output or {}
    name = (
        _extract(out.get("s3_storage_bucket_id"))
        or _extract(out.get("s3_static_site_bucket_id"))
        or ticket.instance_id
    )
    if not name:
        raise HTTPException(status_code=400, detail="No S3 bucket found for this environment")
    return name


# ═══════════════════════════════════════════════════════════════════════════════
# S3 File Manager
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{ticket_id}/s3/objects")
def list_s3_objects(
    ticket_id: int,
    prefix: str = Query(default="", description="Folder prefix to list"),
    continuation_token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List objects in the S3 bucket for this ticket, with optional prefix (folder) and pagination."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    bucket = _get_bucket_name(ticket)

    s3 = _boto_client("s3", access_key, secret_key)
    try:
        kwargs = dict(Bucket=bucket, Prefix=prefix, Delimiter="/", MaxKeys=100)
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        resp = s3.list_objects_v2(**kwargs)

        # Folders (common prefixes)
        folders = [p["Prefix"] for p in resp.get("CommonPrefixes", [])]

        # Files
        files = []
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            if key == prefix:          # skip the "folder" key itself
                continue
            files.append({
                "key": key,
                "name": key[len(prefix):],   # strip prefix for display
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
                "etag": obj.get("ETag", "").strip('"'),
            })

        return {
            "bucket": bucket,
            "prefix": prefix,
            "folders": folders,
            "files": files,
            "truncated": resp.get("IsTruncated", False),
            "next_token": resp.get("NextContinuationToken"),
        }
    except Exception as e:
        logger.error("S3 list_objects failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")


class DeleteObjectRequest(BaseModel):
    key: str


@router.delete("/{ticket_id}/s3/object")
def delete_s3_object(
    ticket_id: int,
    payload: DeleteObjectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete a single S3 object by key."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    bucket = _get_bucket_name(ticket)

    s3 = _boto_client("s3", access_key, secret_key)
    try:
        s3.delete_object(Bucket=bucket, Key=payload.key)
        return {"deleted": payload.key}
    except Exception as e:
        logger.error("S3 delete_object failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")


class DownloadUrlRequest(BaseModel):
    key: str


@router.post("/{ticket_id}/s3/download-url")
def get_download_url(
    ticket_id: int,
    payload: DownloadUrlRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a pre-signed GET URL for downloading a file."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    bucket = _get_bucket_name(ticket)

    s3 = _boto_client("s3", access_key, secret_key)
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": payload.key},
            ExpiresIn=300,
        )
        return {"download_url": url, "key": payload.key, "expires_in": 300}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")


class UploadUrlRequest(BaseModel):
    filename: str
    prefix: str = ""     # folder prefix, e.g. "images/"
    content_type: str = "application/octet-stream"


@router.post("/{ticket_id}/s3/upload-url")
def get_folder_upload_url(
    ticket_id: int,
    payload: UploadUrlRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a pre-signed PUT URL for uploading into a specific folder."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    bucket = _get_bucket_name(ticket)

    key = (payload.prefix.rstrip("/") + "/" + payload.filename.lstrip("/")).lstrip("/") if payload.prefix else payload.filename

    s3 = _boto_client("s3", access_key, secret_key)
    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": key, "ContentType": payload.content_type},
            ExpiresIn=300,
        )
        return {"upload_url": url, "bucket": bucket, "key": key, "expires_in": 300}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# DynamoDB Browser
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{ticket_id}/dynamodb/scan")
def scan_dynamodb(
    ticket_id: int,
    limit: int = Query(default=25, le=100),
    last_key: Optional[str] = Query(default=None, description="JSON-encoded ExclusiveStartKey"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Scan a DynamoDB table with pagination."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    table_name = ticket.instance_id
    if not table_name:
        raise HTTPException(status_code=400, detail="No DynamoDB table found for this environment")

    ddb = _boto_client("dynamodb", access_key, secret_key)
    try:
        kwargs = dict(TableName=table_name, Limit=limit)
        if last_key:
            kwargs["ExclusiveStartKey"] = json.loads(last_key)

        resp = ddb.scan(**kwargs)

        # Flatten DynamoDB typed values for frontend display
        def flatten(item: dict) -> dict:
            return {k: list(v.values())[0] for k, v in item.items()}

        items = [flatten(item) for item in resp.get("Items", [])]
        next_key = json.dumps(resp["LastEvaluatedKey"]) if resp.get("LastEvaluatedKey") else None

        # Infer column names from union of all item keys
        columns = list({k for item in items for k in item.keys()})

        return {
            "table_name": table_name,
            "items": items,
            "columns": columns,
            "count": resp.get("Count", 0),
            "scanned_count": resp.get("ScannedCount", 0),
            "next_key": next_key,
        }
    except Exception as e:
        logger.error("DynamoDB scan failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {str(e)}")


class DynamoItemRequest(BaseModel):
    item: dict   # plain Python dict — backend will wrap into DynamoDB typed format


def _to_dynamo(val):
    """Convert plain Python values to DynamoDB AttributeValue format."""
    if isinstance(val, str):
        return {"S": val}
    if isinstance(val, bool):
        return {"BOOL": val}
    if isinstance(val, (int, float)):
        return {"N": str(val)}
    if isinstance(val, list):
        return {"L": [_to_dynamo(v) for v in val]}
    if isinstance(val, dict):
        return {"M": {k: _to_dynamo(v) for k, v in val.items()}}
    if val is None:
        return {"NULL": True}
    return {"S": str(val)}


@router.put("/{ticket_id}/dynamodb/item")
def put_dynamodb_item(
    ticket_id: int,
    payload: DynamoItemRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Put (create or overwrite) a DynamoDB item."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    table_name = ticket.instance_id
    if not table_name:
        raise HTTPException(status_code=400, detail="No DynamoDB table found for this environment")

    if "id" not in payload.item or not str(payload.item["id"]).strip():
        raise HTTPException(status_code=400, detail="Item must have a non-empty 'id' field (partition key)")

    ddb = _boto_client("dynamodb", access_key, secret_key)
    try:
        dynamo_item = {k: _to_dynamo(v) for k, v in payload.item.items()}
        ddb.put_item(TableName=table_name, Item=dynamo_item)
        return {"message": "Item saved", "id": str(payload.item["id"])}
    except Exception as e:
        logger.error("DynamoDB put_item failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {str(e)}")


class DynamoDeleteRequest(BaseModel):
    id: str   # partition key value (always "id" as String per our Terraform module)


@router.delete("/{ticket_id}/dynamodb/item")
def delete_dynamodb_item(
    ticket_id: int,
    payload: DynamoDeleteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete a DynamoDB item by its partition key."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    table_name = ticket.instance_id
    if not table_name:
        raise HTTPException(status_code=400, detail="No DynamoDB table found for this environment")

    ddb = _boto_client("dynamodb", access_key, secret_key)
    try:
        ddb.delete_item(TableName=table_name, Key={"id": {"S": payload.id}})
        return {"deleted": payload.id}
    except Exception as e:
        logger.error("DynamoDB delete_item failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"DynamoDB error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# ECR Image List
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{ticket_id}/ecr/images")
def list_ecr_images(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List images in the ECR repository with docker pull/push commands."""
    ticket, access_key, secret_key = _get_ticket_and_creds(ticket_id, current_user, db)
    repo_name = ticket.instance_id
    repo_url = ticket.environment_url
    if not repo_name:
        raise HTTPException(status_code=400, detail="No ECR repository found for this environment")

    ecr = _boto_client("ecr", access_key, secret_key)
    try:
        resp = ecr.describe_images(
            repositoryName=repo_name,
            filter={"tagStatus": "TAGGED"},
        )
        images = []
        for detail in resp.get("imageDetails", []):
            for tag in detail.get("imageTags", []):
                images.append({
                    "tag": tag,
                    "digest": detail.get("imageDigest", ""),
                    "pushed_at": detail["imagePushedAt"].isoformat() if detail.get("imagePushedAt") else None,
                    "size_mb": round(detail.get("imageSizeInBytes", 0) / 1_048_576, 1),
                    "pull_command": f"docker pull {repo_url}:{tag}",
                    "push_commands": [
                        f"docker tag <local-image> {repo_url}:{tag}",
                        f"docker push {repo_url}:{tag}",
                    ],
                })

        # Auth command for the registry
        account_id = repo_url.split(".")[0] if repo_url else ""
        auth_command = (
            f"aws ecr get-login-password --region {AWS_REGION} | "
            f"docker login --username AWS --password-stdin {account_id}.dkr.ecr.{AWS_REGION}.amazonaws.com"
        )

        return {
            "repo_name": repo_name,
            "repo_url": repo_url,
            "images": sorted(images, key=lambda x: x["pushed_at"] or "", reverse=True),
            "auth_command": auth_command,
            "total": len(images),
        }
    except Exception as e:
        logger.error("ECR describe_images failed for ticket %s: %s", ticket_id, e)
        raise HTTPException(status_code=500, detail=f"ECR error: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# RDS Connection Panel
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{ticket_id}/rds/connection")
def get_rds_connection(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Return everything needed to connect to the RDS instance.
    Password is read from provisioning_output (stored at provision time).
    No AWS SDK call needed — all data is already in ticket.provisioning_output.
    """
    ticket, _, _ = _get_ticket_and_creds(ticket_id, current_user, db)
    out = ticket.provisioning_output or {}

    def v(key):
        return _extract(out.get(key))

    endpoint_raw = ticket.environment_url or v("database_endpoint") or ""
    # endpoint may be "host:port" or just "host"
    if ":" in endpoint_raw:
        host, port_str = endpoint_raw.rsplit(":", 1)
        port = port_str
    else:
        host = endpoint_raw
        port = str(v("db_port") or "5432")

    db_name = str(v("db_name") or "appdb")
    username = str(v("db_username") or "dbadmin")
    password = str(v("db_password") or "")   # only present if stored at provision time

    connection_string = f"postgresql://{username}:{password}@{host}:{port}/{db_name}" if password else \
                        f"postgresql://{username}:<password>@{host}:{port}/{db_name}"
    psql_command = f"psql -h {host} -p {port} -U {username} -d {db_name}"

    # pgAdmin deep-link uses the server name to pre-fill connection dialog
    pgadmin_url = (
        f"https://www.pgadmin.org/download/"  # just a helpful link; pgAdmin is local
    )

    return {
        "host": host,
        "port": port,
        "db_name": db_name,
        "username": username,
        "password_available": bool(password),
        "password": password if password else None,
        "connection_string": connection_string,
        "psql_command": psql_command,
        "pgadmin_url": pgadmin_url,
        "engine": "PostgreSQL 15",
        "instance_id": ticket.instance_id,
        "note": "Database is publicly accessible on port 5432. Ensure your IP is not blocked by the security group.",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EC2 SSH Info
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{ticket_id}/ec2/ssh-info")
def get_ec2_ssh_info(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return SSH connection details for the EC2 instance."""
    ticket, _, _ = _get_ticket_and_creds(ticket_id, current_user, db)
    out = ticket.provisioning_output or {}

    public_ip = _extract(out.get("web_app_public_ip")) or ticket.environment_url or ""
    # Strip http:// if URL was stored
    if public_ip.startswith("http"):
        public_ip = public_ip.replace("http://", "").replace("https://", "").rstrip("/")

    instance_id = ticket.instance_id or ""
    key_name = EC2_SSH_KEY_NAME
    user = EC2_SSH_USER

    ssh_command = f"ssh -i ~/.ssh/{key_name}.pem {user}@{public_ip}"
    scp_example = f"scp -i ~/.ssh/{key_name}.pem ./myfile.txt {user}@{public_ip}:~/"

    return {
        "public_ip": public_ip,
        "instance_id": instance_id,
        "username": user,
        "key_name": key_name,
        "ssh_command": ssh_command,
        "scp_example": scp_example,
        "os": "Ubuntu 22.04 LTS",
        "port": 22,
        "web_url": ticket.environment_url or f"http://{public_ip}",
        "note": (
            f"This environment uses the shared key pair '{key_name}'. "
            "Contact your admin if you don't have the .pem file."
        ),
    }

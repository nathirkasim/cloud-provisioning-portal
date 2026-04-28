# Private S3 Storage Bucket — versioning enabled, public access fully blocked
resource "aws_s3_bucket" "storage" {
  bucket        = "${lower(var.ticket_number)}-storage"
  force_destroy = true

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
    Department   = var.department
  }
}

resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "storage" {
  bucket = aws_s3_bucket.storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

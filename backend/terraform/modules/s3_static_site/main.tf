# S3 Static Website Hosting — public read, website endpoint enabled
resource "aws_s3_bucket" "static_site" {
  bucket        = "${lower(var.ticket_number)}-site"
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

resource "aws_s3_bucket_website_configuration" "static_site" {
  bucket = aws_s3_bucket.static_site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "error.html"
  }
}

resource "aws_s3_bucket_public_access_block" "static_site" {
  bucket = aws_s3_bucket.static_site.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "static_site" {
  bucket = aws_s3_bucket.static_site.id

  depends_on = [aws_s3_bucket_public_access_block.static_site]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.static_site.arn}/*"
      }
    ]
  })
}

# Upload a placeholder index.html so the site is immediately accessible
resource "aws_s3_object" "index" {
  bucket       = aws_s3_bucket.static_site.id
  key          = "index.html"
  content_type = "text/html"

  content = <<-HTML
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>${var.environment_name}</title></head>
    <body>
      <h1>${var.environment_name}</h1>
      <p>Ticket: ${var.ticket_number}</p>
      <p>Owner: ${var.owner_email}</p>
      <p>This site was provisioned by CloudPortal. Upload your content to replace this page.</p>
    </body>
    </html>
  HTML

  depends_on = [aws_s3_bucket_policy.static_site]
}

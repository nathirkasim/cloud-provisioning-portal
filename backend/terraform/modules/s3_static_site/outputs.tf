output "bucket_id" {
  description = "S3 bucket name / ID"
  value       = aws_s3_bucket.static_site.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.static_site.arn
}

output "website_endpoint" {
  description = "S3 static website HTTP endpoint"
  value       = "http://${aws_s3_bucket_website_configuration.static_site.website_endpoint}"
}

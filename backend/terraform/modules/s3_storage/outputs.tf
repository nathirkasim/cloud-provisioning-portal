output "bucket_id" {
  description = "S3 bucket name / ID"
  value       = aws_s3_bucket.storage.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.storage.arn
}

output "bucket_region" {
  description = "AWS region the bucket lives in"
  value       = aws_s3_bucket.storage.region
}

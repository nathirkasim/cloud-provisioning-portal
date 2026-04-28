output "repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.repo.name
}

output "repository_url" {
  description = "ECR repository URL (use as Docker registry)"
  value       = aws_ecr_repository.repo.repository_url
}

output "registry_id" {
  description = "AWS account ID that owns the registry"
  value       = aws_ecr_repository.repo.registry_id
}

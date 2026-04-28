output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.cluster.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.service.name
}

output "task_definition_arn" {
  description = "Task definition ARN"
  value       = aws_ecs_task_definition.task.arn
}

output "log_group_name" {
  description = "CloudWatch log group for container logs"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

# NOTE: Public IP is runtime-assigned by Fargate and cannot be a Terraform output.
# The portal backfills environment_url after provisioning using boto3 describe_tasks.

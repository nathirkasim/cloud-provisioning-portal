output "db_instance_id" {
  description = "RDS instance ID"
  value       = aws_db_instance.database.identifier
}

output "db_endpoint" {
  description = "Connection endpoint for the database"
  value       = aws_db_instance.database.endpoint
}

output "db_port" {
  description = "Port the database is listening on"
  value       = aws_db_instance.database.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.database.db_name
}

output "db_username" {
  description = "Master username"
  value       = aws_db_instance.database.username
}

output "connection_string" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${aws_db_instance.database.username}:${var.db_password}@${aws_db_instance.database.endpoint}/${aws_db_instance.database.db_name}"
  sensitive   = true
}

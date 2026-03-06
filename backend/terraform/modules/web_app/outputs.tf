output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.web_app.id
}

output "public_ip" {
  description = "Public IP address of the instance"
  value       = aws_instance.web_app.public_ip
}

output "public_dns" {
  description = "Public DNS of the instance"
  value       = aws_instance.web_app.public_dns
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.web_app_sg.id
}

output "environment_url" {
  description = "URL to access the environment"
  value       = "http://${aws_instance.web_app.public_ip}"
}

# SNS Standard Topic — free tier: 1M requests/month
resource "aws_sns_topic" "topic" {
  name = "${lower(var.ticket_number)}-topic"

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
    Department   = var.department
  }
}

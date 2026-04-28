# DynamoDB Table — On-Demand billing, free tier: 25GB storage forever
resource "aws_dynamodb_table" "table" {
  name         = "${lower(var.ticket_number)}-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
    Department   = var.department
  }
}

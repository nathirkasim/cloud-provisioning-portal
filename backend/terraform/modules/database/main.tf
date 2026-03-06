

# Security group for RDS — only allow PostgreSQL port
resource "aws_security_group" "db_sg" {
  name        = "${var.ticket_number}-db-sg"
  description = "Security group for ${var.environment_name} database"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "PostgreSQL access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name         = "${var.ticket_number}-db-sg"
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    ManagedBy    = "CloudPortal"
  }
}

# RDS PostgreSQL instance — db.t3.micro is Free Tier eligible
resource "aws_db_instance" "database" {
  identifier        = "${var.ticket_number}-db"
  engine            = "postgres"
  engine_version    = "15.4"
  instance_class    = var.instance_class
  allocated_storage = var.storage_gb
  storage_type      = "gp2"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  publicly_accessible    = true
  skip_final_snapshot    = true
  deletion_protection    = false
  multi_az               = false

  vpc_security_group_ids = [aws_security_group.db_sg.id]

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
  }
}

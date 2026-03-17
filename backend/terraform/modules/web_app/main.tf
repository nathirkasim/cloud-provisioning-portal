

# Get the latest Ubuntu 22.04 LTS AMI (Free Tier eligible)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical's official AWS account

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security group — allow SSH and HTTP
resource "aws_security_group" "web_app_sg" {
  name        = "${var.ticket_number}-sg"
  description = "Security group for ${var.environment_name}"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH access"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP access"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name         = "${var.ticket_number}-sg"
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    ManagedBy    = "CloudPortal"
  }
}

# EC2 instance — t2.micro is Free Tier eligible
resource "aws_instance" "web_app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.web_app_sg.id]

  root_block_device {
    volume_size = var.storage_gb
    volume_type = "gp2"
  }

  user_data = <<-USERDATA
    #!/bin/bash
    apt-get update -y
    apt-get install -y apache2
    systemctl start apache2
    systemctl enable apache2
    echo "<h1>Environment: ${var.environment_name}</h1><p>Ticket: ${var.ticket_number}</p><p>Owner: ${var.owner_email}</p>" > /var/www/html/index.html
  USERDATA

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
    Department   = var.department
    CreatedAt    = timestamp()
  }
}

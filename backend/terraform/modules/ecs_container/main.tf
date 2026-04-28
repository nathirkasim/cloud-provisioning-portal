# ECS Fargate Container — ~$9/month, NOT free tier eligible
# Cost warning is displayed to the user in the portal before provisioning

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group — allow inbound on container port, all outbound
resource "aws_security_group" "ecs_sg" {
  name        = "${var.ticket_number}-ecs-sg"
  description = "Security group for ECS Fargate task ${var.environment_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Container port access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name         = "${var.ticket_number}-ecs-sg"
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    ManagedBy    = "CloudPortal"
  }
}

# IAM execution role — allows ECS to pull images and write logs
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.ticket_number}-ecs-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    TicketNumber = var.ticket_number
    ManagedBy    = "CloudPortal"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# CloudWatch log group for container logs
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.ticket_number}"
  retention_in_days = 7

  tags = {
    TicketNumber = var.ticket_number
    ManagedBy    = "CloudPortal"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "cluster" {
  name = "${var.ticket_number}-cluster"

  tags = {
    Name         = var.environment_name
    TicketNumber = var.ticket_number
    Owner        = var.owner_email
    DurationDays = var.duration_days
    ManagedBy    = "CloudPortal"
    Department   = var.department
  }
}

# Task definition
resource "aws_ecs_task_definition" "task" {
  family                   = "${var.ticket_number}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([{
    name      = "app"
    image     = var.container_image
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = {
    TicketNumber = var.ticket_number
    ManagedBy    = "CloudPortal"
  }
}

# ECS Service — Fargate launch type, public IP assigned at runtime
resource "aws_ecs_service" "service" {
  name            = "${var.ticket_number}-service"
  cluster         = aws_ecs_cluster.cluster.id
  task_definition = aws_ecs_task_definition.task.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  tags = {
    TicketNumber = var.ticket_number
    ManagedBy    = "CloudPortal"
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_execution_policy]
}

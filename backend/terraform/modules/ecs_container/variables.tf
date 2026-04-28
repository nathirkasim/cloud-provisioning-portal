variable "environment_name" {
  description = "Name of the environment"
  type        = string
}

variable "ticket_number" {
  description = "Portal ticket number for tagging"
  type        = string
}

variable "owner_email" {
  description = "Email of the user who requested this environment"
  type        = string
}

variable "duration_days" {
  description = "How many days this environment should live"
  type        = number
  default     = 14
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "department" {
  description = "Department of the requesting user"
  type        = string
  default     = "Engineering"
}

variable "container_image" {
  description = "Docker image to run (defaults to nginx for placeholder)"
  type        = string
  default     = "nginx:latest"
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 80
}

variable "cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory in MB"
  type        = number
  default     = 512
}

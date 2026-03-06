variable "environment_name" {
  description = "Name of the environment"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "storage_gb" {
  description = "Root volume size in GB"
  type        = number
  default     = 20
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

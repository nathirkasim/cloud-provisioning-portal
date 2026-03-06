variable "environment_name" {
  description = "Name of the environment"
  type        = string
}

variable "memory_mb" {
  description = "Lambda memory in MB"
  type        = number
  default     = 512
}

variable "timeout_seconds" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "python3.11"
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

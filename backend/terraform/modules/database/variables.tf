variable "environment_name" {
  description = "Name of the environment"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "storage_gb" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Name of the database to create"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  default     = "dbadmin"
}

variable "db_password" {
  description = "Master password for the database"
  type        = string
  sensitive   = true
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

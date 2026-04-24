terraform {
  backend "s3" {
    bucket         = "cloud-portal-tfstate-nathirproj"
    key            = "portal/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "cloud-portal-tf-locks"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "template_type" {
  description = "Type of environment: web_app, database, serverless"
  type        = string
}

variable "environment_name" {
  description = "Name of the environment"
  type        = string
}

variable "ticket_number" {
  description = "Portal ticket number"
  type        = string
}

variable "owner_email" {
  description = "Email of requester"
  type        = string
}

variable "duration_days" {
  description = "Lifetime of environment in days"
  type        = number
  default     = 14
}

variable "db_password" {
  description = "Database password (only for database template)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}
variable "department" {
  description = "Department of requesting user"
  type        = string
  default     = "Engineering"
}

module "web_app" {
  source           = "./modules/web_app"
  count            = var.template_type == "web_app" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
}

module "database" {
  source           = "./modules/database"
  count            = var.template_type == "database" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  db_password      = var.db_password
  aws_region       = var.aws_region
}

module "serverless" {
  source           = "./modules/serverless"
  count            = var.template_type == "serverless" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
}

output "web_app_public_ip" {
  value = var.template_type == "web_app" ? module.web_app[0].public_ip : null
}

output "web_app_url" {
  value = var.template_type == "web_app" ? module.web_app[0].environment_url : null
}

output "web_app_instance_id" {
  value = var.template_type == "web_app" ? module.web_app[0].instance_id : null
}

output "database_endpoint" {
  value = var.template_type == "database" ? module.database[0].db_endpoint : null
}

output "db_instance_id" {
  value = var.template_type == "database" ? module.database[0].db_instance_id : null
}

output "serverless_api_endpoint" {
  value = var.template_type == "serverless" ? module.serverless[0].api_endpoint : null
}

output "function_name" {
  value = var.template_type == "serverless" ? module.serverless[0].function_name : null
}

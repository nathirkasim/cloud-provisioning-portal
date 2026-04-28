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
  description = "Type of environment: web_app, database, serverless, s3_static_site, s3_storage, sns_topic, dynamodb, ecr_repository, ecs_container"
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

# ── Existing modules ──────────────────────────────────────────────────────────

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

# ── New Tier 1 modules ────────────────────────────────────────────────────────

module "s3_static_site" {
  source           = "./modules/s3_static_site"
  count            = var.template_type == "s3_static_site" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

module "s3_storage" {
  source           = "./modules/s3_storage"
  count            = var.template_type == "s3_storage" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

module "sns_topic" {
  source           = "./modules/sns_topic"
  count            = var.template_type == "sns_topic" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

module "dynamodb" {
  source           = "./modules/dynamodb"
  count            = var.template_type == "dynamodb" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

module "ecr_repository" {
  source           = "./modules/ecr_repository"
  count            = var.template_type == "ecr_repository" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

module "ecs_container" {
  source           = "./modules/ecs_container"
  count            = var.template_type == "ecs_container" ? 1 : 0
  environment_name = var.environment_name
  ticket_number    = var.ticket_number
  owner_email      = var.owner_email
  duration_days    = var.duration_days
  aws_region       = var.aws_region
  department       = var.department
}

# ── Outputs — existing ────────────────────────────────────────────────────────

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

# ── Outputs — new modules ─────────────────────────────────────────────────────

output "s3_static_site_bucket_id" {
  value = var.template_type == "s3_static_site" ? module.s3_static_site[0].bucket_id : null
}

output "s3_static_site_url" {
  value = var.template_type == "s3_static_site" ? module.s3_static_site[0].website_endpoint : null
}

output "s3_storage_bucket_id" {
  value = var.template_type == "s3_storage" ? module.s3_storage[0].bucket_id : null
}

output "s3_storage_bucket_arn" {
  value = var.template_type == "s3_storage" ? module.s3_storage[0].bucket_arn : null
}

output "sns_topic_arn" {
  value = var.template_type == "sns_topic" ? module.sns_topic[0].topic_arn : null
}

output "sns_topic_name" {
  value = var.template_type == "sns_topic" ? module.sns_topic[0].topic_name : null
}

output "dynamodb_table_name" {
  value = var.template_type == "dynamodb" ? module.dynamodb[0].table_name : null
}

output "dynamodb_table_arn" {
  value = var.template_type == "dynamodb" ? module.dynamodb[0].table_arn : null
}

output "ecr_repository_url" {
  value = var.template_type == "ecr_repository" ? module.ecr_repository[0].repository_url : null
}

output "ecr_repository_name" {
  value = var.template_type == "ecr_repository" ? module.ecr_repository[0].repository_name : null
}

output "ecs_cluster_name" {
  value = var.template_type == "ecs_container" ? module.ecs_container[0].cluster_name : null
}

output "ecs_service_name" {
  value = var.template_type == "ecs_container" ? module.ecs_container[0].service_name : null
}

output "ecs_log_group_name" {
  value = var.template_type == "ecs_container" ? module.ecs_container[0].log_group_name : null
}

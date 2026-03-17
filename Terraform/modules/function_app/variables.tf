variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "app_subnet_id" {
  type    = string
  default = null
}

variable "database_url" { type = string }
variable "redis_url" { type = string }

variable "paystack_secret_key" {
  type      = string
  sensitive = true
}
variable "flutterwave_secret_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "notification_hub_connection" {
  type      = string
  sensitive = true
}
variable "notification_hub_name" { type = string }

variable "app_insights_connection_string" {
  type      = string
  sensitive = true
}

variable "function_app_settings" {
  type    = map(string)
  default = {}
}

variable "zip_deploy_file" {
  type    = string
  default = null
}

variable "storage_use_managed_identity" {
  type    = bool
  default = true
}

variable "storage_assign_roles" {
  type    = bool
  default = true
}

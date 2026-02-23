variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "admin_email" { type = string }
variable "oncall_phone" { type = string }

variable "app_service_id" {
  type    = string
  default = null
}

variable "enable_alerts" {
  type    = bool
  default = false
}

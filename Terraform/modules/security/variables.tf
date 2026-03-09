variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "tenant_id" { type = string }
variable "terraform_sp_object_id" { type = string }

variable "db_admin_password" {
  type      = string
  sensitive = true
}
variable "jwt_secret" {
  type      = string
  sensitive = true
}
variable "paystack_secret_key" {
  type      = string
  sensitive = true
}
variable "fcm_api_key" {
  type      = string
  sensitive = true
}
variable "allowed_ip_rules" {
  type    = list(string)
  default = []
}

variable "enable_b2c_tenant" {
  type    = bool
  default = false
}

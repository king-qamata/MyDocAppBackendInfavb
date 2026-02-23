variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "db_admin_username" { type = string }
variable "db_admin_password" {
  type      = string
  sensitive = true
}
variable "db_sku" { type = string }
variable "database_subnet_id" { type = string }
variable "private_dns_zone_id" { type = string }
variable "storage_mb" {
  type    = number
  default = 327680
}
variable "db_configurations" {
  type    = map(string)
  default = {}
}

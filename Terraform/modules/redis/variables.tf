variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "capacity" { type = number }
variable "family" { type = string }
variable "sku_name" { type = string }
variable "subnet_id" { type = string }
variable "private_dns_zone_id" { type = string }

variable "backup_storage_connection_string" {
  type      = string
  default   = null
  sensitive = true
}

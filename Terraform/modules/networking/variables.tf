variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "location_short" { type = string }
variable "tags" { type = map(string) }

variable "vnet_address_space" { type = list(string) }
variable "app_subnet_prefix" { type = string }
variable "db_subnet_prefix" { type = string }
variable "redis_subnet_prefix" { type = string }

variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "app_service_sku" { type = string }
variable "app_subnet_id" { type = string }
variable "allowed_origins" { type = list(string) }

variable "database_url" { type = string }
variable "redis_url" { type = string }
variable "acs_connection_string" {
  type      = string
  sensitive = true
}
variable "webpubsub_connection_string" {
  type      = string
  sensitive = true
}
variable "key_vault_uri" { type = string }
variable "face_api_endpoint" { type = string }
variable "face_api_key" {
  type      = string
  sensitive = true
}
variable "speaker_api_endpoint" { type = string }
variable "speaker_api_key" {
  type      = string
  sensitive = true
}
variable "notification_hub_connection" {
  type      = string
  sensitive = true
}
variable "notification_hub_name" { type = string }
variable "app_insights_key" {
  type      = string
  sensitive = true
}

variable "app_settings" {
  type    = map(string)
  default = {}
}

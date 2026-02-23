variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tags" { type = map(string) }

variable "data_location" { type = string }
variable "webpubsub_sku" { type = string }

variable "fcm_api_key" {
  type      = string
  sensitive = true
}
variable "apns_key_id" { type = string }
variable "apns_team_id" { type = string }
variable "apns_token" {
  type      = string
  sensitive = true
}

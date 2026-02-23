variable "admin_email" { type = string }
variable "oncall_phone" { type = string }

variable "fcm_api_key" {
  type      = string
  sensitive = true
}
variable "paystack_secret_key" {
  type      = string
  sensitive = true
}
variable "apns_key_id" { type = string }
variable "apns_team_id" { type = string }
variable "apns_token" {
  type      = string
  sensitive = true
}

variable "flutterwave_secret_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "terraform_sp_object_id" { type = string }
variable "allowed_ip_addresses" {
  type    = list(string)
  default = []
}
variable "redis_backup_storage_connection" {
  type      = string
  sensitive = true
}

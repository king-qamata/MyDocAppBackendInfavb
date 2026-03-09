output "acs_connection_string" {
  value     = azurerm_communication_service.acs.primary_connection_string
  sensitive = true
}

output "webpubsub_connection_string" {
  value     = azurerm_web_pubsub.this.primary_connection_string
  sensitive = true
}

output "notification_hub_connection" {
  value     = var.environment == "prod" ? azurerm_notification_hub_authorization_rule.terraform[0].primary_connection_string : ""
  sensitive = true
}

output "notification_hub_name" {
  value = var.environment == "prod" ? azurerm_notification_hub.fcm[0].name : ""
}

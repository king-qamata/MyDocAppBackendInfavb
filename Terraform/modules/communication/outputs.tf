output "acs_connection_string" {
  value     = azurerm_communication_service.acs.primary_connection_string
  sensitive = true
}

output "webpubsub_connection_string" {
  value     = azurerm_web_pubsub.this.primary_connection_string
  sensitive = true
}

output "notification_hub_connection" {
  value     = try(jsondecode(data.azapi_resource_action.notification_hub_namespace_keys.output).primaryConnectionString, "")
  sensitive = true
}

output "notification_hub_name" {
  value = azurerm_notification_hub.fcm.name
}

output "app_service_id" {
  value = azurerm_linux_web_app.api.id
}

output "default_site_hostname" {
  value = azurerm_linux_web_app.api.default_hostname
}

output "principal_id" {
  value = azurerm_linux_web_app.api.identity[0].principal_id
}

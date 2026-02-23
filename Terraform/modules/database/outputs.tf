output "primary_server_id" {
  value = azurerm_postgresql_flexible_server.primary.id
}

output "primary_server_fqdn" {
  value = azurerm_postgresql_flexible_server.primary.fqdn
}

output "primary_server_name" {
  value = azurerm_postgresql_flexible_server.primary.name
}

output "replica_server_id" {
  value = try(azurerm_postgresql_flexible_server.replica[0].id, null)
}

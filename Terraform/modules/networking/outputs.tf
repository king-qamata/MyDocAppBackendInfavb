output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "app_subnet_id" {
  value = azurerm_subnet.app_service.id
}

output "database_subnet_id" {
  value = azurerm_subnet.database.id
}

output "redis_subnet_id" {
  value = azurerm_subnet.redis.id
}

output "postgres_dns_zone_id" {
  value = azurerm_private_dns_zone.postgres.id
}

output "redis_dns_zone_id" {
  value = azurerm_private_dns_zone.redis.id
}

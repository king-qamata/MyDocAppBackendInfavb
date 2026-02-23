output "redis_id" {
  value = azurerm_redis_cache.this.id
}

output "redis_host_name" {
  value = azurerm_redis_cache.this.hostname
}

output "redis_ssl_port" {
  value = azurerm_redis_cache.this.ssl_port
}

output "redis_primary_key" {
  value     = azurerm_redis_cache.this.primary_access_key
  sensitive = true
}

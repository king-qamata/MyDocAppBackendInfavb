output "resource_group_name" {
  value = module.networking.resource_group_name
}

output "app_service_hostname" {
  value = module.app_service.default_site_hostname
}

output "function_app_hostname" {
  value = module.function_app.function_app_hostname
}

output "postgres_fqdn" {
  value = module.database.primary_server_fqdn
}

output "redis_hostname" {
  value = module.redis.redis_host_name
}

output "frontdoor_name" {
  value = azurerm_frontdoor.this.name
}

output "app_insights_id" {
  value = module.monitoring.app_insights_id
}

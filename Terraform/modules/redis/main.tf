# modules/redis/main.tf
resource "azurerm_redis_cache" "this" {
  name                = "redis-${var.project_name}-${var.environment}-001"
  resource_group_name = var.resource_group_name
  location            = var.location
  capacity            = var.capacity
  family              = var.family
  sku_name            = var.sku_name

  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"

  redis_configuration {
    maxmemory_reserved              = var.environment == "prod" ? 200 : 100
    maxmemory_delta                 = var.environment == "prod" ? 200 : 100
    maxfragmentationmemory_reserved = var.environment == "prod" ? 200 : 100
    maxmemory_policy                = "volatile-lru"
    notify_keyspace_events          = var.sku_name == "Premium" ? "KEA" : null
    rdb_backup_enabled              = var.environment == "prod" ? true : false
    rdb_backup_frequency            = var.environment == "prod" ? 60 : null
    rdb_backup_max_snapshot_count   = var.environment == "prod" ? 1 : null
    rdb_storage_connection_string   = var.environment == "prod" ? var.backup_storage_connection_string : null
  }

  subnet_id = var.sku_name == "Premium" ? var.subnet_id : null

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 2
  }

  tags = var.tags
}

resource "azurerm_private_endpoint" "redis" {
  count               = var.sku_name == "Premium" ? 1 : 0
  name                = "pe-${azurerm_redis_cache.this.name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_id

  private_service_connection {
    name                           = "psc-redis"
    private_connection_resource_id = azurerm_redis_cache.this.id
    is_manual_connection           = false
    subresource_names              = ["redisCache"]
  }

  private_dns_zone_group {
    name                 = "redis-dns-zone-group"
    private_dns_zone_ids = [var.private_dns_zone_id]
  }

  tags = var.tags
}

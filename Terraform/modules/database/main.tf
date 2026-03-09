# modules/database/main.tf
resource "azurerm_postgresql_flexible_server" "primary" {
  name                   = "psql-${var.project_name}-${var.environment}-001"
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = "14"
  administrator_login    = var.db_admin_username
  administrator_password = var.db_admin_password
  zone                   = "1"

  storage_mb = var.environment == "prod" ? 327680 : 131072 # 320GB prod, 128GB dev
  sku_name   = var.db_sku

  backup_retention_days        = var.environment == "prod" ? 30 : 7
  geo_redundant_backup_enabled = var.environment == "prod" ? true : false

  dynamic "high_availability" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      mode = "ZoneRedundant"
    }
  }

  delegated_subnet_id           = var.database_subnet_id
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false

  timeouts {
    create = "2h"
    update = "2h"
    delete = "2h"
  }

  tags = var.tags
}

# Read replica for production
resource "azurerm_postgresql_flexible_server" "replica" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "psql-${var.project_name}-${var.environment}-replica-001"
  resource_group_name = var.resource_group_name
  location            = var.location
  version             = "14"
  zone                = "2"
  sku_name            = var.db_sku
  source_server_id    = azurerm_postgresql_flexible_server.primary.id

  storage_mb                    = var.storage_mb
  delegated_subnet_id           = var.database_subnet_id
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false

  timeouts {
    create = "2h"
    update = "2h"
    delete = "2h"
  }

  tags = var.tags
}

# Virtual endpoint for read replicas (Production only)
resource "azurerm_postgresql_flexible_server_virtual_endpoint" "reader" {
  count             = var.environment == "prod" ? 1 : 0
  name              = "ve-${var.project_name}-reader"
  source_server_id  = azurerm_postgresql_flexible_server.primary.id
  replica_server_id = azurerm_postgresql_flexible_server.replica[0].id
  type              = "ReadWrite"
}

resource "azurerm_postgresql_flexible_server_configuration" "pg_config" {
  for_each = var.db_configurations

  name      = each.key
  server_id = azurerm_postgresql_flexible_server.primary.id
  value     = each.value
}

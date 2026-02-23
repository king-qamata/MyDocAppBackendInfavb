# modules/app_service/main.tf
resource "azurerm_service_plan" "this" {
  name                = "asp-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  
  tags = var.tags
}

resource "azurerm_linux_web_app" "api" {
  name                = "app-${var.project_name}-api-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id
  
  https_only          = true
  virtual_network_subnet_id = var.app_subnet_id
  
  identity {
    type = "SystemAssigned"
  }
  
  site_config {
    minimum_tls_version = "1.2"
    always_on          = var.environment == "prod" ? true : false
    ftps_state         = "Disabled"
    
    application_stack {
      node_version = "18-lts"
    }
    
    cors {
      allowed_origins = var.allowed_origins
    }
    
    health_check_path                 = "/health"
    health_check_eviction_time_in_min = var.environment == "prod" ? 10 : 2
  }
  
  app_settings = merge(var.app_settings, {
    "WEBSITE_NODE_DEFAULT_VERSION" = "18-lts"
    "DATABASE_URL"                  = var.database_url
    "REDIS_URL"                     = var.redis_url
    "ACS_CONNECTION_STRING"         = var.acs_connection_string
    "WEBPUBSUB_CONNECTION_STRING"   = var.webpubsub_connection_string
    "KEY_VAULT_URI"                 = var.key_vault_uri
    "FACE_API_ENDPOINT"             = var.face_api_endpoint
    "FACE_API_KEY"                  = var.face_api_key
    "SPEAKER_API_ENDPOINT"          = var.speaker_api_endpoint
    "SPEAKER_API_KEY"               = var.speaker_api_key
    "NOTIFICATION_HUB_CONNECTION"    = var.notification_hub_connection
    "NOTIFICATION_HUB_NAME"          = var.notification_hub_name
    "ENVIRONMENT"                    = var.environment
    "APPINSIGHTS_INSTRUMENTATIONKEY" = var.app_insights_key
  })
  
  logs {
    application_logs {
      file_system_level = var.environment == "prod" ? "Information" : "Verbose"
    }
    
    http_logs {
      file_system {
        retention_in_days = var.environment == "prod" ? 30 : 7
        retention_in_mb   = var.environment == "prod" ? 100 : 35
      }
    }
  }
  
  tags = var.tags
}

# Staging slot for production
resource "azurerm_linux_web_app_slot" "staging" {
  count          = var.environment == "prod" ? 1 : 0
  name           = "staging"
  app_service_id = azurerm_linux_web_app.api.id
  
  site_config {
    minimum_tls_version = "1.2"
    always_on          = true
    application_stack {
      node_version = "18-lts"
    }
    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 10
  }
  
  app_settings = azurerm_linux_web_app.api.app_settings
  
  tags = var.tags
}

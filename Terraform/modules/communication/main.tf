terraform {
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
    }
  }
}

# modules/communication/main.tf
resource "azurerm_communication_service" "acs" {
  name                = "acs-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  data_location       = var.data_location

  tags = var.tags
}

resource "azurerm_web_pubsub" "this" {
  name                = "wps-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  sku      = var.webpubsub_sku
  capacity = var.environment == "prod" ? 2 : 1

  live_trace {
    enabled                   = var.environment == "prod" ? true : false
    messaging_logs_enabled    = true
    connectivity_logs_enabled = true
  }

  tags = var.tags
}

resource "azurerm_notification_hub_namespace" "this" {
  name                = "nhns-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  namespace_type      = "NotificationHub"
  sku_name            = var.environment == "prod" ? "Standard" : "Free"

  tags = var.tags
}

resource "azurerm_notification_hub" "fcm" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "nh-${var.project_name}-fcm"
  namespace_name      = azurerm_notification_hub_namespace.this.name
  resource_group_name = var.resource_group_name
  location            = var.location

  gcm_credential {
    api_key = var.fcm_api_key
  }
}

resource "azurerm_notification_hub_authorization_rule" "terraform" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "terraform-access"
  notification_hub_name = azurerm_notification_hub.fcm[0].name
  namespace_name      = azurerm_notification_hub_namespace.this.name
  resource_group_name = var.resource_group_name
  manage              = true
  send                = true
  listen              = true
}

resource "azurerm_notification_hub" "apns" {
  count               = var.environment == "prod" ? 1 : 0
  name                = "nh-${var.project_name}-apns"
  namespace_name      = azurerm_notification_hub_namespace.this.name
  resource_group_name = var.resource_group_name
  location            = var.location

  apns_credential {
    application_mode = "Production"
    bundle_id        = "com.mydoc.app"
    key_id           = var.apns_key_id
    team_id          = var.apns_team_id
    token            = var.apns_token
  }
}

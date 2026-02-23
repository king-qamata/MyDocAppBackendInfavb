resource "azurerm_storage_account" "functions" {
  name                     = "st${var.project_name}${var.environment}func"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "prod" ? "GRS" : "LRS"
  min_tls_version          = "TLS1_2"

  allow_nested_items_to_be_public = false

  tags = var.tags
}

resource "azurerm_service_plan" "functions" {
  name                = "asp-${var.project_name}-func-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.environment == "prod" ? "EP1" : "Y1"

  tags = var.tags
}

resource "azurerm_linux_function_app" "this" {
  name                = "func-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.functions.id

  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key

  https_only                 = true
  virtual_network_subnet_id  = var.app_subnet_id

  functions_extension_version = "~4"

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }

    ftps_state         = "Disabled"
    minimum_tls_version = "1.2"
    application_insights_connection_string = var.app_insights_connection_string
  }

  app_settings = merge(var.function_app_settings, {
    "FUNCTIONS_WORKER_RUNTIME"              = "node"
    "WEBSITE_RUN_FROM_PACKAGE"              = "1"
    "SCM_DO_BUILD_DURING_DEPLOYMENT"        = "true"
    "DATABASE_URL"                          = var.database_url
    "REDIS_URL"                             = var.redis_url
    "PAYSTACK_SECRET_KEY"                   = var.paystack_secret_key
    "FLUTTERWAVE_SECRET_KEY"                = var.flutterwave_secret_key
    "NOTIFICATION_HUB_CONNECTION"           = var.notification_hub_connection
    "NOTIFICATION_HUB_NAME"                 = var.notification_hub_name
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = var.app_insights_connection_string
  })

  tags = var.tags
}

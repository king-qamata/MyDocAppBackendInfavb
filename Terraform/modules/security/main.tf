terraform {
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
    }
    random = {
      source = "hashicorp/random"
    }
    azapi = {
      source = "Azure/azapi"
    }
  }
}

# modules/security/main.tf
resource "azurerm_key_vault" "this" {
  name                = "kv-${var.project_name}-${var.environment}-${random_string.suffix.result}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = var.tenant_id
  sku_name            = "premium"

  soft_delete_retention_days = 90
  purge_protection_enabled   = var.environment == "prod" ? true : false

  enabled_for_deployment          = true
  enabled_for_disk_encryption     = true
  enabled_for_template_deployment = true

  network_acls {
    default_action = var.environment == "prod" ? "Deny" : "Allow"
    bypass         = "AzureServices"
    ip_rules       = var.allowed_ip_rules
  }

  tags = var.tags
}

resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}

resource "azurerm_key_vault_access_policy" "terraform_sp" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = var.tenant_id
  object_id    = var.terraform_sp_object_id

  key_permissions = [
    "Get", "List", "Create", "Delete", "Update", "Import", "Backup", "Restore", "Recover", "UnwrapKey", "WrapKey", "Verify", "Sign"
  ]

  secret_permissions = [
    "Get", "List", "Set", "Delete", "Backup", "Restore", "Recover"
  ]

  certificate_permissions = [
    "Get", "List", "Create", "Delete", "Update"
  ]
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "db-admin-password"
  value        = var.db_admin_password
  key_vault_id = azurerm_key_vault.this.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.this.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "paystack_key" {
  name         = "paystack-secret-key"
  value        = var.paystack_secret_key
  key_vault_id = azurerm_key_vault.this.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "fcm_api_key" {
  name         = "fcm-api-key"
  value        = var.fcm_api_key
  key_vault_id = azurerm_key_vault.this.id

  tags = var.tags
}

# Azure AI Face API
resource "azurerm_cognitive_account" "face_api" {
  name                = "cog-${var.project_name}-face-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  kind                = "Face"
  sku_name            = var.environment == "prod" ? "S0" : "F0"

  tags = var.tags
}

resource "azurerm_cognitive_account" "speaker_recognition" {
  name                = "cog-${var.project_name}-speaker-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  kind                = "SpeechServices"
  sku_name            = var.environment == "prod" ? "S0" : "F0"

  tags = var.tags
}

# Azure AD B2C
resource "azapi_resource" "b2c_tenant" {
  count     = var.enable_b2c_tenant ? 1 : 0
  type      = "Microsoft.AzureActiveDirectory/b2cDirectories@2023-05-17-preview"
  name      = "${var.project_name}${var.environment}b2c"
  parent_id = "/"
  location  = "United States" # Or "Europe" based on data residency requirements

  body = {
    properties = {
      createTenantProperties = {
        countryCode     = "NG"
        displayName     = "MyDoc ${var.environment} B2C"
        isGoLocalTenant = false
      }
    }
    sku = {
      name = var.environment == "prod" ? "PremiumP1" : "Standard"
      tier = "A0"
    }
  }

  tags = var.tags
}

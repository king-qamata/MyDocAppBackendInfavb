# environments/dev/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 1.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "tfstatemydocdev"
    container_name       = "tfstate"
    key                  = "dev.terraform.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
}

provider "azapi" {
  # No additional configuration needed
}

# Data sources
data "azurerm_client_config" "current" {}

# Local variables
locals {
  project_name   = "mydoc"
  environment    = "dev"
  location       = "westeurope"
  location_short = "weu"

  tags = {
    Environment = "Development"
    Project     = "MyDoc"
    ManagedBy   = "Terraform"
    CostCenter  = "R&D"
  }

  vnet_address_space  = ["10.0.0.0/16"]
  app_subnet_prefix   = "10.0.1.0/24"
  db_subnet_prefix    = "10.0.2.0/24"
  redis_subnet_prefix = "10.0.3.0/24"
}

# Networking module
module "networking" {
  source = "../../modules/networking"

  project_name   = local.project_name
  environment    = local.environment
  location       = local.location
  location_short = local.location_short
  tags           = local.tags

  vnet_address_space  = local.vnet_address_space
  app_subnet_prefix   = local.app_subnet_prefix
  db_subnet_prefix    = local.db_subnet_prefix
  redis_subnet_prefix = local.redis_subnet_prefix
}

# Generate random passwords
resource "random_password" "db_admin" {
  length  = 24
  special = true
  upper   = true
  lower   = true
  numeric = true
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# Database module
module "database" {
  source     = "../../modules/database"
  depends_on = [module.networking]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  db_admin_username   = "mydocadmin"
  db_admin_password   = random_password.db_admin.result
  db_sku              = "GP_Standard_D2ds_v4"
  database_subnet_id  = module.networking.database_subnet_id
  private_dns_zone_id = module.networking.postgres_dns_zone_id

  db_configurations = {
    "azure.extensions" = "CITEXT,PG_CRON,UUID-OSSP"
    "max_connections"  = "100"
    "shared_buffers"   = "512MB"
  }
}

# Redis module
module "redis" {
  source     = "../../modules/redis"
  depends_on = [module.networking]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  capacity            = 1
  family              = "C"
  sku_name            = "Basic"
  subnet_id           = module.networking.redis_subnet_id
  private_dns_zone_id = module.networking.redis_dns_zone_id
}

# Communication module
module "communication" {
  source     = "../../modules/communication"
  depends_on = [module.networking]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  data_location = "Europe"
  webpubsub_sku = "Free_F1"

  # For dev, use placeholder values
  fcm_api_key  = var.fcm_api_key
  apns_key_id  = var.apns_key_id
  apns_team_id = var.apns_team_id
  apns_token   = var.apns_token
}

# Security module
module "security" {
  source     = "../../modules/security"
  depends_on = [module.networking]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  tenant_id              = data.azurerm_client_config.current.tenant_id
  terraform_sp_object_id = data.azurerm_client_config.current.object_id
  db_admin_password      = random_password.db_admin.result
  jwt_secret             = random_password.jwt_secret.result
  paystack_secret_key    = var.paystack_secret_key
  fcm_api_key            = var.fcm_api_key
  allowed_ip_rules       = []
}

# App Service module
module "app_service" {
  source     = "../../modules/app_service"
  depends_on = [module.database, module.redis, module.communication, module.security, module.monitoring]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  app_service_sku = "B1"
  app_subnet_id   = module.networking.app_subnet_id
  allowed_origins = ["http://localhost:3000", "http://localhost:8080"]

  database_url                = "postgresql://${module.database.primary_server_fqdn}:5432/mydoc?sslmode=require"
  redis_url                   = "redis://${module.redis.redis_host_name}:${module.redis.redis_ssl_port}"
  acs_connection_string       = module.communication.acs_connection_string
  webpubsub_connection_string = module.communication.webpubsub_connection_string
  key_vault_uri               = module.security.key_vault_uri
  face_api_endpoint           = module.security.face_api_endpoint
  face_api_key                = module.security.face_api_key
  speaker_api_endpoint        = module.security.speaker_api_endpoint
  speaker_api_key             = module.security.speaker_api_key
  notification_hub_connection = module.communication.notification_hub_connection
  notification_hub_name       = module.communication.notification_hub_name
  app_insights_key            = module.monitoring.app_insights_key

  app_settings = {
    "NODE_ENV"                = "development"
    "LOG_LEVEL"               = "debug"
    "SESSION_TIMEOUT"         = "3600"
    "MAX_CONCURRENT_NORMAL"   = "5"
    "MAX_CONCURRENT_PRIORITY" = "2"
    "MAX_CONCURRENT_SUPER"    = "1"
    "COMMISSION_RATE"         = "0.20"
  }
}

# Function App module
module "function_app" {
  source     = "../../modules/function_app"
  depends_on = [module.database, module.redis, module.communication, module.security, module.monitoring]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  app_subnet_id          = module.networking.app_subnet_id
  database_url           = "postgresql://${module.database.primary_server_fqdn}:5432/mydoc?sslmode=require"
  redis_url              = "redis://${module.redis.redis_host_name}:${module.redis.redis_ssl_port}"
  paystack_secret_key    = var.paystack_secret_key
  flutterwave_secret_key = var.flutterwave_secret_key

  notification_hub_connection    = module.communication.notification_hub_connection
  notification_hub_name          = module.communication.notification_hub_name
  app_insights_connection_string = module.monitoring.app_insights_connection_string

  function_app_settings = {
    "NODE_ENV"                    = "development"
    "PAYMENT_PROCESSOR_SCHEDULE"  = "0 */5 * * * *"
    "COMPLIANCE_CLEANUP_SCHEDULE" = "0 0 2 * * *"
  }
}

# Monitoring module
module "monitoring" {
  source     = "../../modules/monitoring"
  depends_on = [module.networking]

  project_name        = local.project_name
  environment         = local.environment
  location            = local.location
  resource_group_name = module.networking.resource_group_name
  tags                = local.tags

  admin_email   = var.admin_email
  oncall_phone  = var.oncall_phone
  enable_alerts = false
}

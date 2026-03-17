# environments/prod/main.tf
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
    storage_account_name = "tfstatemydocprod"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
    use_azuread_auth     = true
  }
}

provider "azurerm" {
  storage_use_azuread = true

  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

# Data sources
data "azurerm_client_config" "current" {}

# Local variables
locals {
  project_name   = "mydoc"
  environment    = "prod"
  location       = "westeurope"
  location_short = "weu"

  tags = {
    Environment        = "Production"
    Project            = "MyDoc"
    ManagedBy          = "Terraform"
    CostCenter         = "Production"
    DataClassification = "Confidential"
  }

  vnet_address_space  = ["10.1.0.0/16"]
  app_subnet_prefix   = "10.1.1.0/24"
  db_subnet_prefix    = "10.1.2.0/24"
  redis_subnet_prefix = "10.1.3.0/24"
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

# Generate random passwords (only on initial create)
resource "random_password" "db_admin" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  numeric = true
}

resource "random_password" "jwt_secret" {
  length  = 128
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
  db_sku              = "GP_Standard_D4s_v3"
  database_subnet_id  = module.networking.database_subnet_id
  private_dns_zone_id = module.networking.postgres_dns_zone_id
  storage_mb          = 327680 # 320GB

  db_configurations = {
    "azure.extensions"      = "CITEXT,PG_CRON,UUID-OSSP,POSTGIS"
    "max_connections"       = "500"
    "shared_buffers"        = "262144"
    "work_mem"              = "20MB"
    "maintenance_work_mem"  = "1GB"
    "effective_cache_size"  = "6GB"
    "wal_level"             = "logical"
    "max_wal_senders"       = "10"
    "max_replication_slots" = "10"
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

  capacity                         = 2
  family                           = "P"
  sku_name                         = "Premium"
  subnet_id                        = module.networking.redis_subnet_id
  private_dns_zone_id              = module.networking.redis_dns_zone_id
  backup_storage_connection_string = var.redis_backup_storage_connection
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
  webpubsub_sku = "Standard_S1"

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
  terraform_sp_object_id = var.terraform_sp_object_id
  db_admin_password      = random_password.db_admin.result
  jwt_secret             = random_password.jwt_secret.result
  paystack_secret_key    = var.paystack_secret_key
  fcm_api_key            = var.fcm_api_key
  allowed_ip_rules       = var.allowed_ip_addresses
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

  app_service_sku = "P1v3"
  app_subnet_id   = module.networking.app_subnet_id
  allowed_origins = ["https://api.mydoc.com", "https://admin.mydoc.com"]

  database_url                = "postgresql://${module.database.primary_server_fqdn}:5432/mydoc?sslmode=require"
  redis_url                   = "rediss://:${module.redis.redis_primary_key}@${module.redis.redis_host_name}:${module.redis.redis_ssl_port}/0?ssl=true"
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
    "NODE_ENV"                        = "production"
    "LOG_LEVEL"                       = "info"
    "SESSION_TIMEOUT"                 = "7200"
    "MAX_CONCURRENT_NORMAL"           = "5"
    "MAX_CONCURRENT_PRIORITY"         = "2"
    "MAX_CONCURRENT_SUPER"            = "1"
    "COMMISSION_RATE"                 = "0.20"
    "WEBSITE_ENABLE_SYNC_UPDATE_SITE" = "true"
  }

  zip_deploy_file = "../../../artifacts/api.zip"
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
  redis_url              = "rediss://:${module.redis.redis_primary_key}@${module.redis.redis_host_name}:${module.redis.redis_ssl_port}/0?ssl=true"
  paystack_secret_key    = var.paystack_secret_key
  flutterwave_secret_key = var.flutterwave_secret_key

  notification_hub_connection    = module.communication.notification_hub_connection
  notification_hub_name          = module.communication.notification_hub_name
  app_insights_connection_string = module.monitoring.app_insights_connection_string

  function_app_settings = {
    "NODE_ENV"                    = "production"
    "PAYMENT_PROCESSOR_SCHEDULE"  = "0 */5 * * * *"
    "COMPLIANCE_CLEANUP_SCHEDULE" = "0 0 2 * * *"
  }

  storage_use_managed_identity = true
  storage_assign_roles         = true

  zip_deploy_file = "../../../artifacts/functions.zip"
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

# Azure Front Door (Production only)
resource "azurerm_frontdoor" "this" {
  name                = "fd-mydoc-prod"
  resource_group_name = module.networking.resource_group_name

  backend_pool {
    name = "apiBackend"
    backend {
      host_header = module.app_service.default_site_hostname
      address     = module.app_service.default_site_hostname
      http_port   = 80
      https_port  = 443
    }
    load_balancing_name = "loadBalancingSettings1"
    health_probe_name   = "healthProbeSettings1"
  }

  backend_pool_load_balancing {
    name = "loadBalancingSettings1"
  }

  backend_pool_health_probe {
    name                = "healthProbeSettings1"
    protocol            = "Https"
    path                = "/health"
    interval_in_seconds = 30
  }

  frontend_endpoint {
    name      = "frontendEndpoint"
    host_name = "api.mydoc.com"
  }

  routing_rule {
    name               = "apiRoutingRule"
    accepted_protocols = ["Http", "Https"]
    patterns_to_match  = ["/*"]
    frontend_endpoints = ["frontendEndpoint"]
    forwarding_configuration {
      backend_pool_name                     = "apiBackend"
      cache_enabled                         = false
      cache_query_parameter_strip_directive = "StripAll"
    }
  }

  tags = local.tags
}

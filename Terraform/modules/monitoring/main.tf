# modules/monitoring/main.tf
resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${var.project_name}-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "prod" ? 90 : 30
  
  tags = var.tags
}

resource "azurerm_application_insights" "this" {
  name                = "appi-${var.project_name}-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  application_type    = "Node.JS"
  workspace_id        = azurerm_log_analytics_workspace.this.id
  
  tags = var.tags
}

resource "azurerm_monitor_action_group" "critical" {
  name                = "ag-critical-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "critical"
  
  email_receiver {
    name                    = "send-to-admin"
    email_address           = var.admin_email
    use_common_alert_schema = true
  }
  
  sms_receiver {
    name         = "sms-to-oncall"
    country_code = "234"
    phone_number = var.oncall_phone
  }
}

resource "azurerm_monitor_metric_alert" "cpu_high" {
  count               = var.enable_alerts && var.app_service_id != null ? 1 : 0
  name                = "alert-cpu-high-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [var.app_service_id]
  description         = "Action will be triggered when CPU usage is > 80%"
  frequency           = "PT5M"
  window_size         = "PT15M"
  
  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }
  
  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

resource "azurerm_monitor_metric_alert" "memory_high" {
  count               = var.enable_alerts && var.app_service_id != null ? 1 : 0
  name                = "alert-memory-high-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [var.app_service_id]
  description         = "Action will be triggered when memory usage is > 80%"
  frequency           = "PT5M"
  window_size         = "PT15M"
  
  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "MemoryPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }
  
  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert" "failed_requests" {
  count               = var.enable_alerts ? 1 : 0
  name                = "alert-failed-requests-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location
  
  action {
    action_group = [azurerm_monitor_action_group.critical.id]
  }
  
  data_source_id = azurerm_application_insights.this.id
  description    = "Alert when failed requests > 5%"
  enabled        = true
  
  query       = <<-QUERY
    requests
    | where success == false
    | summarize AggregatedValue = count() by bin(timestamp, 5m)
    | where AggregatedValue > 10
  QUERY
  
  severity    = 1
  frequency   = 5
  time_window = 15
  
  trigger {
    operator  = "GreaterThan"
    threshold = 10
  }
}

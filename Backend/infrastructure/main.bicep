targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Location for resources')
param location string = resourceGroup().location

// Tags
var tags = {
  environment: environment
  project: 'mydoc-app'
  managedBy: 'bicep'
}

// PostgreSQL Flexible Server
resource postgresql 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: 'mydoc-postgres-${environment}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_D2ds_v4'
    tier: 'GeneralPurpose'
  }
  properties: {
    administratorLogin: 'mydocadmin'
    administratorLoginPassword: '@secure()' // Set in Key Vault
    version: '14'
    storage: {
      storageSizeGB: 128
    }
    backup: {
      backupRetentionDays: 35
    }
    highAvailability: {
      mode: environment == 'prod' ? 'ZoneRedundant' : 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: subnet.id
      privateDnsZoneArmResourceId: privateDnsZone.id
    }
  }
}

// Redis Cache
resource redis 'Microsoft.Cache/redis@2022-06-01' = {
  name: 'mydoc-redis-${environment}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'Premium'
      family: 'P'
      capacity: 1
    }
    redisConfiguration: {
      'maxmemory-policy': 'allkeys-lru'
      'aof-backup-enabled': 'true'
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    subnetId: subnet.id
  }
}

// Storage Account
resource storage 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: 'mydocstorage${environment}${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_GRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    blobServices: {
      properties: {
        deleteRetentionPolicy: {
          enabled: true
          days: 7
        }
        containerDeleteRetentionPolicy: {
          enabled: true
          days: 7
        }
      }
    }
    networkAcls: {
      defaultAction: 'Deny'
      virtualNetworkRules: [
        {
          id: subnet.id
          action: 'Allow'
        }
      ]
    }
  }
}

// Blob containers with lifecycle policies
resource recordingsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2022-09-01' = {
  name: '${storage.name}/default/recordings'
  properties: {
    publicAccess: 'None'
  }
}

resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/blobServices/providers/policies@2022-09-01' = {
  name: '${storage.name}/default/Microsoft.Management/lifecyclePolicies/default'
  properties: {
    rules: [
      {
        name: 'deleteAfter90Days'
        enabled: true
        type: 'Lifecycle'
        definition: {
          actions: {
            baseBlob: {
              delete: {
                daysAfterModificationGreaterThan: 90
              }
            }
          }
          filters: {
            blobTypes: ['blockBlob']
            prefixMatch: ['recordings/']
          }
        }
      }
    ]
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: 'mydoc-plan-${environment}'
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'P2v3' : 'B1'
    tier: environment == 'prod' ? 'PremiumV3' : 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// App Service (Backend API)
resource appService 'Microsoft.Web/sites@2022-03-01' = {
  name: 'mydoc-api-${environment}'
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('postgres-connection-string').secretUri})'
        }
        {
          name: 'REDIS_HOST'
          value: redis.properties.hostName
        }
        {
          name: 'REDIS_PASSWORD'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('redis-password').secretUri})'
        }
        {
          name: 'ACS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('acs-connection-string').secretUri})'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: 'mydoc-functions-${environment}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: false
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('postgres-connection-string').secretUri})'
        }
        {
          name: 'STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('storage-connection-string').secretUri})'
        }
        {
          name: 'PAYSTACK_SECRET_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.getSecret('paystack-secret').secretUri})'
        }
      ]
    }
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'mydoc-insights-${environment}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2021-12-01-preview' = {
  name: 'mydoc-logs-${environment}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2022-07-01' = {
  name: 'mydoc-kv-${environment}-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    softDeleteRetentionInDays: 90
    purgeProtectionEnabled: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [
        {
          id: subnet.id
          action: 'Allow'
        }
      ]
    }
  }
}

// Azure Communication Services
resource acs 'Microsoft.Communication/communicationServices@2023-03-31' = {
  name: 'mydoc-acs-${environment}-${uniqueString(resourceGroup().id)}'
  location: 'Global'
  tags: tags
  properties: {
    dataLocation: 'Nigeria'
  }
}

// Front Door (Global Load Balancer & WAF)
resource frontDoor 'Microsoft.Cdn/profiles@2021-06-01' = {
  name: 'mydoc-frontdoor-${environment}'
  location: 'global'
  tags: tags
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    originGroups: [
      {
        name: 'api-origin-group'
        properties: {
          loadBalancingSettings: {
            sampleSize: 4
            successfulSamplesRequired: 3
            additionalLatencyInMilliseconds: 50
          }
          healthProbeSettings: {
            probePath: '/health'
            probeRequestType: 'GET'
            probeProtocol: 'Https'
            probeIntervalInSeconds: 30
          }
        }
      }
    ]
    origins: [
      {
        name: 'api-origin'
        properties: {
          address: appService.properties.defaultHostName
          originGroupName: 'api-origin-group'
          httpPort: 80
          httpsPort: 443
          priority: 1
          weight: 1000
          enabledState: 'Enabled'
        }
      }
    ]
    endpoints: [
      {
        name: 'mydoc-api-endpoint'
        properties: {
          autoGeneratedDomainNameLabelScope: 'TenantReuse'
        }
      }
    ]
    routes: [
      {
        name: 'api-route'
        properties: {
          endpointName: 'mydoc-api-endpoint'
          originGroupName: 'api-origin-group'
          supportedProtocols: ['Http', 'Https']
          patternsToMatch: ['/*']
          forwardingProtocol: 'HttpsOnly'
          linkToDefaultDomain: 'Enabled'
          httpsRedirect: 'Enabled'
        }
      }
    ]
    securityPolicies: [
      {
        name: 'waf-policy'
        properties: {
          parameters: {
            type: 'WebApplicationFirewall'
            wafPolicy: {
              id: wafPolicy.id
            }
          }
        }
      }
    ]
  }
}

// WAF Policy
resource wafPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: 'mydoc-waf-${environment}'
  location: 'global'
  tags: tags
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: environment == 'prod' ? 'Prevention' : 'Detection'
      requestBodyCheck: 'Enabled'
      fileUploadLimitInMb: 100
      maxRequestBodySizeInKb: 128
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
          exclusions: []
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.0'
        }
      ]
    }
  }
}

// Virtual Network
resource vnet 'Microsoft.Network/virtualNetworks@2022-01-01' = {
  name: 'mydoc-vnet-${environment}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'app-subnet'
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            {
              name: 'app-delegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'db-subnet'
        properties: {
          addressPrefix: '10.0.2.0/24'
          delegations: [
            {
              name: 'db-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

// Outputs
output apiEndpoint string = frontDoor.properties.endpoints[0].properties.hostName
output appInsightsKey string = appInsights.properties.InstrumentationKey
output acsEndpoint string = acs.properties.hostName

# environments/prod/terraform.tfvars
admin_email     = "admin@mydoc.com"
oncall_phone    = "08011223344"

fcm_api_key     = "production-fcm-api-key-from-secrets"
paystack_secret_key = "production-paystack-secret-from-secrets"
apns_key_id     = "production-apns-key-id-from-secrets"
apns_team_id    = "production-apns-team-id-from-secrets"
apns_token      = "production-apns-token-from-secrets"

terraform_sp_object_id = "00000000-0000-0000-0000-000000000000" # Replace with actual SP object ID
allowed_ip_addresses = ["203.0.113.0/24", "198.51.100.0/24"] # Office IPs
redis_backup_storage_connection = "DefaultEndpointsProtocol=https;AccountName=..."
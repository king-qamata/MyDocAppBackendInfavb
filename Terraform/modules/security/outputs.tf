output "key_vault_id" {
  value = azurerm_key_vault.this.id
}

output "key_vault_uri" {
  value = azurerm_key_vault.this.vault_uri
}

output "face_api_endpoint" {
  value = azurerm_cognitive_account.face_api.endpoint
}

output "face_api_key" {
  value     = azurerm_cognitive_account.face_api.primary_access_key
  sensitive = true
}

output "speaker_api_endpoint" {
  value = azurerm_cognitive_account.speaker_recognition.endpoint
}

output "speaker_api_key" {
  value     = azurerm_cognitive_account.speaker_recognition.primary_access_key
  sensitive = true
}

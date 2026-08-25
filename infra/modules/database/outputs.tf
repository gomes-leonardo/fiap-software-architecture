output "db_endpoint" {
  description = "Endpoint do RDS no formato host:porta."
  value       = aws_db_instance.this.endpoint
}

output "db_address" {
  description = "Hostname do RDS, sem a porta. E o valor de DB_HOST na aplicacao."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "Porta do Postgres. E o valor de DB_PORT."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Nome do banco. E o valor de DB_NAME."
  value       = aws_db_instance.this.db_name
}

output "db_username" {
  description = "Usuario master. E o valor de DB_USER."
  value       = aws_db_instance.this.username
}

output "db_password" {
  description = "Senha do usuario master. Preferir ler do Secrets Manager; exposta aqui apenas para automacao."
  value       = random_password.master.result
  sensitive   = true
}

output "db_security_group_id" {
  description = "Security group da instancia RDS."
  value       = aws_security_group.this.id
}

output "db_secret_arn" {
  description = "ARN do segredo no Secrets Manager com o JSON de credenciais (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS)."
  value       = aws_secretsmanager_secret.db.arn
}

output "db_secret_name" {
  description = "Nome do segredo no Secrets Manager."
  value       = aws_secretsmanager_secret.db.name
}

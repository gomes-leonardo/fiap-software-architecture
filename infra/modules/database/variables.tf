variable "identifier" {
  description = "Identificador da instancia RDS."
  type        = string
}

variable "vpc_id" {
  description = "VPC onde o security group do banco e criado."
  type        = string
}

variable "private_subnet_ids" {
  description = "Subnets privadas do DB subnet group. O RDS nunca fica em subnet publica."
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Um DB subnet group exige subnets em pelo menos duas zonas de disponibilidade."
  }
}

variable "allowed_security_group_ids" {
  description = "Security groups autorizados a abrir conexao na porta do Postgres. Aqui entra o SG dos nodes do EKS."
  type        = list(string)
  default     = []
}

variable "engine_version" {
  description = "Versao do PostgreSQL. Espelha o postgres:16-alpine do docker-compose."
  type        = string
  default     = "16.4"
}

variable "instance_class" {
  description = "Classe da instancia RDS."
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Armazenamento inicial em GiB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Teto do storage autoscaling. 0 desliga o autoscaling."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Standby sincrono em outra AZ. Dobra o custo — desligado em dev."
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Nome do banco inicial. Alimenta DB_NAME na aplicacao."
  type        = string
  default     = "soat_repair_shop"
}

variable "db_username" {
  description = "Usuario master. Alimenta DB_USER na aplicacao."
  type        = string
  default     = "soat_app"

  validation {
    condition     = !contains(["postgres", "admin", "root", "rdsadmin"], lower(var.db_username))
    error_message = "Evite nomes de usuario previsiveis (postgres, admin, root, rdsadmin)."
  }
}

variable "db_port" {
  description = "Porta do Postgres."
  type        = number
  default     = 5432
}

variable "backup_retention_days" {
  description = "Dias de retencao de backup automatico. 0 desliga os backups."
  type        = number
  default     = 1
}

variable "deletion_protection" {
  description = "Impede destroy acidental da instancia. Ligue em prod."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Pula o snapshot final no destroy. true em dev para o destroy nao deixar rastro cobrado."
  type        = bool
  default     = true
}

variable "performance_insights_enabled" {
  description = "Performance Insights. Nao e suportado em todas as classes t3 — mantenha desligado em db.t3.micro."
  type        = bool
  default     = false
}

variable "secret_recovery_window_days" {
  description = "Janela de recuperacao do segredo no Secrets Manager. 0 apaga na hora, o que permite destroy e apply seguidos com o mesmo nome."
  type        = number
  default     = 0
}

variable "tags" {
  description = "Tags aplicadas a todos os recursos do modulo."
  type        = map(string)
  default     = {}
}

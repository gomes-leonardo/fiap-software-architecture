variable "project" {
  description = "Nome do projeto. Compoe o nome do bucket e as tags."
  type        = string
  default     = "soat-tech-challenge"
}

variable "region" {
  description = "Regiao onde o bucket e a tabela de lock vivem."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Nome do bucket de state. null gera <project>-tfstate-<account_id>, que e globalmente unico."
  type        = string
  default     = null
}

variable "lock_table_name" {
  description = "Nome da tabela DynamoDB de lock."
  type        = string
  default     = "soat-tech-challenge-tfstate-lock"
}

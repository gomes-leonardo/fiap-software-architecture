terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# ---------------------------------------------------------------------------
# Senha. Gerada aqui e guardada no Secrets Manager — nenhuma senha e escrita
# em .tf ou .tfvars. Ela continua visivel no state, entao o state precisa ser
# remoto e criptografado (ver infra/bootstrap).
# ---------------------------------------------------------------------------

resource "random_password" "master" {
  length  = 32
  special = true

  # O RDS recusa estes caracteres na senha do usuario master.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ---------------------------------------------------------------------------
# Rede.
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name       = "${var.identifier}-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, { Name = "${var.identifier}-subnet-group" })
}

resource "aws_security_group" "this" {
  name        = "${var.identifier}-sg"
  description = "Acesso ao PostgreSQL do ${var.identifier}"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.identifier}-sg" })

  lifecycle {
    create_before_destroy = true
  }
}

# Regra unica de entrada: porta do Postgres, apenas a partir dos security
# groups informados (na pratica, o SG dos nodes do EKS). Sem CIDR aberto.
resource "aws_vpc_security_group_ingress_rule" "from_app" {
  for_each = toset(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  from_port                    = var.db_port
  to_port                      = var.db_port
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL a partir do security group ${each.value}"

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Instancia.
# ---------------------------------------------------------------------------

resource "aws_db_instance" "this" {
  identifier = var.identifier

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage == 0 ? null : var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.master.result
  port     = var.db_port

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]

  # Sem endereco publico: o banco so e alcancavel de dentro da VPC.
  publicly_accessible = false
  multi_az            = var.multi_az

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = var.skip_final_snapshot
  final_snapshot_identifier  = var.skip_final_snapshot ? null : "${var.identifier}-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"

  performance_insights_enabled = var.performance_insights_enabled
  enabled_cloudwatch_logs_exports = [
    "postgresql",
    "upgrade",
  ]

  # Rotacao de senha e feita pelo Secrets Manager quando configurada; o
  # Terraform nao deve reverter a senha rotacionada no plan seguinte.
  lifecycle {
    ignore_changes = [password]
  }

  tags = merge(var.tags, { Name = var.identifier })
}

# ---------------------------------------------------------------------------
# Segredo. As chaves espelham o .env.example da aplicacao, para que o passo de
# deploy possa converter o JSON em Secret do Kubernetes sem traduzir nomes.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db" {
  name                    = "${var.identifier}/credentials"
  description             = "Credenciais do PostgreSQL do ${var.identifier}"
  recovery_window_in_days = var.secret_recovery_window_days

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  secret_string = jsonencode({
    DB_HOST = aws_db_instance.this.address
    DB_PORT = tostring(aws_db_instance.this.port)
    DB_NAME = var.db_name
    DB_USER = var.db_username
    DB_PASS = random_password.master.result
  })
}

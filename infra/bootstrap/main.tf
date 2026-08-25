terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State local de proposito. Este root cria os recursos que hospedam o state
  # remoto dos demais — nao ha onde guardar o proprio state antes de existirem.
  # Ele muda uma vez e para; guarde terraform.tfstate deste diretorio em lugar
  # seguro ou aceite recriar via `terraform import`.
}

data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Project     = var.project
    Environment = "shared"
    ManagedBy   = "terraform"
    Purpose     = "terraform-remote-state"
  }

  bucket_name = coalesce(var.state_bucket_name, "${var.project}-tfstate-${data.aws_caller_identity.current.account_id}")
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  # O state contem senha do RDS. Apagar por acidente e perder o inventario de
  # tudo que existe na conta.
  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, { Name = local.bucket_name })
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Trava de concorrencia. O Terraform 1.10+ tambem sabe travar direto no S3 via
# `use_lockfile`, mas o enunciado pede DynamoDB e ele funciona em toda versao.
resource "aws_dynamodb_table" "lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, { Name = var.lock_table_name })
}

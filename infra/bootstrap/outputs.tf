output "state_bucket_name" {
  description = "Bucket S3 do state remoto. Use no backend.hcl dos ambientes."
  value       = aws_s3_bucket.state.id
}

output "lock_table_name" {
  description = "Tabela DynamoDB de lock. Use no backend.hcl dos ambientes."
  value       = aws_dynamodb_table.lock.name
}

output "backend_hcl" {
  description = "Conteudo pronto do backend.hcl para o ambiente aws/dev."
  value       = <<-EOT
    bucket         = "${aws_s3_bucket.state.id}"
    key            = "envs/aws/dev/terraform.tfstate"
    region         = "${var.region}"
    dynamodb_table = "${aws_dynamodb_table.lock.name}"
    encrypt        = true
  EOT
}

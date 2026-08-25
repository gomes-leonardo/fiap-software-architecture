output "cluster_name" {
  description = "Nome do cluster Kind."
  value       = kind_cluster.this.name
}

output "cluster_endpoint" {
  description = "Endpoint do servidor de API do Kubernetes."
  value       = kind_cluster.this.endpoint
}

output "kubectl_context" {
  description = "Contexto do kubeconfig criado pelo Kind."
  value       = "kind-${kind_cluster.this.name}"
}

output "kubeconfig_path" {
  description = "Arquivo kubeconfig onde o contexto foi escrito."
  value       = pathexpand(var.kubeconfig_path)
}

output "kubeconfig" {
  description = "Kubeconfig completo do cluster, com certificados de cliente embutidos."
  value       = kind_cluster.this.kubeconfig
  sensitive   = true
}

output "namespace" {
  description = "Namespace onde a aplicacao deve ser instalada."
  value       = local.namespace
}

output "db_endpoint" {
  description = "Endereco do PostgreSQL dentro do cluster, no formato host:porta."
  value       = var.enable_postgres ? "postgres.${local.namespace}.svc.cluster.local:5432" : null
}

output "db_secret_name" {
  description = "Secret do Kubernetes com DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASS."
  value       = var.enable_postgres ? kubernetes_secret.db[0].metadata[0].name : null
}

output "app_url" {
  description = "URL da aplicacao na maquina host, uma vez que o Service NodePort esteja publicado."
  value       = "http://localhost:${var.host_http_port}"
}

output "access_instructions" {
  description = "Passos para usar o cluster depois do apply."
  value       = <<-EOT
    1. Aponte o kubectl para o cluster:
         kubectl config use-context kind-${kind_cluster.this.name}

    2. Confira os nodes:
         kubectl get nodes

    3. Carregue a imagem da aplicacao no cluster (o Kind nao ve o registry
       local do Docker por conta propria):
         docker build -t soat-app:local .
         kind load docker-image soat-app:local --name ${kind_cluster.this.name}

    4. Aplique os manifestos do Kubernetes no namespace ${local.namespace}.
       O Service da aplicacao precisa ser NodePort ${var.node_port} para o
       mapeamento http://localhost:${var.host_http_port} funcionar.

    5. Verifique se o HPA esta lendo metrica (nao pode ficar em <unknown>):
         kubectl -n ${local.namespace} get hpa -w
  EOT
}

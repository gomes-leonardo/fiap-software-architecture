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
  description = "Namespace onde os manifestos de k8s/ devem ser aplicados."
  value       = local.namespace
}

output "load_image_command" {
  description = "Carrega a imagem da aplicacao no cluster. O Kind nao enxerga o daemon Docker local, e o Deployment usa imagePullPolicy IfNotPresent."
  value       = "kind load docker-image ${var.app_image} --name ${kind_cluster.this.name}"
}

output "app_port_forward_command" {
  description = "Publica a API na maquina. O Service da aplicacao e ClusterIP: nao ha NodePort nem LoadBalancer, entao este e o caminho de acesso."
  value       = "kubectl port-forward -n ${local.namespace} svc/${var.app_service_name} ${var.app_port}:${var.app_port}"
}

output "app_url" {
  description = "URL da API enquanto o port-forward estiver ativo."
  value       = "http://localhost:${var.app_port}"
}

output "postgres_managed_by" {
  description = "Quem cria o PostgreSQL neste ambiente: os manifestos em k8s/ (padrao) ou o Terraform."
  value       = var.enable_postgres ? "terraform" : "k8s-manifests"
}

output "db_endpoint" {
  description = "Endereco do PostgreSQL dentro do cluster. Preenchido so quando o Terraform e quem sobe o banco; com os manifestos o valor equivalente e DB_HOST do ConfigMap soat-app-config."
  value       = var.enable_postgres ? "${var.db_service_name}.${local.namespace}.svc.cluster.local:5432" : null
}

output "app_secret_name" {
  description = "Secret lido via envFrom pelo Deployment da aplicacao. Preenchido so quando o Terraform e quem o cria; caso contrario vem de k8s/app-secret.yaml."
  value       = var.enable_postgres ? kubernetes_secret.app[0].metadata[0].name : null
}

output "access_instructions" {
  description = "Passos para usar o cluster depois do apply."
  value       = <<-EOT
    1. Aponte o kubectl para o cluster:
         kubectl config use-context kind-${kind_cluster.this.name}
         kubectl get nodes

    2. Confirme que o metrics-server respondeu (o HPA depende dele):
         kubectl top nodes

    3. Construa a imagem da aplicacao e carregue no cluster:
         docker build -t ${var.app_image} .
         kind load docker-image ${var.app_image} --name ${kind_cluster.this.name}

    4. Aplique os manifestos${var.enable_postgres ? " (sem os de banco: o Terraform ja subiu o Postgres e o Secret)" : ""}:
         ${var.enable_postgres ? "kubectl apply -n ${local.namespace} -f k8s/app-configmap.yaml -f k8s/app-deployment.yaml -f k8s/app-service.yaml -f k8s/app-hpa.yaml" : "./k8s/apply-all.sh"}

    5. Verifique se o HPA esta lendo metrica (nao pode ficar em <unknown>):
         kubectl -n ${local.namespace} get hpa -w

    6. Publique a API na maquina:
         kubectl port-forward -n ${local.namespace} svc/${var.app_service_name} ${var.app_port}:${var.app_port}
         curl http://localhost:${var.app_port}/health
  EOT
}

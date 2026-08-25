variable "project" {
  description = "Nome do projeto. Vira o label Project."
  type        = string
  default     = "soat-tech-challenge"
}

variable "environment" {
  description = "Ambiente. Vira o label Environment."
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Nome do cluster Kind. O contexto no kubeconfig fica kind-<cluster_name>."
  type        = string
  default     = "soat-local"
}

variable "kubeconfig_path" {
  description = "Arquivo kubeconfig onde o kind escreve o contexto do cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "node_image" {
  description = "Imagem dos nodes do Kind. Fixa a versao do Kubernetes do cluster local."
  type        = string
  default     = "kindest/node:v1.31.0"
}

variable "worker_count" {
  description = "Nodes worker alem do control-plane. Dois deixam o HPA distribuir replicas entre nodes — o podAntiAffinity dos manifestos e `preferred`, entao ele aproveita mais de um node quando existe."
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count >= 1 && var.worker_count <= 5
    error_message = "worker_count precisa estar entre 1 e 5."
  }
}

variable "namespace" {
  description = "Namespace da aplicacao. Precisa ser o mesmo dos manifestos em k8s/."
  type        = string
  default     = "soat"
}

variable "create_namespace" {
  description = "Cria o namespace pelo Terraform, com os mesmos labels de k8s/namespace.yaml — o apply dos manifestos vira no-op. Deixe true para o `terraform destroy` levar a stack inteira junto; false se preferir que so o kubectl mexa no namespace."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# metrics-server. Nao existe nos manifestos por ser infraestrutura de cluster,
# e o Kind nao o inclui. Sem ele o HPA de k8s/app-hpa.yaml fica em
# <unknown>/70% e nunca escala.
# ---------------------------------------------------------------------------

variable "enable_metrics_server" {
  description = "Instala o metrics-server. Pre-requisito do HPA — deixe ligado."
  type        = bool
  default     = true
}

variable "metrics_server_chart_version" {
  description = "Versao do chart Helm do metrics-server."
  type        = string
  default     = "3.12.2"
}

# ---------------------------------------------------------------------------
# PostgreSQL pelo Terraform: caminho alternativo, desligado por padrao.
#
# A origem normal do banco no ambiente local sao os manifestos: k8s/ traz um
# StatefulSet `soat-db` com volumeClaimTemplates, ja validado em cluster real.
# Ligar isto sobe um segundo Postgres no mesmo namespace, entao so faz sentido
# deixando os manifestos de banco fora do apply (ver infra/README.md).
# ---------------------------------------------------------------------------

variable "enable_postgres" {
  description = "Sobe o PostgreSQL pelo Terraform em vez dos manifestos. Desligado por padrao: k8s/db-deployment.yaml e a origem normal do banco. Ligando, e obrigatorio deixar db-deployment.yaml, db-service.yaml e app-secret.yaml fora do apply dos manifestos."
  type        = bool
  default     = false
}

variable "postgres_image" {
  description = "Imagem do PostgreSQL. Mesma tag do docker-compose e dos manifestos."
  type        = string
  default     = "postgres:16-alpine"
}

variable "postgres_storage" {
  description = "Tamanho do PersistentVolumeClaim do banco. Igual ao volumeClaimTemplates dos manifestos."
  type        = string
  default     = "2Gi"
}

variable "db_service_name" {
  description = "Nome do Service ClusterIP do banco. Precisa ser o valor de DB_HOST no ConfigMap soat-app-config, senao a aplicacao nao resolve o banco."
  type        = string
  default     = "soat-db"
}

variable "db_name" {
  description = "Nome do banco. Precisa bater com DB_NAME do ConfigMap soat-app-config."
  type        = string
  default     = "soat_repair_shop"
}

variable "db_username" {
  description = "Usuario do banco. Vira a chave DB_USER do Secret."
  type        = string
  default     = "postgres"
}

variable "app_secret_name" {
  description = "Nome do Secret lido via envFrom pelo Deployment da aplicacao. Fonte unica: as mesmas credenciais alimentam app e banco."
  type        = string
  default     = "soat-app-secret"
}

variable "app_service_name" {
  description = "Nome do Service ClusterIP da aplicacao, usado para montar o comando de port-forward."
  type        = string
  default     = "soat-app"
}

variable "app_port" {
  description = "Porta do Service da aplicacao. Mesma porta do ConfigMap soat-app-config."
  type        = number
  default     = 3000
}

variable "app_image" {
  description = "Tag da imagem da aplicacao que precisa ser carregada no cluster com `kind load docker-image`. Mesma tag do Deployment em k8s/app-deployment.yaml."
  type        = string
  default     = "soat-tech-challenge:latest"
}

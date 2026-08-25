variable "project" {
  description = "Nome do projeto. Vira a tag/label Project."
  type        = string
  default     = "soat-tech-challenge"
}

variable "environment" {
  description = "Ambiente. Vira a tag/label Environment."
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
  description = "Nodes worker alem do control-plane. Dois deixam o HPA distribuir replicas entre nodes."
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count >= 1 && var.worker_count <= 5
    error_message = "worker_count precisa estar entre 1 e 5."
  }
}

variable "host_http_port" {
  description = "Porta da maquina mapeada para o NodePort de entrada do cluster. A aplicacao fica em http://localhost:<host_http_port>."
  type        = number
  default     = 8080
}

variable "node_port" {
  description = "NodePort dentro do cluster que recebe o trafego mapeado de host_http_port. Precisa bater com o NodePort do Service da aplicacao."
  type        = number
  default     = 30080

  validation {
    condition     = var.node_port >= 30000 && var.node_port <= 32767
    error_message = "NodePort precisa estar na faixa 30000-32767."
  }
}

variable "namespace" {
  description = "Namespace da aplicacao. Precisa ser o mesmo usado pelos manifestos K8s."
  type        = string
  default     = "soat"
}

variable "create_namespace" {
  description = "Cria o namespace pelo Terraform. Deixe true na primeira vez; nao ha conflito se os manifestos tambem declararem o namespace, mas quem apaga passa a ser o `terraform destroy`."
  type        = bool
  default     = true
}

variable "enable_postgres" {
  description = "Sobe o PostgreSQL dentro do cluster. Desligue se os manifestos K8s ja trouxerem o proprio banco, para nao ter dois."
  type        = bool
  default     = true
}

variable "postgres_image" {
  description = "Imagem do PostgreSQL. Mesma tag do docker-compose."
  type        = string
  default     = "postgres:16-alpine"
}

variable "postgres_storage" {
  description = "Tamanho do PersistentVolumeClaim do banco."
  type        = string
  default     = "2Gi"
}

variable "db_name" {
  description = "Nome do banco. Valor de DB_NAME."
  type        = string
  default     = "soat_repair_shop"
}

variable "db_username" {
  description = "Usuario do banco. Valor de DB_USER."
  type        = string
  default     = "soat_app"
}

variable "db_secret_name" {
  description = "Nome do Secret do Kubernetes com as credenciais do banco. Precisa bater com o que os manifestos da aplicacao consomem."
  type        = string
  default     = "soat-db-credentials"
}

variable "enable_metrics_server" {
  description = "Instala o metrics-server. O Kind nao traz metrics-server, e sem ele o HPA fica preso em <unknown> e nunca escala."
  type        = bool
  default     = true
}

variable "metrics_server_chart_version" {
  description = "Versao do chart Helm do metrics-server."
  type        = string
  default     = "3.12.2"
}

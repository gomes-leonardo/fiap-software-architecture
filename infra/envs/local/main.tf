locals {
  # Iguais aos labels de k8s/namespace.yaml, para que o apply dos manifestos
  # sobre o namespace criado aqui nao gere drift no plan seguinte.
  namespace_labels = {
    "app.kubernetes.io/part-of" = var.project
    "name"                      = var.namespace
  }

  # Mesmos labels de k8s/db-service.yaml e k8s/db-deployment.yaml: com
  # enable_postgres = true o banco do Terraform precisa ser indistinguivel do
  # banco dos manifestos para os Services e o ConfigMap continuarem valendo.
  db_labels = {
    "app.kubernetes.io/name"      = var.db_service_name
    "app.kubernetes.io/component" = "database"
    "app.kubernetes.io/part-of"   = var.project
  }
}

# ---------------------------------------------------------------------------
# Cluster Kind.
#
# Sem extraPortMappings: o Service da aplicacao em k8s/app-service.yaml e
# ClusterIP na porta 3000, sem NodePort — escolha deliberada dos manifestos,
# porque um Service LoadBalancer fica <pending> para sempre em Kind. Mapear
# porta do host para uma NodePort que nao existe seria configuracao morta. O
# acesso e por `kubectl port-forward` (ver output app_port_forward_command).
# ---------------------------------------------------------------------------

resource "kind_cluster" "this" {
  name            = var.cluster_name
  node_image      = var.node_image
  kubeconfig_path = pathexpand(var.kubeconfig_path)
  wait_for_ready  = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"
    }

    dynamic "node" {
      for_each = range(var.worker_count)

      content {
        role = "worker"
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Namespace da aplicacao.
# ---------------------------------------------------------------------------

resource "kubernetes_namespace" "app" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = local.namespace_labels
  }

  depends_on = [kind_cluster.this]
}

locals {
  namespace = var.create_namespace ? kubernetes_namespace.app[0].metadata[0].name : var.namespace
}

# ---------------------------------------------------------------------------
# metrics-server. O Kind nao inclui, e o kubelet dele serve metricas com
# certificado auto-assinado — dai o --kubelet-insecure-tls, que so e aceitavel
# porque este cluster e descartavel e roda na maquina de quem desenvolve.
# ---------------------------------------------------------------------------

resource "helm_release" "metrics_server" {
  count = var.enable_metrics_server ? 1 : 0

  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_chart_version
  namespace  = "kube-system"

  set {
    name  = "args[0]"
    value = "--kubelet-insecure-tls"
  }

  set {
    name  = "args[1]"
    value = "--kubelet-preferred-address-types=InternalIP\\,Hostname"
  }

  depends_on = [kind_cluster.this]
}

# ---------------------------------------------------------------------------
# PostgreSQL pelo Terraform — desligado por padrao (enable_postgres = false).
#
# Os recursos abaixo sao um substituto drop-in de k8s/db-deployment.yaml,
# k8s/db-service.yaml e k8s/app-secret.yaml: mesmos nomes, mesmos labels,
# mesmo Secret. O ganho sobre os manifestos e um so — `wait_for_rollout` faz o
# apply so devolver o controle com o banco aceitando conexao. A perda tambem e
# uma: Deployment + PVC em vez de StatefulSet + volumeClaimTemplates, que e o
# motivo de os manifestos serem o caminho padrao.
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  count = var.enable_postgres ? 1 : 0

  length  = 24
  special = false
}

resource "random_password" "jwt" {
  count = var.enable_postgres ? 1 : 0

  length  = 48
  special = false
}

resource "random_password" "webhook" {
  count = var.enable_postgres ? 1 : 0

  length  = 48
  special = false
}

# As quatro chaves sao exatamente as de k8s/app-secret.yaml. DB_HOST, DB_PORT e
# DB_NAME nao entram aqui de proposito: eles vivem no ConfigMap
# soat-app-config, que nao e segredo e continua vindo dos manifestos.
resource "kubernetes_secret" "app" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = var.app_secret_name
    namespace = local.namespace

    labels = {
      "app.kubernetes.io/name"    = "soat-app"
      "app.kubernetes.io/part-of" = var.project
    }
  }

  data = {
    DB_USER        = var.db_username
    DB_PASS        = random_password.db[0].result
    JWT_SECRET     = random_password.jwt[0].result
    WEBHOOK_SECRET = random_password.webhook[0].result
  }

  type = "Opaque"
}

resource "kubernetes_persistent_volume_claim" "db" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = "${var.db_service_name}-pgdata"
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = var.postgres_storage
      }
    }
  }

  # O provisionador local-path do Kind so liga o volume quando o primeiro pod o
  # consome. Esperar aqui trava o apply para sempre.
  wait_until_bound = false
}

resource "kubernetes_deployment" "db" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = var.db_service_name
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    replicas = 1

    # Um unico PVC ReadWriteOnce nao suporta dois pods ao mesmo tempo: a
    # atualizacao precisa derrubar antes de subir.
    strategy {
      type = "Recreate"
    }

    selector {
      match_labels = {
        "app.kubernetes.io/name" = var.db_service_name
      }
    }

    template {
      metadata {
        labels = local.db_labels
      }

      spec {
        security_context {
          # 70 e o uid/gid do usuario postgres na imagem postgres:16-alpine.
          # fsGroup faz o kubelet ajustar o dono do volume montado — sem isso o
          # initdb falha por permissao.
          run_as_user     = 70
          run_as_group    = 70
          fs_group        = 70
          run_as_non_root = true
        }

        container {
          name              = "postgres"
          image             = var.postgres_image
          image_pull_policy = "IfNotPresent"

          port {
            name           = "postgres"
            container_port = 5432
          }

          env {
            name  = "POSTGRES_DB"
            value = var.db_name
          }

          env {
            name = "POSTGRES_USER"

            value_from {
              secret_key_ref {
                name = kubernetes_secret.app[0].metadata[0].name
                key  = "DB_USER"
              }
            }
          }

          env {
            name = "POSTGRES_PASSWORD"

            value_from {
              secret_key_ref {
                name = kubernetes_secret.app[0].metadata[0].name
                key  = "DB_PASS"
              }
            }
          }

          # O initdb exige diretorio vazio, e alguns provisionadores criam
          # lost+found na raiz do volume. Dados num subdiretorio resolvem.
          env {
            name  = "PGDATA"
            value = "/var/lib/postgresql/data/pgdata"
          }

          volume_mount {
            name       = "pgdata"
            mount_path = "/var/lib/postgresql/data"
          }

          readiness_probe {
            exec {
              command = ["sh", "-c", "exec pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -h 127.0.0.1"]
            }

            initial_delay_seconds = 5
            period_seconds        = 5
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          liveness_probe {
            exec {
              command = ["sh", "-c", "exec pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -h 127.0.0.1"]
            }

            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 6
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "256Mi"
            }

            limits = {
              cpu    = "1"
              memory = "512Mi"
            }
          }

          security_context {
            allow_privilege_escalation = false

            capabilities {
              drop = ["ALL"]
            }

            # O Postgres escreve o socket unix em /var/run/postgresql e
            # temporarios de sort em /tmp: rootfs somente leitura exigiria
            # emptyDir nos dois caminhos.
            read_only_root_filesystem = false
          }
        }

        volume {
          name = "pgdata"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.db[0].metadata[0].name
          }
        }

        # 30s (default) e curto para um shutdown limpo do Postgres sob carga.
        termination_grace_period_seconds = 60
      }
    }
  }

  # O apply nao deve devolver o controle antes do banco aceitar conexao — os
  # manifestos da aplicacao sao aplicados logo depois.
  wait_for_rollout = true
}

resource "kubernetes_service" "db" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = var.db_service_name
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    type = "ClusterIP"

    selector = {
      "app.kubernetes.io/name" = var.db_service_name
    }

    port {
      name        = "postgres"
      port        = 5432
      target_port = "postgres"
    }
  }
}

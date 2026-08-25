locals {
  common_labels = {
    "app.kubernetes.io/part-of"    = var.project
    "app.kubernetes.io/managed-by" = "terraform"
    "soat.io/project"              = var.project
    "soat.io/environment"          = var.environment
  }

  postgres_labels = merge(local.common_labels, {
    "app.kubernetes.io/name"      = "postgres"
    "app.kubernetes.io/component" = "database"
  })
}

# ---------------------------------------------------------------------------
# Cluster Kind. Control-plane com mapeamento de porta para a maquina host e
# workers para o HPA ter onde espalhar replicas.
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

      # Unica porta de entrada: o NodePort do Service da aplicacao sai em
      # http://localhost:<host_http_port> sem precisar de port-forward.
      extra_port_mappings {
        container_port = var.node_port
        host_port      = var.host_http_port
        protocol       = "TCP"
      }
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
    labels = local.common_labels
  }

  depends_on = [kind_cluster.this]
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
# PostgreSQL dentro do cluster. Substitui o RDS no caminho local; as chaves do
# Secret sao as mesmas que o modulo database grava no Secrets Manager, para que
# os manifestos da aplicacao nao precisem mudar entre os dois ambientes.
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  count = var.enable_postgres ? 1 : 0

  length  = 24
  special = false
}

locals {
  namespace = var.create_namespace ? kubernetes_namespace.app[0].metadata[0].name : var.namespace
}

resource "kubernetes_secret" "db" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = var.db_secret_name
    namespace = local.namespace
    labels    = local.postgres_labels
  }

  data = {
    DB_HOST = "postgres.${local.namespace}.svc.cluster.local"
    DB_PORT = "5432"
    DB_NAME = var.db_name
    DB_USER = var.db_username
    DB_PASS = random_password.db[0].result
  }

  type = "Opaque"
}

resource "kubernetes_persistent_volume_claim" "db" {
  count = var.enable_postgres ? 1 : 0

  metadata {
    name      = "postgres-data"
    namespace = local.namespace
    labels    = local.postgres_labels
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
    name      = "postgres"
    namespace = local.namespace
    labels    = local.postgres_labels
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
        "app.kubernetes.io/name" = "postgres"
      }
    }

    template {
      metadata {
        labels = local.postgres_labels
      }

      spec {
        container {
          name  = "postgres"
          image = var.postgres_image

          port {
            name           = "postgres"
            container_port = 5432
          }

          env {
            name  = "POSTGRES_DB"
            value = var.db_name
          }

          env {
            name  = "POSTGRES_USER"
            value = var.db_username
          }

          env {
            name = "POSTGRES_PASSWORD"

            value_from {
              secret_key_ref {
                name = kubernetes_secret.db[0].metadata[0].name
                key  = "DB_PASS"
              }
            }
          }

          # A imagem oficial monta o volume em /var/lib/postgresql/data; apontar
          # PGDATA para um subdiretorio evita o erro de "diretorio nao vazio"
          # quando o volume tem lost+found.
          env {
            name  = "PGDATA"
            value = "/var/lib/postgresql/data/pgdata"
          }

          volume_mount {
            name       = "data"
            mount_path = "/var/lib/postgresql/data"
          }

          readiness_probe {
            exec {
              command = ["pg_isready", "-U", var.db_username, "-d", var.db_name]
            }

            initial_delay_seconds = 5
            period_seconds        = 5
          }

          liveness_probe {
            exec {
              command = ["pg_isready", "-U", var.db_username, "-d", var.db_name]
            }

            initial_delay_seconds = 30
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }

            limits = {
              cpu    = "1"
              memory = "512Mi"
            }
          }
        }

        volume {
          name = "data"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.db[0].metadata[0].name
          }
        }
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
    name      = "postgres"
    namespace = local.namespace
    labels    = local.postgres_labels
  }

  spec {
    type = "ClusterIP"

    selector = {
      "app.kubernetes.io/name" = "postgres"
    }

    port {
      name        = "postgres"
      port        = 5432
      target_port = 5432
    }
  }
}

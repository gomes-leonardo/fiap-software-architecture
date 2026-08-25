terraform {
  required_version = ">= 1.6.0"

  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.9"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State local, sem bloco de backend. Este ambiente descreve um cluster que
  # vive dentro do Docker da maquina de quem roda: state compartilhado nao faz
  # sentido, e um `kind delete cluster` fora do Terraform ja o invalida.
}

provider "kind" {}

# Os dois providers abaixo apontam para um arquivo e um contexto que so passam
# a existir depois que o kind_cluster e criado. Os valores sao estaticos (nada
# vem de atributo de recurso), entao o plan nao quebra; a conexao so e aberta
# quando um recurso Kubernetes e de fato aplicado, ja com o cluster de pe.
#
# Em maquina onde o Docker demora a subir o cluster, o caminho garantido e:
#   terraform apply -target=kind_cluster.this
#   terraform apply

provider "kubernetes" {
  config_path    = pathexpand(var.kubeconfig_path)
  config_context = "kind-${var.cluster_name}"
}

provider "helm" {
  kubernetes {
    config_path    = pathexpand(var.kubeconfig_path)
    config_context = "kind-${var.cluster_name}"
  }
}

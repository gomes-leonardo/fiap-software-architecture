#!/usr/bin/env bash
#
# Aplica os manifestos da stack SOAT na ordem de dependencia.
#
#   ./k8s/apply-all.sh
#
# A ordem importa: o StatefulSet do Postgres le usuario/senha do Secret e o
# nome do banco do ConfigMap, e o app so sobe util depois que o banco aceita
# conexoes. Aplicar tudo de uma vez com `kubectl apply -f k8s/` funciona no
# fim (o kubelet reconcilia), mas passa por um periodo de CrashLoopBackOff que
# parece falha e polui a demo.
#
# Pre-requisitos: kubectl configurado, imagem soat-tech-challenge:latest
# disponivel para os nodes e metrics-server instalado (para o HPA).
set -euo pipefail

NAMESPACE="soat"
MANIFEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_TIMEOUT="${DB_TIMEOUT:-300s}"
APP_TIMEOUT="${APP_TIMEOUT:-300s}"

info() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$1" >&2; exit 1; }

command -v kubectl >/dev/null 2>&1 || fail 'kubectl nao encontrado no PATH.'

kubectl cluster-info >/dev/null 2>&1 ||
  fail 'nenhum cluster acessivel. Verifique o contexto: kubectl config current-context'

info "Cluster: $(kubectl config current-context)"

# Num cluster Kind ou k3s recem-criado, o erro mais provavel nao e de
# manifesto: e a imagem local nunca ter sido carregada nos nodes. O Docker da
# maquina e o containerd do node sao registries diferentes, entao a imagem
# "existe" no `docker images` e mesmo assim falta no cluster. Com
# imagePullPolicy IfNotPresent o kubelet tenta buscar num registry remoto,
# nao acha, e o pod fica em ImagePullBackOff — que so aparece 300s depois,
# quando o rollout estoura. Checar aqui custa um segundo.
#
# Para pular (deploy a partir de registry, por exemplo): SKIP_IMAGE_CHECK=1
check_image_on_nodes() {
  [ "${SKIP_IMAGE_CHECK:-0}" = '1' ] && return 0

  local image policy context cluster missing=()
  image="$(awk '/^[[:space:]]*image:/ {print $2; exit}' "${MANIFEST_DIR}/app-deployment.yaml")"
  policy="$(awk '/^[[:space:]]*imagePullPolicy:/ {print $2; exit}' "${MANIFEST_DIR}/app-deployment.yaml")"

  # So faz sentido quando o kubelet nao vai buscar num registry.
  case "$policy" in IfNotPresent|Never) ;; *) return 0 ;; esac

  context="$(kubectl config current-context)"
  case "$context" in kind-*) cluster="${context#kind-}" ;; *) return 0 ;; esac

  command -v docker >/dev/null 2>&1 || return 0

  local node
  while read -r node; do
    [ -n "$node" ] || continue
    docker exec "$node" crictl images 2>/dev/null | grep -q "${image%%:*}" || missing+=("$node")
  done < <(kubectl get nodes -o name 2>/dev/null | sed 's|node/||')

  [ ${#missing[@]} -eq 0 ] && return 0

  fail "a imagem ${image} nao esta em ${#missing[@]} node(s): ${missing[*]}.
        O Docker da maquina e o containerd do node sao registries separados —
        buildar nao basta, e preciso carregar. Rode:

          docker build -t ${image} .
          kind load docker-image ${image} --name ${cluster}

        E aplique de novo. (Para ignorar esta checagem: SKIP_IMAGE_CHECK=1)"
}

check_image_on_nodes

info 'Namespace'
kubectl apply -f "${MANIFEST_DIR}/namespace.yaml"

# Secret e ConfigMap antes de qualquer workload: o pod do banco falha ao
# iniciar se as chaves que ele referencia ainda nao existirem.
info 'Configuracao (Secret + ConfigMap)'
kubectl apply -f "${MANIFEST_DIR}/app-secret.yaml"
kubectl apply -f "${MANIFEST_DIR}/app-configmap.yaml"
warn 'app-secret.yaml contem valores de EXEMPLO. Substitua antes de qualquer uso real.'

info 'Banco de dados (PostgreSQL)'
kubectl apply -f "${MANIFEST_DIR}/db-service.yaml"
kubectl apply -f "${MANIFEST_DIR}/db-deployment.yaml"

info "Aguardando o Postgres ficar pronto (timeout ${DB_TIMEOUT})"
# rollout status espera o pod ficar Ready, o que aqui significa pg_isready
# respondendo — nao apenas o container em execucao.
if ! kubectl rollout status "statefulset/soat-db" -n "${NAMESPACE}" --timeout="${DB_TIMEOUT}"; then
  warn 'o banco nao ficou pronto a tempo. Diagnostico:'
  kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=soat-db
  kubectl describe pod -n "${NAMESPACE}" -l app.kubernetes.io/name=soat-db | tail -30
  fail 'abortando antes de subir o app (ele so entraria em CrashLoopBackOff).'
fi

info 'Aplicacao (NestJS)'
kubectl apply -f "${MANIFEST_DIR}/app-service.yaml"
kubectl apply -f "${MANIFEST_DIR}/app-deployment.yaml"

info "Aguardando o app ficar pronto (timeout ${APP_TIMEOUT})"
if ! kubectl rollout status "deployment/soat-app" -n "${NAMESPACE}" --timeout="${APP_TIMEOUT}"; then
  warn 'o app nao ficou pronto a tempo. Causas mais comuns: imagem'
  warn 'soat-tech-challenge:latest ausente no node (ErrImagePull/ErrImageNeverPull)'
  warn 'ou migration falhando no boot. Logs:'
  kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=soat-app
  kubectl logs -n "${NAMESPACE}" -l app.kubernetes.io/name=soat-app --tail=50 --all-containers || true
  fail 'rollout do app nao concluiu.'
fi

# O HPA por ultimo: ele so tem o que escalar depois que o Deployment existe, e
# so tem metrica depois que os pods estao rodando.
info 'Autoscaler (HPA)'
kubectl apply -f "${MANIFEST_DIR}/app-hpa.yaml"

if ! kubectl get deployment metrics-server -n kube-system >/dev/null 2>&1; then
  warn 'metrics-server nao encontrado em kube-system: o HPA vai reportar'
  warn '<unknown>/70% e nunca escalar. Instale antes da demo — ver k8s/README.md.'
fi

info 'Stack aplicada'
kubectl get all -n "${NAMESPACE}"

cat <<EOF

Proximos passos:

  # acessar a API
  kubectl port-forward -n ${NAMESPACE} svc/soat-app 3000:3000
  curl -s localhost:3000/health

  # acompanhar o autoscaling
  kubectl get hpa -n ${NAMESPACE} -w
EOF

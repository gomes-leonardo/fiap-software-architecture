# Deploy em Kubernetes

Manifestos da stack do Tech Challenge Fase 2: a API NestJS e o PostgreSQL, isolados no namespace `soat`.

| Arquivo | Recurso |
| --- | --- |
| `namespace.yaml` | Namespace `soat` |
| `app-secret.yaml` | Secret `soat-app-secret` — `DB_USER`, `DB_PASS`, `JWT_SECRET`, `WEBHOOK_SECRET` |
| `app-configmap.yaml` | ConfigMap `soat-app-config` — `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `JWT_EXPIRES_IN` |
| `db-deployment.yaml` | StatefulSet `soat-db` (postgres:16-alpine) + PVC de 2Gi |
| `db-service.yaml` | Services `soat-db` (ClusterIP) e `soat-db-headless` |
| `app-deployment.yaml` | Deployment `soat-app`, container `app`, 2 replicas |
| `app-service.yaml` | Service `soat-app` (ClusterIP, porta 3000) |
| `app-hpa.yaml` | HPA `soat-app` — 2 a 10 pods, alvo de 70% de CPU |
| `apply-all.sh` | Aplica tudo na ordem de dependencia |

## Pre-requisitos

- **Cluster Kubernetes 1.23+** (kind, minikube, k3d ou EKS). A versao importa porque o HPA usa `autoscaling/v2`.
- **kubectl** apontando para o cluster certo — confira com `kubectl config current-context`.
- **metrics-server** instalado. Sem ele o HPA fica em `<unknown>/70%` e nunca escala:

  ```bash
  # minikube
  minikube addons enable metrics-server

  # kind ou cluster generico
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  # em kind/minikube o kubelet usa certificado self-signed; sem isto o metrics-server nao sobe:
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
  ```

- **Imagem `soat-tech-challenge:latest` disponivel para os nodes.** Os manifestos usam `imagePullPolicy: IfNotPresent`, ou seja, uma imagem local basta — mas ela precisa estar no node, nao so na sua maquina:

  ```bash
  docker build -t soat-tech-challenge:latest .

  # kind
  kind load docker-image soat-tech-challenge:latest
  # minikube
  minikube image load soat-tech-challenge:latest
  ```

## Antes de aplicar: os segredos

`app-secret.yaml` esta versionado com **valores de exemplo em base64** (`change-me-*`). base64 nao e criptografia — serve so para o Kubernetes transportar bytes.

Para qualquer uso que nao seja demonstracao local, crie o Secret fora do Git:

```bash
kubectl create secret generic soat-app-secret -n soat \
  --from-literal=DB_USER=postgres \
  --from-literal=DB_PASS="$(openssl rand -base64 32)" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=WEBHOOK_SECRET="$(openssl rand -base64 48)"
```

O mesmo Secret alimenta o app e o Postgres: as credenciais precisam ser iguais dos dois lados, e o banco so le `POSTGRES_PASSWORD` no primeiro boot (o `initdb`). Trocar a senha depois exige `ALTER USER` no banco ou apagar o PVC.

## Aplicar

```bash
./k8s/apply-all.sh
```

O script aplica namespace -> Secret -> ConfigMap -> banco, **espera o Postgres aceitar conexoes**, sobe o app, espera o rollout e so entao cria o HPA. Se algo falhar, ele imprime os pods e os logs relevantes antes de sair.

Manualmente, a mesma ordem:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/app-secret.yaml -f k8s/app-configmap.yaml
kubectl apply -f k8s/db-service.yaml -f k8s/db-deployment.yaml
kubectl rollout status statefulset/soat-db -n soat --timeout=300s
kubectl apply -f k8s/app-service.yaml -f k8s/app-deployment.yaml
kubectl rollout status deployment/soat-app -n soat --timeout=300s
kubectl apply -f k8s/app-hpa.yaml
```

## Verificar

```bash
kubectl get all -n soat
kubectl get pvc -n soat                 # o PVC do banco deve estar Bound
kubectl logs -n soat -l app.kubernetes.io/name=soat-app --tail=50
```

Acessar a API (o Service e ClusterIP; nao ha IP externo por padrao):

```bash
kubectl port-forward -n soat svc/soat-app 3000:3000

curl -s localhost:3000/health          # {"status":"ok","database":"connected"}
open http://localhost:3000/api-docs    # Swagger
```

Confirmar que o banco persiste um restart:

```bash
kubectl delete pod -n soat soat-db-0
kubectl rollout status statefulset/soat-db -n soat
# o pod volta com o mesmo PVC; os dados continuam la
```

## Demonstrar o HPA escalando

Em um terminal, acompanhe:

```bash
kubectl get hpa soat-app -n soat -w
# em outro terminal:
kubectl get pods -n soat -l app.kubernetes.io/name=soat-app -w
kubectl top pods -n soat
```

Em outro, gere carga de dentro do cluster (evita o gargalo do `port-forward`, que e single-threaded):

```bash
# com hey: 50 conexoes concorrentes por 5 minutos
kubectl run load-generator -n soat --rm -it --restart=Never \
  --image=williamyeh/hey -- -z 5m -c 50 http://soat-app:3000/health
```

Sem `hey` disponivel, um loop de `wget` em paralelo resolve:

```bash
kubectl run load-generator -n soat --rm -it --restart=Never --image=busybox:1.36 -- \
  sh -c 'for i in $(seq 1 20); do (while true; do wget -q -O- http://soat-app:3000/health >/dev/null; done) & done; wait'
```

`/health` foi escolhido por ser publico (sem JWT) e por fazer um `SELECT 1` — exercita o caminho HTTP e o pool de conexoes. Para uma demo mais realista, aponte a carga para `POST /auth/login` ou para a consulta publica de OS, que gastam mais CPU por requisicao e fazem o HPA reagir mais rapido.

O que esperar: `TARGETS` sobe acima de `70%`, `REPLICAS` cresce (ate 10) em ate ~1 minuto, e depois que a carga para os pods so voltam para 2 apos os 5 minutos de janela de estabilizacao de descida — comportamento intencional, configurado em `app-hpa.yaml`.

Se `TARGETS` mostrar `<unknown>/70%`, o metrics-server nao esta funcionando:

```bash
kubectl top pods -n soat            # tem que retornar numeros
kubectl describe hpa soat-app -n soat
```

## Limpar

```bash
kubectl delete namespace soat
```

Isso apaga tambem o PVC do banco e, com ele, os dados.

## Escolhas que valem explicar

- **StatefulSet para o Postgres, nao Deployment.** O PVC e `ReadWriteOnce`: um Deployment com rolling update travaria com o pod novo esperando um volume que o antigo ainda segura. O StatefulSet derruba antes de subir e amarra o PVC a identidade do pod.
- **Requests de CPU obrigatorias no app.** O HPA calcula utilizacao como `uso / requests.cpu`. Sem a request, nao ha percentual e o autoscaling nunca dispara.
- **`ClusterIP` no Service do app.** `LoadBalancer` fica `<pending>` para sempre em kind/minikube. Em cloud, trocar o `type` (ou colocar um Ingress na frente) e uma linha.
- **Banco dentro do cluster e de demonstracao.** Uma replica, sem backup e sem failover. Em producao o caminho e um Postgres gerenciado (RDS) — ver a issue de Terraform (#8).

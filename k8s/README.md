# Manifestos Kubernetes da aplicação

O app em Kustomize: uma base sem ambiente e um overlay por ambiente. O cluster, o gateway e o
banco **não** estão aqui. Cada um tem o próprio repositório e o próprio pipeline:

| Peça | Repositório | O que entrega para este app |
|---|---|---|
| Cluster Kind, namespaces, metrics-server | `soat-infra-k8s/cluster` | `soat-hml`, `soat-prd` |
| Kong e segredo JWT | `soat-infra-k8s/gateway` | Secret `soat-jwt` e a rota até `soat-app:3000` |
| Banco (Neon ou Postgres local) | `soat-infra-db` | Secret `soat-db` |
| Collector OpenTelemetry | `soat-infra-k8s/observability` | `otel-gateway.observability:4318` |

## Estrutura

```
k8s/
├── base/                 ConfigMap, Deployment, Service e HPA, sem namespace nem imagem
├── migrate/              Job soat-migrate (migrations do TypeORM)
└── overlays/
    ├── hml/              namespace soat-hml, HPA 1-3, Swagger ligado
    │   └── migrate/      o Job no namespace soat-hml
    └── prd/              namespace soat-prd, HPA 2-10, Swagger desligado
        └── migrate/
```

| Ambiente | Branch | Namespace | HPA | Gateway no host |
|---|---|---|---|---|
| hml | `develop` | `soat-hml` | 1 a 3 pods | `http://127.0.0.1:18081` |
| prd | `main` | `soat-prd` | 2 a 10 pods | `http://127.0.0.1:18080` |

O HPA mira 70% da `requests.cpu` (250m), ou seja, cerca de 175m por pod. O Deployment não declara
`replicas`, porque quem decide o número de pods é o HPA.

## Segredos

Nenhum valor secreto está versionado. O pod lê três Secrets, cada um com um dono:

| Secret | Chaves | Dono |
|---|---|---|
| `soat-db` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_SSL`, `DB_MIGRATION_HOST` | `soat-infra-db` |
| `soat-jwt` | `JWT_SECRET` | `soat-infra-k8s/gateway`. É o mesmo segredo que o Kong usa para conferir os tokens |
| `soat-app-secret` | `WEBHOOK_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD` | pipeline deste repositório, a partir dos secrets do Environment |

## Ordem de um deploy

1. O pipeline recria o `soat-app-secret` a partir dos secrets do Environment.
2. Roda o **Job `soat-migrate`** e espera `complete`. Se a migration falhar, o Deployment não é
   tocado e a versão anterior continua no ar.
3. Aplica o overlay com a imagem do commit (`ghcr.io/<repo>:sha-<curto>`) e espera o rollout.
   O `maxUnavailable: 0` mantém a capacidade durante a troca.
4. Faz o smoke de `/health` pelo Kong do ambiente.
5. Se algum passo falhar, coleta o diagnóstico e reverte o Deployment para a revisão anterior.

As migrations não rodam no boot (`DB_MIGRATIONS_ON_BOOT=false`). Com várias réplicas subindo
juntas, todas disputariam o mesmo DDL.

## Aplicar à mão

Com o cluster, o gateway e o banco já de pé:

```bash
kubectl config use-context kind-soat
kubectl create secret generic soat-app-secret -n soat-hml \
  --from-literal=WEBHOOK_SECRET=... --from-literal=ADMIN_BOOTSTRAP_PASSWORD=...

docker build -t soat-tech-challenge:dev .
kind load docker-image soat-tech-challenge:dev --name soat
for d in k8s/overlays/hml k8s/overlays/hml/migrate; do
  (cd $d && kustomize edit set image soat-tech-challenge=soat-tech-challenge:dev)
done

kubectl apply -k k8s/overlays/hml/migrate && kubectl wait --for=condition=complete job/soat-migrate -n soat-hml --timeout=300s
kubectl apply -k k8s/overlays/hml
curl -s http://127.0.0.1:18081/health
```

Desfaça o `kustomize edit` antes de commitar: a imagem do overlay versionado fica com o nome lógico.

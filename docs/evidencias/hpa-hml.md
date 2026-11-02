# Evidência do HPA em hml

Medição de 2026-11-01 no cluster Kind `soat`, namespace `soat-hml`. Em hml o HPA vai de 1 a 3 pods e mira 70% da `requests.cpu` (250m). O porquê de ser Kind e não EKS está na [RFC-001](../rfc/RFC-001-nuvem-e-custo.md). As regras de subida e descida estão na [ADR-002](../adr/ADR-002-hpa.md).

## Resultado

| Momento | O que aconteceu |
|---|---|
| 23:18:17 | Começa a carga: k6 com 40 usuários virtuais por 3 minutos |
| 23:18:49 | CPU em 112% do alvo, com 1 pod |
| 23:19:02 | O HPA sobe para 2 pods |
| 23:19:32 | O HPA sobe para 3 pods, o teto de hml. A CPU estabiliza perto de 135% |
| 23:21:20 | A carga termina |
| 23:22:05 | CPU em 10%, já abaixo do alvo |
| 23:27:08 | O HPA volta a 1 pod, cerca de 5 minutos depois (janela de 300s) |

O k6 fez 208.877 requisições, cerca de 1.160 por segundo, e **nenhuma falhou**: `http_req_failed` ficou em 0,00%. O p95 foi de 88 ms e o máximo de 838 ms. Os pods novos chegaram a `Running` e `Ready`, e nenhum ficou `Pending`. Os eventos do HPA confirmam cada mudança:

```
Normal  SuccessfulRescale  New size: 2; reason: cpu resource utilization (percentage of request) above target
Normal  SuccessfulRescale  New size: 3; reason: cpu resource utilization (percentage of request) above target
Normal  SuccessfulRescale  New size: 1; reason: All metrics below target
```

## Como repetir

A carga roda num pod dentro do cluster e chama o Service da app direto. Assim o Kong, que tem 256Mi de limite, não vira o gargalo da medição. O endpoint é o `/api-docs-json`: ele não depende do banco e gasta CPU para serializar o spec. Ele só existe em hml, onde o Swagger está ligado.

```bash
NS=soat-hml
kubectl -n $NS create configmap k6-load --from-file=load.js=scripts/load/hpa-hml.js

# Em outro terminal, acompanhe a escalada
kubectl -n $NS get hpa soat-app -w

# O ResourceQuota do namespace exige requests e limits em todo pod
kubectl -n $NS run k6-load --image=grafana/k6:0.54.0 --restart=Never --overrides='{"spec":{
  "volumes":[{"name":"s","configMap":{"name":"k6-load"}}],
  "containers":[{"name":"k6-load","image":"grafana/k6:0.54.0","args":["run","--quiet","/s/load.js"],
    "resources":{"requests":{"cpu":"100m","memory":"64Mi"},"limits":{"cpu":"1","memory":"256Mi"}},
    "volumeMounts":[{"name":"s","mountPath":"/s"}]}]}}'

# Quando o pod terminar: resumo do k6 e eventos do HPA
kubectl -n $NS logs k6-load
kubectl -n $NS describe hpa soat-app | sed -n '/Events/,$p'

kubectl -n $NS delete pod k6-load
kubectl -n $NS delete configmap k6-load
```

Em prd o HPA vai de 2 a 10 pods. Com o Swagger desligado lá, a carga precisa de outro endpoint, por exemplo `/health`, que consulta o banco.

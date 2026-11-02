# RFC-004: Ferramenta de observabilidade

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-29 |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57), [#60](https://github.com/gomes-leonardo/fiap-software-architecture/issues/60), [#62](https://github.com/gomes-leonardo/fiap-software-architecture/issues/62), [#64](https://github.com/gomes-leonardo/fiap-software-architecture/issues/64) |
| Relacionadas | [RFC-001](RFC-001-nuvem-e-custo.md), [componentes](../arquitetura/componentes.md) |

## Contexto

O enunciado exige integração com **Datadog ou New Relic**, à escolha, com:

- monitoramento de latência, consumo de recursos dos pods e healthchecks;
- dashboards de volume diário de OS, tempo médio de execução por status e erros de integração;
- logs estruturados com correlação;
- alertas de falha no processamento de OS.

A aplicação já é instrumentada com o SDK do **OpenTelemetry**: traces por OTLP, métricas no formato
Prometheus em `/metrics` (porta 9464) e logs JSON pelo `pino` com `trace_id` e `span_id`. No
`docker-compose.yml` esses sinais vão para Jaeger, Prometheus e Grafana. Nenhum desses é Datadog
nem New Relic.

A restrição de custo zero da [RFC-001](RFC-001-nuvem-e-custo.md) vale aqui também.

## Alternativas consideradas

| Critério | Datadog | New Relic |
|---|---|---|
| Plano gratuito | Monitoramento de infraestrutura para poucos hosts, retenção curta de métricas. APM e logs só nos planos pagos ou no trial de 14 dias | **100 GB de ingestão por mês**, com APM, logs, métricas, dashboards e alertas no mesmo plano |
| Entrada por OpenTelemetry | Pelo Datadog Agent ou pelo exporter `datadog` no Collector, com mapeamento próprio de atributos | **Endpoint OTLP nativo** (`https://otlp.nr-data.net`), autenticado por header `api-key`. O Collector usa o exporter `otlphttp` padrão |
| Dashboards e alertas como código | provider Terraform `datadog/datadog` | provider Terraform `newrelic/newrelic`: `newrelic_one_dashboard`, condições NRQL, destino webhook e workflow |
| Linguagem de consulta | própria por produto (métricas, logs, APM) | NRQL, uma linguagem para métricas, eventos e logs |
| Custo da entrega | o trial expira antes da gravação e da avaliação | zero, sem prazo |

| Alternativa | Por que foi descartada |
|---|---|
| **Datadog** | O plano gratuito não cobre APM nem logs, e o enunciado pede os dois. O trial de 14 dias acabaria antes da avaliação |
| **Prometheus, Grafana e Jaeger** (o que o compose já sobe) | Não atende ao enunciado, que pede uma das duas ferramentas. Continua como stack de desenvolvimento local |
| **AWS CloudWatch** | Não atende ao enunciado. E as métricas customizadas e o Container Insights cobram |
| **New Relic** | **Escolhida** |

## Decisão

**New Relic**, plano gratuito, alimentado por **OpenTelemetry Collector** no namespace
`observability` do Kind (repositório `soat-infra-k8s/observability`):

- **`otel-agent`** (DaemonSet): lê os logs dos containers e as métricas do kubelet de cada nó.
- **`otel-gateway`** (Deployment): recebe OTLP da aplicação, raspa o `/metrics` dos pods anotados
  com `prometheus.io/scrape`, mede o `/health` pelo Kong de cada ambiente (`httpcheck`), lê o
  estado do cluster (`k8s_cluster`), converte cumulativo em delta e exporta para
  `otlp.nr-data.net` com a license key do Secret `nr-license`.

Dashboards e alertas são **Terraform** (`soat-infra-k8s/newrelic`), um conjunto por ambiente. O
dashboard `SOAT <env> - oficina` tem duas páginas:

- **Negócio**: volume diário de OS, tempo médio por status, OS paradas, erros de integração;
- **Operação**: latência p50, p95 e p99 por rota, CPU e memória por pod, uptime pelo Kong e réplicas
  do HPA.

Alertas e entrega:

- **5 condições NRQL** com fechamento automático: API indisponível, erro interno em OS, webhook
  recusado, transição recusada repetida e OS parada. Limiares em `soat-infra-k8s/newrelic/ALERTAS.md`;
- **workflow** que envia `ACTIVATED` e `CLOSED` por webhook à Lambda `soat-<env>-notifier`, que
  publica no SNS e chega por e-mail.

A aplicação não depende do New Relic: ela fala OTLP e Prometheus com o Collector. Até a ativação
(`NEW_RELIC_ENABLED=false`), o mesmo Collector manda traces para um Jaeger no cluster e métricas
para um endpoint Prometheus local.

## Consequências

- **Instrumentação neutra.** Nenhuma dependência do New Relic no `package.json`. Trocar de
  ferramenta muda o exporter do Collector, não a aplicação.
- **Painéis e alertas presos ao NRQL.** Essa parte seria reescrita numa troca de ferramenta.
- **Sem histórico anterior.** Nada era medido antes desta fase. O volume diário dos últimos 7 dias
  vem de uma métrica calculada no banco (`soat_service_orders_created_by_day{days_ago="0".."6"}`),
  não de 7 dias de dados acumulados no New Relic. Os limiares dos alertas são conservadores e
  serão calibrados depois de uma semana de produção.
- **Nomes de métrica.** O exporter Prometheus acrescenta `_total` aos contadores, e o receiver pode
  removê-lo. O nome real é conferido na ativação, antes de dar o alerta como verificado.
- **Cota.** 100 GB por mês sobram para dois ambientes de demonstração. Os logs são o maior volume
  e o primeiro lugar a olhar se a cota apertar.

## O que muda se revertermos

Para Datadog: o exporter do `otel-gateway` vira `datadog` com a chave da conta, e os arquivos de
`soat-infra-k8s/newrelic` são reescritos com o provider `datadog/datadog` (dashboards, monitors e
webhook para o mesmo notifier). O formato do webhook muda, então o `format.ts` do notifier também.
A aplicação não muda.

Para a stack local: `NEW_RELIC_ENABLED=false` volta a mandar tudo para Jaeger e Prometheus no
cluster, e os alertas por e-mail deixam de existir.

# ADR-001: Comunicação síncrona por HTTP entre os componentes

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-30 |
| Substitui | — |
| Substituída por | — |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57) |

## Contexto

A Fase 3 espalha o sistema por vários componentes: Kong, aplicação, Lambda de autenticação,
banco, Collector, New Relic, Lambda de notificação e SNS. É preciso decidir como eles conversam e
se algum fluxo justifica fila ou evento.

Os fluxos que existem hoje:

| Fluxo | Quem espera a resposta |
|---|---|
| Cliente pede token por CPF | o cliente, para seguir |
| Admin abre OS, orça, muda status | o admin, para ver o resultado e o erro |
| Parceiro aprova orçamento ou muda status por webhook | o parceiro, que precisa saber se foi aceito (200) ou recusado (400, 401) |
| Aplicação envia telemetria | ninguém: o SDK exporta em lote, fora da requisição |
| New Relic avisa um alerta | o New Relic, que só precisa do 202 do notifier |

## Decisão

**Toda comunicação entre componentes é síncrona, requisição e resposta por HTTP, com JSON.** Não
há broker de mensagens.

| De | Para | Como |
|---|---|---|
| Clientes e parceiros | Kong | HTTP |
| Kong | aplicação | HTTP no cluster (`soat-app.<ns>.svc.cluster.local:3000`) |
| Kong | Lambda `auth-cpf` | HTTPS, Function URL |
| Aplicação, Job e Lambda | Neon | protocolo PostgreSQL, TLS |
| Aplicação | `otel-gateway` | OTLP/HTTP, exportação em lote |
| `otel-gateway` | New Relic | OTLP/HTTP |
| New Relic | Lambda `notifier` | webhook HTTPS com Bearer |

O único ponto assíncrono é deliberado e pequeno: o notifier publica no **SNS**, que entrega o
e-mail. O SNS é o meio de fan-out para quem assina o tópico, não um barramento entre serviços.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Fila entre gateway e aplicação para abrir OS (SQS, RabbitMQ)** | A abertura responde com o id da OS, o orçamento criado e os avisos de estoque. Numa fila, o admin receberia um 202 e teria de consultar depois. Nenhum fluxo hoje sofre com a latência síncrona |
| **Eventos de domínio para mudanças de status (Kafka, EventBridge)** | Não há consumidor. As métricas de negócio são lidas do banco, e os alertas, da telemetria. Um barramento sem consumidor é custo sem retorno |
| **RabbitMQ ou Kafka no cluster** | Memória do Mac, que já hospeda dois ambientes e o Collector. E mais uma peça para operar |
| **gRPC entre Kong e aplicação** | Os clientes já falam HTTP e JSON. O ganho de desempenho não compensa perder Swagger, Postman e `curl` |

## Consequências

- **Falhas se propagam na hora.** Se o Neon estiver acordando, a requisição espera. Se a aplicação
  estiver fora, o Kong responde erro. A readiness tira do Service o pod sem banco, e o alerta de API
  indisponível avisa.
- **Quem chama é quem refaz.** Um webhook de parceiro que falhar não é guardado para nova
  tentativa: o parceiro recebe o erro e decide. Um e-mail de alerta que o notifier não conseguir
  publicar se perde: o incidente continua aberto no New Relic.
- **Sem garantia de exatamente uma vez.** Repetir uma aprovação de orçamento é seguro, porque só um
  orçamento `PENDENTE` aceita decisão (o segundo recebe 400). Repetir uma abertura de OS cria duas.
- **Rastreamento simples.** Um trace cobre a requisição dentro da aplicação, da rota ao banco, sem
  contexto propagado por mensagem.

## O que muda se revertermos

Se um fluxo passar a precisar de assincronia (por exemplo, avisar o cliente final a cada mudança de
status), o caminho é uma fila Always Free (SQS) com padrão outbox: a aplicação grava o evento numa
tabela na mesma transação da mudança, e um publicador o envia. Os contratos HTTP atuais continuam
para o que é síncrono. Esta ADR passaria a ter uma substituta que define o que vai por fila e o que
fica por HTTP.

# RFCs

Decisões técnicas da Fase 3 que tiveram alternativas pesadas. Cada RFC registra o contexto, as
alternativas consideradas e por que foram descartadas, a decisão, as consequências e o que mudaria
se ela fosse revertida.

| RFC | Decisão | Status | Data |
|---|---|---|---|
| [RFC-001](RFC-001-nuvem-e-custo.md) | Nuvem e custo: Kubernetes no Kind, Lambda e SNS no Always Free da AWS, Neon e New Relic gratuitos. EKS e RDS ficam como referência não aplicada | Aceita | 2026-10-29 |
| [RFC-002](RFC-002-banco-de-dados.md) | Banco gerenciado: Neon PostgreSQL 16, um projeto por ambiente, pooler para a aplicação e host direto para migrations | Aceita | 2026-10-29 |
| [RFC-003](RFC-003-autenticacao.md) | Autenticação: Lambda `auth-cpf` emite JWT de cliente; Kong e aplicação validam; papel separado por `role` e `iss` | Aceita | 2026-10-29 |
| [RFC-004](RFC-004-observabilidade.md) | Observabilidade: New Relic, e não Datadog, alimentado por OpenTelemetry Collector; dashboards e alertas em Terraform | Aceita | 2026-10-29 |
| [RFC-005](RFC-005-api-gateway.md) | API Gateway: Kong DB-less no cluster, um por ambiente, deny-by-default | Aceita | 2026-10-29 |

Status possíveis: **Proposta**, **Aceita**, **Rejeitada**, **Substituída por RFC-NNN**. Uma RFC
aceita não é editada para mudar a decisão. Se a decisão mudar, uma nova RFC a substitui, e a antiga
ganha o status de substituída.

As decisões arquiteturais permanentes que o projeto passa a seguir estão nas [ADRs](../adr/README.md).

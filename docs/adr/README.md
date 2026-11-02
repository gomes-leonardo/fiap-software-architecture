# ADRs

Decisões arquiteturais que o projeto passa a seguir. Cada ADR registra o contexto, a decisão, as
alternativas descartadas, as consequências e o que mudaria se ela fosse revertida. Quando uma
decisão troca outra, o campo **Substitui** diz qual.

| ADR | Decisão | Status | Data | Substitui |
|---|---|---|---|---|
| [ADR-001](ADR-001-comunicacao-sincrona-http.md) | Comunicação síncrona por HTTP entre todos os componentes; SNS só para entregar e-mail | Aceita | 2026-10-30 | — |
| [ADR-002](ADR-002-hpa.md) | HPA por CPU (70% de 250m): hml 1 a 3 pods, prd 2 a 10 | Aceita | 2026-10-30 | HPA único de 2 a 10 no namespace `soat` (Fase 2) |
| [ADR-003](ADR-003-migrations-em-job.md) | Migrations no Job `soat-migrate`, antes do rollout, pelo host direto do banco | Aceita | 2026-10-30 | migrations no boot da aplicação (Fase 2) |
| [ADR-004](ADR-004-ambientes-hml-prd.md) | `develop` → `hml` → `soat-hml`; `main` → `prd` → `soat-prd`; mesmo cluster, Environments presos às branches | Aceita | 2026-10-30 | ambiente único `soat` com Environment `production` (Fase 2) |
| [ADR-005](ADR-005-segredos-terraform-ssm.md) | Segredos gerados pelo Terraform do dono, entregues por Secret do Kubernetes e SSM; CI na AWS por OIDC | Aceita | 2026-10-30 | `k8s/app-secret.yaml` versionado, `KUBECONFIG_BASE64` e secrets do repositório (Fase 2) |

Status possíveis: **Proposta**, **Aceita**, **Obsoleta**, **Substituída por ADR-NNN**. Uma ADR
aceita não é reescrita para mudar a decisão: uma nova ADR a substitui.

As decisões técnicas com alternativas pesadas (nuvem, banco, autenticação, observabilidade e
gateway) estão nas [RFCs](../rfc/README.md).

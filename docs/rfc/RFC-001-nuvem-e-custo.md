# RFC-001: Nuvem e custo

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-29 |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57) |
| Relacionadas | [RFC-002](RFC-002-banco-de-dados.md), [RFC-005](RFC-005-api-gateway.md), [ADR-002](../adr/ADR-002-hpa.md) |

## Contexto

A Fase 3 pede, em nuvem de livre escolha: cluster Kubernetes, banco gerenciado, função serverless
de autenticação, API Gateway, monitoramento e deploy automático, tudo por Terraform.

A restrição que decide esta RFC é o custo. A conta AWS do projeto está no plano pago, sem créditos
e sem o free tier de 12 meses. Só vale o que é **Always Free**: Lambda (1 milhão de requisições por
mês), SNS (1.000 e-mails por mês), CloudWatch Logs (5 GB) e parâmetros Standard do SSM. EKS, RDS,
EC2, NAT Gateway, ALB, Secrets Manager e API Gateway cobram desde o primeiro minuto.

A Fase 2 já tinha o Terraform completo de EKS e RDS. A estimativa do próprio projeto, em
`us-east-1` e on-demand, era esta para o perfil `dev`:

| Item | ~US$/mês |
|---|---|
| Control plane do EKS (US$ 0,10/h) | 73 |
| 2 nós `t3.medium` | 61 |
| NAT Gateway | 33 |
| RDS `db.t3.micro` single-AZ | 13 |
| Storage, Secrets Manager, CloudWatch | 7 a 12 |
| **Total** | **~185 a 195** |

O control plane cobra por hora ligado, mesmo sem nenhum pod. Ninguém pagou essa conta: o RDS da
Fase 2 nunca recebeu tráfego, e o cluster foi demonstrado no Kind.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **AWS completa: EKS, RDS, API Gateway e NAT** | Atende o enunciado ao pé da letra, mas custa cerca de US$ 185 a 195 por mês só em `dev`, e a entrega é a custo zero. Mesmo ligando só nos dias de demonstração, o control plane e a NAT cobram por hora |
| **Kubernetes leve (k3s) numa EC2** | Sem free tier de 12 meses, a instância cobra por hora. E troca o custo do control plane pelo trabalho de operar o próprio cluster |
| **Outro provedor gerenciado (GKE, AKS)** | O control plane pode ter camada gratuita, mas os nós são VMs cobradas por hora. Mudar de provedor também jogaria fora o OIDC, o state no S3 e a Lambda, que já são AWS |
| **Tudo local, sem nuvem nenhuma** | Custo zero, mas não há banco gerenciado nem função serverless de verdade, e o enunciado pede os dois |
| **Híbrido: Kubernetes local, serviços gerenciados gratuitos** | **Escolhida** |

## Decisão

Kubernetes no **Kind**, no Mac do projeto, e só serviços gerenciados que não cobram:

| Peça | Onde roda | Custo |
|---|---|---|
| Cluster Kubernetes | Kind `soat` no Docker do Mac, criado por Terraform (`soat-infra-k8s/cluster`) | zero |
| Deploy | GitHub Actions: jobs hospedados para teste e build, runner self-hosted no Mac para o deploy | zero em repositório público |
| Imagens | GHCR, pacote público | zero |
| Banco gerenciado | Neon, plano gratuito, um projeto por ambiente ([RFC-002](RFC-002-banco-de-dados.md)) | zero |
| Autenticação e notificação | AWS Lambda com Function URL, SNS, SSM Standard, CloudWatch Logs com retenção de 7 dias | Always Free |
| Gateway | Kong DB-less dentro do Kind ([RFC-005](RFC-005-api-gateway.md)) | zero |
| Monitoramento | New Relic, plano gratuito ([RFC-004](RFC-004-observabilidade.md)) | zero |
| State do Terraform | bucket S3 `tfstate-backend-fiap-leo`, que já existia | frações de centavo |

O desenho em AWS paga continua versionado, **sem nunca ser aplicado**:

- `soat-infra-k8s/reference/aws-eks/`: VPC com subnets públicas e privadas, NAT, EKS e namespaces;
- `soat-infra-db/reference/aws-rds/`: RDS PostgreSQL 16 com credencial no Secrets Manager.

O CI desses repositórios roda `terraform validate` nos dois diretórios, para que não apodreçam, e
nenhum job de deploy aponta para eles.

## Consequências

**O que se ganha**

- A entrega inteira custa zero, e o único gasto possível (o state no S3) é de frações de centavo.
- Os manifestos da aplicação são os mesmos que rodariam num EKS. Cluster, gateway e banco são
  trocáveis por baixo, porque a aplicação só conhece os Secrets `soat-db` e `soat-jwt`.

**O que se perde, dito com clareza**

- **Não há URL pública da API.** Os gateways respondem em `http://127.0.0.1:18080` (prd) e
  `http://127.0.0.1:18081` (hml), na máquina do projeto. De fora, o avaliador enxerga os runs do
  GitHub Actions, as Function URLs da Lambda, o console do Neon e os painéis do New Relic.
- **A disponibilidade depende do Mac ligado.** Com o Mac desligado não há deploy (o runner some) e o
  alerta de API indisponível abre.
- **O HPA escala pods, não nós.** O Kind tem um worker fixo. O limite é a ResourceQuota do
  namespace e a CPU do Mac ([ADR-002](../adr/ADR-002-hpa.md)).
- **Runner self-hosted em repositório público é um risco.** Só jobs de push em `develop` e `main`
  usam o runner, nunca pull request, e workflows de fork exigem aprovação.
- **Latência até o banco.** O app no Mac fala com o Neon em `aws-sa-east-1` pela internet, com TLS.

## O que muda se revertermos

Voltar para a AWS paga é aplicar o que já está em `reference/`:

1. `terraform apply` em `soat-infra-k8s/reference/aws-eks/` (VPC, NAT, EKS) e o metrics-server.
2. Trocar `module "neon"` por `reference/aws-rds/` no `env/` do `soat-infra-db`, escrevendo o mesmo
   Secret `soat-db`. A Lambda precisaria alcançar o RDS (VPC com saída para o SSM, ou RDS público).
3. O job de deploy sai do runner self-hosted e vai para um runner hospedado, com OIDC na AWS e
   `aws eks update-kubeconfig` no lugar do contexto `kind-soat`.
4. O Kong passa a ser exposto por um Service `LoadBalancer`, ou é trocado pelo API Gateway da AWS
   ([RFC-005](RFC-005-api-gateway.md)).

A aplicação, os overlays Kustomize e o Job de migration não mudam. A conta passa a ser de cerca de
US$ 185 a 195 por mês em `dev`.

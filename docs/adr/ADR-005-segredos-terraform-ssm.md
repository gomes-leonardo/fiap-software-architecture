# ADR-005: Segredos gerados pelo Terraform e distribuídos por Secret e SSM

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-30 |
| Substitui | o `k8s/app-secret.yaml` versionado com valores de exemplo, o `KUBECONFIG_BASE64` e os secrets `DB_PASS` e `JWT_SECRET` no repositório (Fase 2) |
| Substituída por | — |
| Issue | [#54](https://github.com/gomes-leonardo/fiap-software-architecture/issues/54), [#61](https://github.com/gomes-leonardo/fiap-software-architecture/issues/61) |

## Contexto

Na Fase 2 os segredos tinham três origens misturadas: um `k8s/app-secret.yaml` versionado com
valores `change-me-*`, secrets do repositório que o pipeline aplicava por cima (`DB_PASS`,
`JWT_SECRET`, `WEBHOOK_SECRET`) e o kubeconfig do cluster em base64 (`KUBECONFIG_BASE64`). O RDS da
referência guardava a senha no Secrets Manager.

Na Fase 3 há mais consumidores e mais lugares: a aplicação e o Kong no cluster, as Lambdas na AWS, o
New Relic chamando o notifier. O mesmo `JWT_SECRET` precisa chegar a três deles. E o Secrets
Manager cobra por segredo por mês ([RFC-001](../rfc/RFC-001-nuvem-e-custo.md)).

## Decisão

**Cada segredo tem um dono, que o gera e o entrega.** Ninguém digita um segredo que uma máquina
possa gerar.

| Segredo | Gerado por | Entregue em | Lido por |
|---|---|---|---|
| `JWT_SECRET` | `random_password` em `soat-infra-k8s/gateway` | Secret `soat-jwt`, SSM `/soat/<env>/jwt/secret`, consumers do Kong | aplicação, Lambda `auth-cpf`, Kong |
| Credenciais do banco | Neon (modo `neon`) ou `random_password` (modo local), em `soat-infra-db` | Secret `soat-db`; no modo `neon`, também SSM `/soat/<env>/db/url` | aplicação, Job de migration, Lambda `auth-cpf` |
| Segredo de origem do `/auth/cpf` | `random_password` em `soat-auth-lambda` | SSM `/soat/<env>/auth/origin-secret` | Lambda `auth-cpf`, Terraform do gateway (que o põe no Kong) |
| Segredo do webhook do notifier | `random_password` em `soat-auth-lambda` | SSM `/soat/<env>/notifier/webhook-secret` | Lambda `notifier`, Terraform do New Relic |
| `WEBHOOK_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD` | pessoa, uma vez | secrets dos Environments `hml` e `prd` deste repositório | pipeline, que recria o Secret `soat-app-secret` |
| Chaves de Neon e New Relic | console de cada serviço | secrets dos repositórios de infraestrutura | Terraform e Collector |

Regras:

- **No cluster, Secret do Kubernetes.** O pod lê três Secrets com donos diferentes
  (`soat-db`, `soat-jwt`, `soat-app-secret`). Nenhum valor secreto está versionado.
- **Na AWS, SSM Parameter Store**, `SecureString` com a chave gerenciada `aws/ssm`, tier Standard.
  As Lambdas leem em runtime e guardam em memória. As variáveis de ambiente das funções têm só os
  **nomes** dos parâmetros.
- **Acesso à AWS pelo CI por OIDC**, papel `gha-soat-deployer`, sem chave de longa duração. O papel
  só cria funções com o permissions boundary `soat-function-boundary`: logs, leitura de `/soat/*` e
  publicação em tópicos `soat-*`.
- **Sem kubeconfig em secret.** O deploy roda no runner self-hosted da mesma máquina do cluster e
  usa o contexto `kind-soat` local.
- **State do Terraform é segredo.** Fica no bucket S3 `tfstate-backend-fiap-leo`, criptografado, com
  lock por arquivo. O state do cluster Kind fica em disco local do runner (`~/.soat-tfstate/`).
- **Valor de segredo nunca na linha de comando.** O pipeline passa os valores por arquivo
  temporário, apagado no fim do passo.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **AWS Secrets Manager** | US$ 0,40 por segredo por mês, fora do Always Free. Rotação automática não é necessária nesta fase |
| **Sealed Secrets ou SOPS** | Segredo cifrado no Git, mas a chave de decifrar precisa ser guardada e girada, e a Lambda não lê um Secret do cluster |
| **External Secrets Operator lendo o SSM** | Um operador a mais no cluster, e credencial da AWS dentro do Kind |
| **HashiCorp Vault** | Pesado demais para dois ambientes num Mac |
| **Continuar com secrets do repositório** | Cada consumidor novo seria mais um secret digitado à mão, e o mesmo `JWT_SECRET` em três lugares sairia de sincronia |

## Consequências

- **Um segredo, uma fonte.** O `JWT_SECRET` da aplicação, da Lambda e do Kong é o mesmo valor, saído
  do mesmo `random_password`. Não há como os três divergirem.
- **O state contém os segredos.** Quem lê o state lê os valores. O bucket é criptografado e o acesso
  é pelo papel OIDC.
- **Trocar um Secret não reinicia os pods.** Depois de girar um segredo, ou de ativar o Neon, é
  preciso um novo rollout para os pods lerem o valor novo.
- **Girar um segredo** é forçar a recriação do `random_password` correspondente e aplicar. Os
  consumidores no cluster precisam de rollout. As Lambdas leem o valor novo no próximo container
  frio.
- **O que uma pessoa ainda cadastra** são quatro coisas: `WEBHOOK_SECRET`,
  `ADMIN_BOOTSTRAP_PASSWORD`, a chave do Neon e as chaves do New Relic. As três últimas não podem ser
  geradas pelo Terraform, porque vêm de contas externas.

## O que muda se revertermos

Para o Secrets Manager: os `aws_ssm_parameter` viram `aws_secretsmanager_secret`, as Lambdas trocam
a chamada de leitura e o papel da função ganha `secretsmanager:GetSecretValue`. Os Secrets do
cluster continuam iguais. Custo de US$ 0,40 por segredo por mês, por ambiente.

Para segredos digitados à mão: cada valor da tabela vira um `gh secret set`, e o pipeline de cada
repositório passa a criar os Secrets e os parâmetros a partir deles. O `JWT_SECRET` precisaria ser
cadastrado igual em dois repositórios.

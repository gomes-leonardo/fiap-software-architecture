# ADR-004: Ambientes hml e prd por branch e namespace

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-30 |
| Substitui | o ambiente único da Fase 2: namespace `soat`, deploy só da `main`, Environment `production` |
| Substituída por | — |
| Issue | [#53](https://github.com/gomes-leonardo/fiap-software-architecture/issues/53), [#54](https://github.com/gomes-leonardo/fiap-software-architecture/issues/54) |

## Contexto

Na Fase 2 havia um ambiente: o push na `main` publicava a imagem e aplicava os manifestos no
namespace `soat`, pelo Environment `production`, com o kubeconfig num secret do repositório. Toda
mudança ia direto para o único ambiente que existia.

A Fase 3 pede deploy automático em homologação e produção, nos quatro repositórios, com `main`
protegida.

## Decisão

**Uma branch, um ambiente, um namespace**, com o mesmo nome em todos os repositórios:

| Branch | GitHub Environment | Namespace | Gateway no host | HPA | Swagger |
|---|---|---|---|---|---|
| `develop` | `hml` | `soat-hml` | `127.0.0.1:18081` | 1 a 3 | ligado |
| `main` | `prd` | `soat-prd` | `127.0.0.1:18080` | 2 a 10 | desligado |

- **Os dois ambientes vivem no mesmo cluster Kind**, separados por namespace. Cada namespace tem
  ResourceQuota (prd: 4 CPU e 4 Gi de requests, 30 pods; hml: metade da CPU e da memória, 15 pods)
  e LimitRange.
- **Tudo que é por ambiente tem o nome do ambiente:** o Kong de cada namespace, o projeto Neon
  (`soat-hml`, `soat-prd`), as Lambdas (`soat-<env>-auth-cpf`, `soat-<env>-notifier`), o prefixo do
  SSM (`/soat/<env>/...`), o state do Terraform (`<repo>/<root>/<env>/terraform.tfstate`) e a
  política de alertas do New Relic.
- **Os Environments `hml` e `prd` ficam presos às branches** `develop` e `main`. Um job de outra
  branch não recebe os secrets do ambiente, e a confiança OIDC na AWS é por Environment
  (`repo:<owner>/<repo>:environment:hml|prd`). Pull request nunca chega à AWS nem ao cluster.
- **Sem aprovação manual no deploy.** A `main` já exige pull request com os checks verdes. Um
  segundo portão no Environment seria a mesma pessoa aprovando duas vezes.
- **Promoção é um pull request de `develop` para `main`.** A imagem de prd é reconstruída do commit
  da `main`, com tag `sha-<commit>`.
- **Os manifestos são uma base e dois overlays** Kustomize (`k8s/base`, `k8s/overlays/hml`,
  `k8s/overlays/prd`). O overlay muda o namespace, os limites do HPA, `OTEL_SERVICE_NAME`,
  `OTEL_RESOURCE_ATTRIBUTES` (`deployment.environment=<env>`), `SWAGGER_ENABLED` e o rótulo
  `app.kubernetes.io/instance`. O resto é igual nos dois.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Um cluster por ambiente** | Isolamento total, mas dois Kind no mesmo Mac dobram o control plane e a memória. Na nuvem, dobram a conta ([RFC-001](../rfc/RFC-001-nuvem-e-custo.md)) |
| **Um namespace, ambientes por label ou sufixo** | Secrets, quotas e o gateway se misturariam. Um erro de seletor faria hml atender prd |
| **Só prd, como na Fase 2** | O enunciado pede os dois, e não haveria onde validar uma versão antes de produção |
| **Aprovação manual no Environment `prd`** | Ver acima: o portão real é o pull request protegido na `main` |
| **Promover a mesma imagem de hml para prd** | Mais rigoroso, mas exige retag entre branches e rastrear qual digest passou em hml. O build é determinístico pelo commit, e o merge de `develop` em `main` é o que foi testado |

## Consequências

- **Isolamento lógico, não físico.** hml e prd dividem o mesmo nó e a mesma CPU. Uma carga pesada em
  hml pode atrasar prd. A ResourceQuota limita o quanto hml reserva, não o quanto ele usa num pico.
- **Cada repositório repete a convenção.** O mesmo par branch e Environment está nos quatro, e o
  pipeline de infraestrutura precisa ter rodado antes do da aplicação: o deploy falha se os Secrets
  `soat-db` e `soat-jwt` não existirem no namespace.
- **Concorrência por branch.** O `concurrency` por branch permitiria um deploy de hml e um de prd ao
  mesmo tempo, mas há um único runner `soat-kind`, então na prática eles entram em fila. Dois do
  mesmo ambiente nunca rodam juntos, e nenhum cancela o que está em andamento.
- **Recriar o Kind apaga os dois ambientes juntos.**

## O que muda se revertermos

Para um ambiente só: um overlay, um Environment, e o job de deploy só no push da `main`. Os
repositórios de infraestrutura passam a aplicar um ambiente. Os nomes por ambiente (Neon, Lambda,
SSM, alertas) ficariam com um só valor.

Para um cluster por ambiente: o overlay ganha também o contexto do cluster, o `soat-infra-k8s`
passa a criar dois clusters, e as portas do host deixam de precisar ser diferentes.
